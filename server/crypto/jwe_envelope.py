"""Strict JWE Compact reader for the Eclipse extension; no network or key storage."""

import base64
import binascii
import re

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


HEADER = b'{"alg":"RSA-OAEP-256","enc":"A256GCM"}'
MAX_PLAINTEXT_BYTES = 1024 * 1024
MAX_TOKEN_CHARS = 1_401_000
_PART = re.compile(r"[A-Za-z0-9_-]+\Z", re.ASCII)


class InvalidEnvelope(ValueError):
    """Malformed or unauthenticated encrypted content."""


def _decode(part: str) -> bytes:
    if not _PART.fullmatch(part):
        raise InvalidEnvelope("Invalid encrypted envelope")
    try:
        decoded = base64.urlsafe_b64decode(part + "=" * (-len(part) % 4))
    except (ValueError, binascii.Error):
        raise InvalidEnvelope("Invalid encrypted envelope") from None
    if base64.urlsafe_b64encode(decoded).rstrip(b"=").decode("ascii") != part:
        raise InvalidEnvelope("Invalid encrypted envelope")
    return decoded


def decrypt_compact(token: str, private_key: rsa.RSAPrivateKey) -> bytes:
    """Decrypt only the extension's RSA-OAEP-256/A256GCM profile.

    The caller must load/protect the private key and authenticate the sender.
    Do not log token, key, or returned plaintext.
    """
    if not isinstance(token, str) or len(token) > MAX_TOKEN_CHARS:
        raise InvalidEnvelope("Invalid encrypted envelope")
    if not isinstance(private_key, rsa.RSAPrivateKey) or private_key.key_size < 3072:
        raise ValueError("A private RSA key of at least 3072 bits is required")
    parts = token.split(".")
    if len(parts) != 5 or _decode(parts[0]) != HEADER:
        raise InvalidEnvelope("Invalid encrypted envelope")
    encrypted_key, iv, ciphertext, tag = map(_decode, parts[1:])
    if (len(encrypted_key) != (private_key.key_size + 7) // 8 or len(iv) != 12
        or not 1 <= len(ciphertext) <= MAX_PLAINTEXT_BYTES or len(tag) != 16):
        raise InvalidEnvelope("Invalid encrypted envelope")
    try:
        cek = private_key.decrypt(
            encrypted_key,
            padding.OAEP(mgf=padding.MGF1(algorithm=hashes.SHA256()),
                         algorithm=hashes.SHA256(), label=None),
        )
        if len(cek) != 32:
            raise InvalidEnvelope("Invalid encrypted envelope")
        return AESGCM(cek).decrypt(iv, ciphertext + tag, parts[0].encode("ascii"))
    except (ValueError, InvalidTag):
        raise InvalidEnvelope("Invalid encrypted envelope") from None
