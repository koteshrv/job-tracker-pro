import os
from cryptography.fernet import Fernet
from pathlib import Path

KEY_FILE = Path(__file__).parent / ".encryption_key"

def _get_or_create_key() -> bytes:
    if KEY_FILE.exists():
        with open(KEY_FILE, "rb") as f:
            return f.read()
    else:
        key = Fernet.generate_key()
        with open(KEY_FILE, "wb") as f:
            f.write(key)
        return key

_fernet = Fernet(_get_or_create_key())

def encrypt_value(value: str) -> str:
    if not value:
        return ""
    return _fernet.encrypt(value.encode()).decode()

def decrypt_value(encrypted_value: str) -> str:
    if not encrypted_value:
        return ""
    try:
        return _fernet.decrypt(encrypted_value.encode()).decode()
    except Exception:
        return ""
