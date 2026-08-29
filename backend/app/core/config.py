"""Application configuration management."""

from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Application
    app_name: str = "PSITS Portal V2"
    app_version: str = "0.1.0"
    environment: str = "development"
    debug: bool = False
    log_level: str = "INFO"

    # Database
    database_url: str
    database_pool_size: int = 20
    database_max_overflow: int = 10
    database_pool_pre_ping: bool = True

    # Security (used for signing internal artifacts like QR registration tokens,
    # NOT for user authentication - Supabase Auth owns that)
    secret_key: str

    # Fernet key used to encrypt student TOTP secrets at rest (Profile.totp_secret)
    mfa_encryption_key: str

    # CORS
    cors_origins: str = "http://localhost:5173,http://localhost:3000"
    cors_allow_credentials: bool = True
    cors_allow_methods: str = "*"
    cors_allow_headers: str = "*"

    # Supabase Auth (REQUIRED - the authentication provider)
    supabase_url: str
    supabase_key: str
    supabase_storage_bucket: str = "psits-uploads"

    # Google Sign-In (student login) - required domain students must sign in
    # with; skipped only in the staging environment so testing isn't blocked
    # on having a real @<google_workspace_domain> account.
    google_client_id: str = ""
    google_workspace_domain: str = "usm.edu.ph"

    # Cloudflare Turnstile - bot check in front of the Google sign-in flow's
    # own custom bits (the student-id binding step has no bot protection of
    # its own the way Google's button does).
    turnstile_secret_key: str = ""

    # Email Configuration (Optional)
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_user: Optional[str] = None
    smtp_password: Optional[str] = None

    # File Upload
    max_file_size: int = 10 * 1024 * 1024  # 10 MB
    allowed_extensions: str = "xlsx,xls,csv,jpg,jpeg,png,pdf"

    # Pagination
    default_page_size: int = 50
    max_page_size: int = 100

    # Rate Limiting
    rate_limit_requests: int = 100
    rate_limit_window: int = 60  # seconds

    # Admin Setup (email used to identify the bootstrap System Admin account
    # after they sign up via Supabase Auth)
    admin_email: str = "admin@psits.local"

    # Features
    enable_student_import: bool = True
    enable_notifications: bool = True
    enable_audit_logs: bool = True

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False

    @property
    def cors_origins_list(self) -> list[str]:
        """Parse CORS origins from comma-separated string."""
        return [origin.strip() for origin in self.cors_origins.split(",")]

    @property
    def allowed_extensions_list(self) -> list[str]:
        """Parse allowed file extensions from comma-separated string."""
        return [ext.strip() for ext in self.allowed_extensions.split(",")]


settings = Settings()  # type: ignore
