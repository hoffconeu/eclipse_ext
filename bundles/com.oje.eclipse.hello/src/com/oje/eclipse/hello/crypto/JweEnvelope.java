package com.oje.eclipse.hello.crypto;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.PublicKey;
import java.security.SecureRandom;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.MGF1ParameterSpec;
import java.util.Arrays;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import javax.crypto.spec.OAEPParameterSpec;
import javax.crypto.spec.PSource;

/** A deliberately small JWE Compact writer for RSA-OAEP-256 + A256GCM. */
public final class JweEnvelope {

    private static final byte[] PROTECTED_HEADER =
        "{\"alg\":\"RSA-OAEP-256\",\"enc\":\"A256GCM\"}"
            .getBytes(StandardCharsets.US_ASCII);
    private static final int MAX_PLAINTEXT_BYTES = 1024 * 1024;
    private static final int GCM_TAG_BYTES = 16;
    private static final SecureRandom RANDOM = new SecureRandom();

    private JweEnvelope() {
    }

    public static String encrypt(byte[] plaintext, PublicKey recipientKey)
        throws GeneralSecurityException {
        if (plaintext == null || plaintext.length == 0 || plaintext.length > MAX_PLAINTEXT_BYTES) {
            throw new IllegalArgumentException("Plaintext must contain 1 to 1048576 bytes");
        }
        if (!(recipientKey instanceof RSAPublicKey rsaKey)
            || rsaKey.getModulus().bitLength() < 3072) {
            throw new IllegalArgumentException("Recipient must have an RSA key of at least 3072 bits");
        }

        byte[] cek = new byte[32];
        byte[] iv = new byte[12];
        RANDOM.nextBytes(cek);
        RANDOM.nextBytes(iv);
        try {
            String header = encode(PROTECTED_HEADER);
            Cipher wrap = Cipher.getInstance("RSA/ECB/OAEPPadding");
            wrap.init(Cipher.ENCRYPT_MODE, recipientKey,
                new OAEPParameterSpec("SHA-256", "MGF1", MGF1ParameterSpec.SHA256,
                    PSource.PSpecified.DEFAULT));
            byte[] encryptedKey = wrap.doFinal(cek);

            Cipher content = Cipher.getInstance("AES/GCM/NoPadding");
            content.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(cek, "AES"),
                new GCMParameterSpec(128, iv));
            content.updateAAD(header.getBytes(StandardCharsets.US_ASCII));
            byte[] encrypted = content.doFinal(plaintext);
            int ciphertextLength = encrypted.length - GCM_TAG_BYTES;

            return header + "." + encode(encryptedKey) + "." + encode(iv) + "."
                + encode(Arrays.copyOf(encrypted, ciphertextLength)) + "."
                + encode(Arrays.copyOfRange(encrypted, ciphertextLength, encrypted.length));
        } finally {
            Arrays.fill(cek, (byte) 0);
        }
    }

    private static String encode(byte[] value) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value);
    }
}
