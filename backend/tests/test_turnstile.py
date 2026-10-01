"""Turnstile bot-check: must fail closed outside dev/test when unconfigured,
not silently disable bot protection on a staging/production deployment that
forgot to set TURNSTILE_SECRET_KEY."""

from app.core.turnstile import verify_turnstile
from app.core.config import settings


class TestVerifyTurnstileWithoutSecretKey:
    def test_fails_open_in_development(self, monkeypatch):
        monkeypatch.setattr(settings, "turnstile_secret_key", "")
        monkeypatch.setattr(settings, "environment", "development")
        assert verify_turnstile("whatever-token") is True

    def test_fails_open_in_test(self, monkeypatch):
        monkeypatch.setattr(settings, "turnstile_secret_key", "")
        monkeypatch.setattr(settings, "environment", "test")
        assert verify_turnstile("whatever-token") is True

    def test_fails_closed_in_staging(self, monkeypatch):
        monkeypatch.setattr(settings, "turnstile_secret_key", "")
        monkeypatch.setattr(settings, "environment", "staging")
        assert verify_turnstile("whatever-token") is False

    def test_fails_closed_in_production(self, monkeypatch):
        monkeypatch.setattr(settings, "turnstile_secret_key", "")
        monkeypatch.setattr(settings, "environment", "production")
        assert verify_turnstile("whatever-token") is False
