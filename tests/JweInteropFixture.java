import com.oje.eclipse.hello.crypto.JweEnvelope;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.util.Base64;

/** Prints only a one-time synthetic private key and encrypted test message. */
public final class JweInteropFixture {
    public static void main(String[] args) throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
        generator.initialize(3072);
        KeyPair keys = generator.generateKeyPair();
        System.out.println(Base64.getEncoder().encodeToString(keys.getPrivate().getEncoded()));
        System.out.println(JweEnvelope.encrypt(
            "Synthetic ABAP test: äöü".getBytes(StandardCharsets.UTF_8), keys.getPublic()));
    }
}
