import com.oje.eclipse.hello.crypto.JweEnvelope;
import com.oje.eclipse.hello.crypto.PinnedRecipientKey;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

/** Synthetic interop probe using the bundled test public key, not the editor. */
public final class CryptoTestFixture {
    public static void main(String[] args) throws Exception {
        String pem = Files.readString(Path.of(args[0]), StandardCharsets.US_ASCII);
        byte[] marker = ("OJE-CRYPTO-TEST/v1:123e4567-e89b-42d3-a456-426614174000")
            .getBytes(StandardCharsets.UTF_8);
        System.out.println(JweEnvelope.encrypt(marker, PinnedRecipientKey.fromPem(pem,
            "d04357c3c79fac80b9941136e38f74fa3446c79b5447d21af0850b9606ddc84a")));
    }
}
