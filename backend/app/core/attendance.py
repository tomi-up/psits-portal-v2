"""Shared attendance-timing logic used by both the admin registrations report
and the student's own dashboard, so "late" is defined in exactly one place."""

from datetime import datetime, timedelta, timezone

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


def late_cutoff(event_date: datetime | None) -> datetime | None:
    """event_date is naive PH-local time; time_in is naive-but-UTC. Convert
    the cutoff to UTC before comparing so "late" isn't off by 8 hours."""
    if not event_date:
        return None
    return event_date - timedelta(hours=PH_UTC_OFFSET_HOURS) + timedelta(minutes=LATE_GRACE_MINUTES)


def is_late(time_in: datetime | None, event_date: datetime | None) -> bool:
    cutoff = late_cutoff(event_date)
    return bool(time_in and cutoff and time_in > cutoff)


def finalize_status(raw_status: str, event_status: str) -> str:
    """Once an event is ARCHIVED, a student who scanned in but never scanned
    out is finalized as ABSENT rather than staying indefinitely INCOMPLETE -
    there's no more opportunity for them to complete the scan-out. NO_SHOW
    (never scanned in at all) and PRESENT are unaffected."""
    if event_status == "ARCHIVED" and raw_status == "INCOMPLETE":
        return "ABSENT"
    return raw_status
