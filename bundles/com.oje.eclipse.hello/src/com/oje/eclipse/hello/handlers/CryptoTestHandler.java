package com.oje.eclipse.hello.handlers;

import com.oje.eclipse.hello.crypto.JweEnvelope;
import com.oje.eclipse.hello.crypto.PinnedRecipientKey;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.util.UUID;
import org.eclipse.core.commands.AbstractHandler;
import org.eclipse.core.commands.ExecutionEvent;
import org.eclipse.core.commands.ExecutionException;
import org.eclipse.jface.dialogs.MessageDialog;
import org.eclipse.swt.SWTError;
import org.eclipse.swt.dnd.Clipboard;
import org.eclipse.swt.dnd.TextTransfer;
import org.eclipse.swt.dnd.Transfer;
import org.eclipse.ui.handlers.HandlerUtil;

/** Encrypts a fixed synthetic marker; never reads the editor or network. */
public final class CryptoTestHandler extends AbstractHandler {

    private static final String TEST_KEY_SHA256 =
        "d04357c3c79fac80b9941136e38f74fa3446c79b5447d21af0850b9606ddc84a";

    @Override
    public Object execute(ExecutionEvent event) throws ExecutionException {
        String testId = UUID.randomUUID().toString();
        try (InputStream resource = getClass().getResourceAsStream("/test-recipient-public.txt")) {
            if (resource == null) {
                throw new IOException("Test public key resource is missing");
            }
            String pem = new String(resource.readAllBytes(), StandardCharsets.US_ASCII);
            byte[] marker = ("OJE-CRYPTO-TEST/v1:" + testId).getBytes(StandardCharsets.UTF_8);
            String envelope = JweEnvelope.encrypt(
                marker, PinnedRecipientKey.fromPem(pem, TEST_KEY_SHA256));
            Clipboard clipboard = new Clipboard(HandlerUtil.getActiveShell(event).getDisplay());
            try {
                clipboard.setContents(new Object[] {envelope},
                    new Transfer[] {TextTransfer.getInstance()});
            } finally {
                clipboard.dispose();
            }
            MessageDialog.openInformation(HandlerUtil.getActiveShell(event),
                "OJE Verschluesselungstest",
                "Test-ID: " + testId + "\n\nEin verschluesselter Testtext wurde in die"
                    + " Zwischenablage kopiert. Es wurde kein Editorinhalt gelesen und nichts"
                    + " automatisch gesendet. Bitte auf der geschuetzten Befehlsseite"
                    + " einfuegen und absenden. Keine echten ABAP-Daten verwenden.");
        } catch (IOException | GeneralSecurityException | SWTError error) {
            MessageDialog.openError(HandlerUtil.getActiveShell(event),
                "OJE Verschluesselungstest",
                "Der Testtext konnte nicht sicher verschluesselt oder kopiert werden."
                    + " Es wurde nichts gesendet.");
        }
        return null;
    }
}
