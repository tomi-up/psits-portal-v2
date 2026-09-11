"""Shared attendance-timing logic used by both the admin registrations report
and the student's own dashboard, so "late" is defined in exactly one place."""

from datetime import datetime, timedelta, timezone

# Fallback only. The real threshold is Event.late_threshold_minutes, set per
# event on the admin form; this is what an event created before that column
# existed (or one passed None) falls back to.
LATE_GRACE_MINUTES = 20

# The admin's "Starts At" form field is a plain datetime-local input with no
# timezone info, always entered in Philippine local time for this MVP.
PH_UTC_OFFSET_HOURS = 8


def as_utc(dt: datetime | None) -> datetime | None:
    """DB columns store naive datetimes that are always UTC wall-clock values
    (time_in/time_out); re-attach UTC before serializing so clients correctly
    convert to local time instead of misreading the naive string as-is."""
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def late_cutoff(event_date: datetime | None, threshold_minutes: int | None = None) -> datetime | None:
    """The instant at which arriving counts as late.

    event_date is naive PH-local time; time_in is naive-but-UTC. Convert the
    cutoff to UTC before comparing so "late" isn't off by 8 hours.

    threshold_minutes comes from Event.late_threshold_minutes; None falls back
    to LATE_GRACE_MINUTES for events predating that column.
    """
    if not event_date:
        return None
    minutes = LATE_GRACE_MINUTES if threshold_minutes is None else threshold_minutes
    return event_date - timedelta(hours=PH_UTC_OFFSET_HOURS) + timedelta(minutes=minutes)


def is_late(
    time_in: datetime | None, event_date: datetime | None, threshold_minutes: int | None = None
) -> bool:
    """Boundary rule: the cutoff instant itself is LATE.

    With an 08:30 start and a 20-minute threshold, 08:49:59 is on time and
    08:50:00 is late - i.e. the documented "08:30-08:49 on time, 08:50+ late"
    range, inclusive of the cutoff minute. (This is a deliberate one-second
    change from the previous strictly-greater-than comparison, which treated
    exactly 08:50:00.000 as on time.)
    """
    cutoff = late_cutoff(event_date, threshold_minutes)
    return bool(time_in and cutoff and time_in >= cutoff)


def finalize_status(raw_status: str, event_status: str) -> str:
    """Once an event is ARCHIVED, a student who scanned in but never scanned
    out is finalized as ABSENT rather than staying indefinitely INCOMPLETE -
    there's no more opportunity for them to complete the scan-out. NO_SHOW
    (never scanned in at all) and PRESENT are unaffected.

    LATE and FOR_REVIEW (3-checkpoint events) are also unaffected: LATE is
    already a final answer, and FOR_REVIEW must never collapse into ABSENT
    without a human looking - that is the entire point of the status.
    """
    if event_status == "ARCHIVED" and raw_status == "INCOMPLETE":
        return "ABSENT"
    return raw_status
