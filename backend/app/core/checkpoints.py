"""The one place the 3-checkpoint attendance workflow is decided.

Everything that needs to know "which checkpoint is open?", "may this phase
change happen?", or "what does this student's set of scans add up to?" calls
in here - the scanner endpoint, the admin phase control, the registrations
table, the Excel export, and the archive/finalisation path. Duplicating any of
these rules elsewhere is how an attendance system ends up telling a student
one thing on their dashboard and the officer another.

Nothing in this module touches the database.
"""

from app.models.event import ATTENDANCE_PHASES

# Phase -> the single phase it may advance to. Absence from this map means
# terminal. Forward-only and one step at a time: IN -> OUT would skip the
# MIDDLE sweep that the whole workflow exists to enforce, and MIDDLE -> IN
# would let an officer reopen a closed checkpoint after seeing who missed it.
_NEXT_PHASE = {
    "NOT_STARTED": "IN",
    "IN": "IN_CLOSED",
    "IN_CLOSED": "MIDDLE",
    "MIDDLE": "MIDDLE_CLOSED",
    "MIDDLE_CLOSED": "OUT",
    "OUT": "CLOSED",
}

# Phases during which scanning is possible, mapped to the checkpoint recorded.
# The scanner never chooses this - the event's phase does.
_PHASE_CHECKPOINT = {"IN": "IN", "MIDDLE": "MIDDLE", "OUT": "OUT"}

# Label shown on the admin's advance button for each phase.
PHASE_ACTION_LABELS = {
    "NOT_STARTED": "Open IN",
    "IN": "Close IN",
    "IN_CLOSED": "Open MIDDLE",
    "MIDDLE": "Close MIDDLE",
    "MIDDLE_CLOSED": "Open OUT",
    "OUT": "Close OUT",
}

PHASE_LABELS = {
    "NOT_STARTED": "Not Started",
    "IN": "IN Open",
    "IN_CLOSED": "IN Closed",
    "MIDDLE": "MIDDLE Open",
    "MIDDLE_CLOSED": "MIDDLE Closed",
    "OUT": "OUT Open",
    "CLOSED": "Attendance Closed",
}


def is_valid_phase(phase: str) -> bool:
    return phase in ATTENDANCE_PHASES


def next_phase(current: str) -> str | None:
    """The only phase `current` is allowed to move to, or None if terminal."""
    return _NEXT_PHASE.get(current)


def active_checkpoint(phase: str) -> str | None:
    """Which checkpoint scanning records right now, or None if none is open."""
    return _PHASE_CHECKPOINT.get(phase)


def uses_checkpoints(phase: str) -> bool:
    """Whether this event has entered the checkpoint workflow at all.

    An event still sitting at NOT_STARTED is indistinguishable from every
    event that existed before this feature, so it keeps the legacy two-scan
    evaluation and its statuses untouched.
    """
    return phase != "NOT_STARTED"


def evaluate_checkpoint_attendance(scanned: set[str] | frozenset[str]) -> str | None:
    """Turn a student's set of completed checkpoints into an attendance status.

        IN + MIDDLE + OUT  -> PRESENT      attended the whole event
        MIDDLE + OUT       -> LATE         missed the IN sweep, was there after
        IN + OUT           -> FOR_REVIEW   ambiguous: may have left and returned
        OUT only           -> FOR_REVIEW   ambiguous: only seen on the way out
        IN                 -> INCOMPLETE   never scanned out (legacy behaviour)
        IN + MIDDLE        -> INCOMPLETE   never scanned out
        MIDDLE only        -> INCOMPLETE   never scanned out
        (nothing)          -> None         caller applies NO_SHOW/ABSENT/etc.

    FOR_REVIEW deliberately never becomes ABSENT on its own. Both ambiguous
    cases have innocent explanations an officer can confirm, and silently
    sanctioning a student for one is worse than making an admin look.

    Returns None - not a status - when there are no scans at all, because
    "this student was never scanned" is not a checkpoint outcome: it's the
    existing NO_SHOW / NOT_REGISTERED / EXCUSED / ABSENT lifecycle, which this
    function has no business overriding.
    """
    has_in = "IN" in scanned
    has_middle = "MIDDLE" in scanned
    has_out = "OUT" in scanned

    if not (has_in or has_middle or has_out):
        return None

    if not has_out:
        # Seen at the event but never scanned out - exactly what INCOMPLETE
        # has always meant, so it keeps meaning that.
        return "INCOMPLETE"

    if has_in and has_middle:
        return "PRESENT"
    if has_middle:
        return "LATE"
    return "FOR_REVIEW"


def checkpoint_times(scans: list) -> tuple:
    """(time_in, time_out) to mirror onto the Attendance row from its scans.

    Keeping these two columns populated is what lets every existing consumer -
    the Excel export, the student dashboard, survey eligibility, the scanner
    stats counters - keep reading Attendance exactly as it did before
    checkpoints existed, instead of each learning the new table.

    time_in is the IN scan when there is one, otherwise the earliest scan
    there is: a student who only made MIDDLE and OUT still physically arrived,
    and leaving time_in null would misreport them as never having shown up.
    """
    by_checkpoint = {s.checkpoint: s.scanned_at for s in scans}
    time_in = by_checkpoint.get("IN")
    if time_in is None and scans:
        time_in = min(s.scanned_at for s in scans)
    return time_in, by_checkpoint.get("OUT")
