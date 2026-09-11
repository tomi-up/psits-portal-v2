"""The attendance evaluation truth table, and the phase transition rules.

These are pure-function tests with no database - which is the point of having
app/core/checkpoints.py be pure. Every endpoint, the export, and the admin
table all route their decision through these same functions.
"""

import pytest

from app.core.attendance import finalize_status, is_late
from app.core.checkpoints import (
    active_checkpoint,
    evaluate_checkpoint_attendance,
    next_phase,
    uses_checkpoints,
)


class TestEvaluateCheckpointAttendance:
    def test_all_three_checkpoints_is_present(self):
        assert evaluate_checkpoint_attendance({"IN", "MIDDLE", "OUT"}) == "PRESENT"

    def test_missing_in_is_late(self):
        """Arrived after the IN sweep but was there for MIDDLE and OUT."""
        assert evaluate_checkpoint_attendance({"MIDDLE", "OUT"}) == "LATE"

    def test_missing_middle_is_for_review(self):
        """Ambiguous - could have left and come back for the OUT scan."""
        assert evaluate_checkpoint_attendance({"IN", "OUT"}) == "FOR_REVIEW"

    def test_only_out_is_for_review(self):
        assert evaluate_checkpoint_attendance({"OUT"}) == "FOR_REVIEW"

    def test_in_only_is_incomplete(self):
        """Preserves the existing meaning of INCOMPLETE: never scanned out."""
        assert evaluate_checkpoint_attendance({"IN"}) == "INCOMPLETE"

    def test_in_and_middle_is_incomplete(self):
        assert evaluate_checkpoint_attendance({"IN", "MIDDLE"}) == "INCOMPLETE"

    def test_middle_only_is_incomplete(self):
        """Not enumerated in the spec; treated like every other 'no OUT' case."""
        assert evaluate_checkpoint_attendance({"MIDDLE"}) == "INCOMPLETE"

    def test_no_scans_returns_none(self):
        """None, not ABSENT - the caller owns the NO_SHOW/ABSENT/NOT_REGISTERED
        /EXCUSED lifecycle and this function must not override it."""
        assert evaluate_checkpoint_attendance(set()) is None

    def test_for_review_never_becomes_absent_on_archive(self):
        assert finalize_status("FOR_REVIEW", "ARCHIVED") == "FOR_REVIEW"

    def test_late_survives_archive(self):
        assert finalize_status("LATE", "ARCHIVED") == "LATE"

    def test_incomplete_still_becomes_absent_on_archive(self):
        """Existing behaviour, unchanged."""
        assert finalize_status("INCOMPLETE", "ARCHIVED") == "ABSENT"
        assert finalize_status("INCOMPLETE", "ACTIVE") == "INCOMPLETE"


class TestPhaseTransitions:
    def test_forward_sequence(self):
        assert next_phase("NOT_STARTED") == "IN"
        assert next_phase("IN") == "IN_CLOSED"
        assert next_phase("IN_CLOSED") == "MIDDLE"
        assert next_phase("MIDDLE") == "MIDDLE_CLOSED"
        assert next_phase("MIDDLE_CLOSED") == "OUT"
        assert next_phase("OUT") == "CLOSED"

    def test_closed_is_terminal(self):
        assert next_phase("CLOSED") is None

    def test_no_phase_skips_to_out(self):
        """IN -> OUT would skip the MIDDLE sweep the workflow exists for."""
        assert next_phase("IN") != "OUT"

    def test_no_going_backwards(self):
        for phase in ("MIDDLE", "MIDDLE_CLOSED", "OUT", "CLOSED"):
            assert next_phase(phase) not in ("IN", "NOT_STARTED")

    def test_active_checkpoint_only_during_open_phases(self):
        assert active_checkpoint("IN") == "IN"
        assert active_checkpoint("MIDDLE") == "MIDDLE"
        assert active_checkpoint("OUT") == "OUT"
        for closed in ("NOT_STARTED", "IN_CLOSED", "MIDDLE_CLOSED", "CLOSED"):
            assert active_checkpoint(closed) is None

    def test_not_started_means_legacy_event(self):
        assert uses_checkpoints("NOT_STARTED") is False
        assert uses_checkpoints("IN") is True
        assert uses_checkpoints("CLOSED") is True


class TestDynamicLateThreshold:
    """Event starts 08:30 PH; threshold configurable per event.

    event_date is naive PH-local, time_in is naive-but-UTC, so an 08:30 PH
    start is 00:30 UTC. The tests below express arrival times in UTC to match
    what actually lands in the column.
    """

    EVENT_START = __import__("datetime").datetime(2026, 9, 1, 8, 30)  # PH local

    def _utc(self, hour, minute, second=0):
        from datetime import datetime

        return datetime(2026, 9, 1, hour - 8, minute, second)

    def test_before_cutoff_is_on_time(self):
        assert is_late(self._utc(8, 49, 59), self.EVENT_START, 20) is False

    def test_exactly_at_cutoff_is_late(self):
        """Documented boundary: with a 20-minute threshold on an 08:30 start,
        08:30-08:49 is on time and 08:50:00 onwards is late."""
        assert is_late(self._utc(8, 50, 0), self.EVENT_START, 20) is True

    def test_after_cutoff_is_late(self):
        assert is_late(self._utc(8, 51), self.EVENT_START, 20) is True

    def test_threshold_is_not_hardcoded_to_twenty(self):
        # Same arrival, different per-event threshold, different answer.
        arrival = self._utc(8, 40)
        assert is_late(arrival, self.EVENT_START, 5) is True
        assert is_late(arrival, self.EVENT_START, 30) is False

    def test_zero_threshold_means_start_time_is_the_cutoff(self):
        assert is_late(self._utc(8, 30, 0), self.EVENT_START, 0) is True
        assert is_late(self._utc(8, 29, 59), self.EVENT_START, 0) is False

    def test_falls_back_to_default_when_threshold_missing(self):
        assert is_late(self._utc(8, 45), self.EVENT_START, None) is False
        assert is_late(self._utc(8, 55), self.EVENT_START, None) is True

    def test_no_event_date_is_never_late(self):
        assert is_late(self._utc(8, 55), None, 20) is False

    def test_middle_checkpoint_timing_does_not_affect_lateness(self):
        """Lateness is a function of scheduled_start + threshold only. The
        MIDDLE checkpoint has no scheduled time at all, by design, so it can
        never be an input here - this test exists to pin that down."""
        from app.core.attendance import late_cutoff

        cutoff = late_cutoff(self.EVENT_START, 20)
        # 00:50 UTC == 08:50 PH == start + 20min, with no MIDDLE involved.
        assert cutoff.hour == 0 and cutoff.minute == 50
