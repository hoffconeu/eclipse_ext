"""Java encryption -> Python decryption with ephemeral, synthetic keys only."""

import base64
from pathlib import Path
import subprocess
import tempfile
import unittest

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from server.crypto.jwe_envelope import InvalidEnvelope, decrypt_compact


ROOT = Path(__file__).resolve().parents[1]
JAVA_SOURCES = [
    ROOT / "bundles/com.oje.eclipse.hello/src/com/oje/eclipse/hello/crypto/JweEnvelope.java",
    ROOT / "bundles/com.oje.eclipse.hello/src/com/oje/eclipse/hello/crypto/PinnedRecipientKey.java",
    ROOT / "tests/JweEnvelopeSelfTest.java",
    ROOT / "tests/JweInteropFixture.java",
]


class JweInteropTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with tempfile.TemporaryDirectory() as build_dir:
            subprocess.run(["javac", "-d", build_dir, *map(str, JAVA_SOURCES)], check=True)
            subprocess.run(["java", "-cp", build_dir, "JweEnvelopeSelfTest"], check=True)
            result = subprocess.run(
                ["java", "-cp", build_dir, "JweInteropFixture"],
                check=True, capture_output=True, text=True,
            )
        encoded_key, cls.token = result.stdout.splitlines()
        cls.private_key = serialization.load_der_private_key(base64.b64decode(encoded_key), None)

    def test_java_to_python(self):
        self.assertEqual(
            decrypt_compact(self.token, self.private_key),
            "Synthetic ABAP test: äöü".encode("utf-8"),
        )

    def test_tampered_ciphertext_rejected(self):
        parts = self.token.split(".")
        parts[3] = ("A" if parts[3][0] != "A" else "B") + parts[3][1:]
        with self.assertRaises(InvalidEnvelope):
            decrypt_compact(".".join(parts), self.private_key)

    def test_wrong_key_rejected(self):
        wrong = rsa.generate_private_key(public_exponent=65537, key_size=3072)
        with self.assertRaises(InvalidEnvelope):
            decrypt_compact(self.token, wrong)

    def test_malformed_header_rejected(self):
        parts = self.token.split(".")
        parts[0] = base64.urlsafe_b64encode(b'{"alg":"none"}').decode().rstrip("=")
        with self.assertRaises(InvalidEnvelope):
            decrypt_compact(".".join(parts), self.private_key)

    def test_oversized_envelope_rejected(self):
        with self.assertRaises(InvalidEnvelope):
            decrypt_compact("A" * 1_401_001, self.private_key)


if __name__ == "__main__":
    unittest.main()
