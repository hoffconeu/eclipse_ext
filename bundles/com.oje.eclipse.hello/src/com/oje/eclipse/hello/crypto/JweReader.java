package com.oje.eclipse.hello.crypto;

import java.nio.charset.StandardCharsets;
import java.security.PrivateKey;
import java.security.spec.MGF1ParameterSpec;
import java.util.Arrays;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.OAEPParameterSpec;
import javax.crypto.spec.PSource;
import javax.crypto.spec.SecretKeySpec;

/** Strict counterpart to JweEnvelope for short-lived proposal messages. */
public final class JweReader {
    private JweReader() { }

    public static byte[] decrypt(String compact, PrivateKey key) throws Exception {
        if (compact == null || compact.length() > 2_000_000) throw new SecurityException("Invalid envelope size");
        String[] parts = compact.split("\\.", -1);
        if (parts.length != 5) throw new SecurityException("Invalid envelope");
        for (String part : parts) if (!part.matches("[A-Za-z0-9_-]+")) throw new SecurityException("Invalid envelope");
        String header = new String(Base64.getUrlDecoder().decode(parts[0]), StandardCharsets.US_ASCII);
        if (!"{\"alg\":\"RSA-OAEP-256\",\"enc\":\"A256GCM\"}".equals(header))
            throw new SecurityException("Unsupported envelope");
        byte[] iv = Base64.getUrlDecoder().decode(parts[2]);
        byte[] tag = Base64.getUrlDecoder().decode(parts[4]);
        if (iv.length != 12 || tag.length != 16) throw new SecurityException("Invalid envelope parameters");
        Cipher unwrap = Cipher.getInstance("RSA/ECB/OAEPPadding");
        unwrap.init(Cipher.DECRYPT_MODE, key, new OAEPParameterSpec("SHA-256", "MGF1",
            MGF1ParameterSpec.SHA256, PSource.PSpecified.DEFAULT));
        byte[] cek = unwrap.doFinal(Base64.getUrlDecoder().decode(parts[1]));
        try {
            if (cek.length != 32) throw new SecurityException("Invalid content key");
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(cek, "AES"), new GCMParameterSpec(128, iv));
            cipher.updateAAD(parts[0].getBytes(StandardCharsets.US_ASCII));
            byte[] ciphertext = Base64.getUrlDecoder().decode(parts[3]);
            byte[] combined = Arrays.copyOf(ciphertext, ciphertext.length + tag.length);
            System.arraycopy(tag, 0, combined, ciphertext.length, tag.length);
            byte[] result = cipher.doFinal(combined);
            if (result.length > 1_048_576) throw new SecurityException("Proposal too large");
            return result;
        } finally { Arrays.fill(cek, (byte) 0); }
    }
}
