#!/usr/bin/env python3
"""Check one encrypted synthetic Eclipse test receipt without printing payloads."""

import argparse
from pathlib import Path
import re
import sys

from cryptography.hazmat.primitives import serialization

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from server.crypto.jwe_envelope import InvalidEnvelope, decrypt_compact  # noqa: E402


TOKEN = re.compile(r"^([A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+){4})$", re.MULTILINE)
MARKER = re.compile(rb"OJE-CRYPTO-TEST/v1:([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\Z")


def verify_message(message: str, private_key) -> str:
    tokens = TOKEN.findall(message)
    if len(tokens) != 1:
        raise InvalidEnvelope("Expected exactly one encrypted test envelope")
    plaintext = decrypt_compact(tokens[0], private_key)
    match = MARKER.fullmatch(plaintext)
    if not match:
        raise InvalidEnvelope("Not a synthetic OJE crypto test")
    return match.group(1).decode("ascii")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--message-file", required=True, type=Path)
    parser.add_argument("--private-key", required=True, type=Path)
    args = parser.parse_args()
    if str(args.message_file) == "-":
        message = sys.stdin.read(5 * 1024 * 1024 + 1)
    else:
        if args.message_file.stat().st_size > 5 * 1024 * 1024:
            parser.error("Message is too large")
        message = args.message_file.read_text(encoding="utf-8")
    if len(message.encode("utf-8")) > 5 * 1024 * 1024:
        parser.error("Message is too large")
    private_key = serialization.load_pem_private_key(
        args.private_key.read_bytes(), password=None)
    try:
        test_id = verify_message(message, private_key)
    except (InvalidEnvelope, UnicodeError):
        print("Crypto test invalid or decryption failed", file=sys.stderr)
        return 1
    print(f"Crypto test OK; test ID: {test_id}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
