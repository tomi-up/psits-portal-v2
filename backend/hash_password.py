#!/usr/bin/env python
"""Interactively create a bcrypt hash without storing or echoing a password."""

from getpass import getpass

from app.core.security import hash_password


def main() -> None:
    password = getpass("Password: ")
    confirmation = getpass("Confirm password: ")
    if password != confirmation:
        raise SystemExit("Passwords do not match")

    print(hash_password(password))


if __name__ == "__main__":
    main()
