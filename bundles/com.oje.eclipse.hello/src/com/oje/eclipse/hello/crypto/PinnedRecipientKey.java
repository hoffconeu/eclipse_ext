package com.oje.eclipse.hello.crypto;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.MessageDigest;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;
import java.util.HexFormat;

/** Loads an RSA public key only when its independently supplied SPKI hash matches. */
public final class PinnedRecipientKey {

    private static final String BEGIN = "-----BEGIN PUBLIC KEY-----";
    private static final String END = "-----END PUBLIC KEY-----";

    private PinnedRecipientKey() {
    }

    /** expectedSha256Hex is the 64-digit SHA-256 of DER SubjectPublicKeyInfo. */
    public static RSAPublicKey fromPem(String pem, String expectedSha256Hex)
        throws GeneralSecurityException {
        if (pem == null || expectedSha256Hex == null
            || !expectedSha256Hex.matches("[0-9a-fA-F]{64}")) {
            throw new IllegalArgumentException("A public key and a 64-digit SHA-256 pin are required");
        }
        String trimmed = pem.trim();
        if (!trimmed.startsWith(BEGIN) || !trimmed.endsWith(END)) {
            throw new IllegalArgumentException("Expected one PEM SubjectPublicKeyInfo block");
        }
        String body = trimmed.substring(BEGIN.length(), trimmed.length() - END.length());
        if (!body.matches("[A-Za-z0-9+/=\\s]+")) {
            throw new IllegalArgumentException("Invalid PEM public key body");
        }
        byte[] der;
        try {
            der = Base64.getMimeDecoder().decode(body.getBytes(StandardCharsets.US_ASCII));
        } catch (IllegalArgumentException invalid) {
            throw new IllegalArgumentException("Invalid PEM public key encoding", invalid);
        }
        if (der.length > 8192) {
            throw new IllegalArgumentException("Public key is too large");
        }
        byte[] expected = HexFormat.of().parseHex(expectedSha256Hex);
        byte[] actual = MessageDigest.getInstance("SHA-256").digest(der);
        if (!MessageDigest.isEqual(expected, actual)) {
            throw new GeneralSecurityException("Recipient public key fingerprint mismatch");
        }
        if (!(KeyFactory.getInstance("RSA").generatePublic(new X509EncodedKeySpec(der))
            instanceof RSAPublicKey key) || key.getModulus().bitLength() < 3072) {
            throw new GeneralSecurityException("Recipient RSA key must be at least 3072 bits");
        }
        return key;
    }
}
