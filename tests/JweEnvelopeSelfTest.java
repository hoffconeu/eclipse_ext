import com.oje.eclipse.hello.crypto.JweEnvelope;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.RSAPrivateKey;
import java.security.spec.MGF1ParameterSpec;
import java.util.Arrays;
import java.util.Base64;
import javax.crypto.AEADBadTagException;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.OAEPParameterSpec;
import javax.crypto.spec.PSource;
import javax.crypto.spec.SecretKeySpec;

/** Dependency-free compatibility and tamper smoke test for the JWE writer. */
public final class JweEnvelopeSelfTest {
    public static void main(String[] args) throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
        generator.initialize(3072);
        KeyPair recipient = generator.generateKeyPair();
        byte[] message = "ABAP test data only: äöü".getBytes(StandardCharsets.UTF_8);
        String token = JweEnvelope.encrypt(message, recipient.getPublic());
        String[] parts = token.split("\\.", -1);
        require(parts.length == 5, "JWE must have five parts");
        require("{\"alg\":\"RSA-OAEP-256\",\"enc\":\"A256GCM\"}"
            .equals(new String(decode(parts[0]), StandardCharsets.US_ASCII)), "unexpected header");
        require(decode(parts[2]).length == 12, "IV must be 96 bits");
        require(decode(parts[4]).length == 16, "tag must be 128 bits");

        Cipher unwrap = Cipher.getInstance("RSA/ECB/OAEPPadding");
        unwrap.init(Cipher.DECRYPT_MODE, (RSAPrivateKey) recipient.getPrivate(),
            new OAEPParameterSpec("SHA-256", "MGF1", MGF1ParameterSpec.SHA256,
                PSource.PSpecified.DEFAULT));
        byte[] cek = unwrap.doFinal(decode(parts[1]));
        require(cek.length == 32, "CEK must be 256 bits");
        byte[] authenticatedPayload = concat(decode(parts[3]), decode(parts[4]));
        Cipher content = Cipher.getInstance("AES/GCM/NoPadding");
        content.init(Cipher.DECRYPT_MODE, new SecretKeySpec(cek, "AES"),
            new GCMParameterSpec(128, decode(parts[2])));
        content.updateAAD(parts[0].getBytes(StandardCharsets.US_ASCII));
        require(Arrays.equals(message, content.doFinal(authenticatedPayload)),
            "round-trip plaintext mismatch");

        authenticatedPayload[0] ^= 1;
        Cipher tampered = Cipher.getInstance("AES/GCM/NoPadding");
        tampered.init(Cipher.DECRYPT_MODE, new SecretKeySpec(cek, "AES"),
            new GCMParameterSpec(128, decode(parts[2])));
        tampered.updateAAD(parts[0].getBytes(StandardCharsets.US_ASCII));
        try {
            tampered.doFinal(authenticatedPayload);
            throw new AssertionError("tampered payload was accepted");
        } catch (AEADBadTagException expected) {
            // Authentication correctly rejected a modified ciphertext.
        }

        require(!token.equals(JweEnvelope.encrypt(message, recipient.getPublic())),
            "encryption must use fresh randomness");
        System.out.println("JWE self-test passed");
    }

    private static byte[] decode(String value) {
        return Base64.getUrlDecoder().decode(value);
    }

    private static byte[] concat(byte[] left, byte[] right) {
        byte[] result = Arrays.copyOf(left, left.length + right.length);
        System.arraycopy(right, 0, result, left.length, right.length);
        return result;
    }

    private static void require(boolean condition, String reason) {
        if (!condition) {
            throw new AssertionError(reason);
        }
    }
}
