#!/usr/bin/env python
import bcrypt

pwd = 'USMPsits@2026'
pwd_bytes = pwd.encode('utf-8')
print(f'Password: {pwd}')
print(f'Password bytes: {len(pwd_bytes)}')

salt = bcrypt.gensalt(rounds=12)
hashed = bcrypt.hashpw(pwd_bytes, salt)
print(f'Bcrypt hash: {hashed.decode("utf-8")}')
print(f'Hash length: {len(hashed.decode("utf-8"))}')
