package com.oje.eclipse.hello.bridge;

import com.oje.eclipse.hello.crypto.JweEnvelope;
import com.oje.eclipse.hello.crypto.JweReader;
import com.oje.eclipse.hello.crypto.PinnedRecipientKey;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.MessageDigest;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HexFormat;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import org.eclipse.equinox.security.storage.ISecurePreferences;
import org.eclipse.equinox.security.storage.SecurePreferencesFactory;
import org.eclipse.jface.text.IDocument;
import org.eclipse.jface.text.BadLocationException;
import org.eclipse.swt.custom.StyledText;
import org.eclipse.swt.widgets.Display;
import org.eclipse.swt.widgets.Shell;
import org.eclipse.swt.widgets.Label;
import org.eclipse.swt.widgets.Button;
import org.eclipse.swt.layout.GridLayout;
import org.eclipse.swt.layout.GridData;
import org.eclipse.swt.SWT;
import org.eclipse.jface.dialogs.MessageDialog;
import org.eclipse.ui.IEditorPart;
import org.eclipse.ui.IEditorReference;
import org.eclipse.ui.IWorkbenchWindow;
import org.eclipse.ui.PlatformUI;
import org.eclipse.ui.texteditor.ITextEditor;

/** Opt-in Eclipse bridge. Inbound proposals edit a buffer only after explicit local acceptance. */
public final class BridgeClient {
    private static final BridgeClient INSTANCE = new BridgeClient();
    private static final String BASE = "https://eclipse-ext.pages.dev/eclipse-device-api?action=";
    private static final String RECIPIENT_PIN = "a5d565c67dd4bcd67317ab2e32db843cf732e51c383f7403d3dcc43921643c7e";
    private static final String SERVER_PIN = "8d52a5d0abc7cee905afd3693dbf3c5f76cabf89e315f41154e0d3fa27e8c466";
    private static final String TITLE_MARK = " [OJE Codex: LESEN AKTIV]";
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread thread = new Thread(r, "OJE Codex bridge poll"); thread.setDaemon(true); return thread;
    });
    private final Map<IEditorPart, String> editorIds = new IdentityHashMap<>();
    private final Map<IWorkbenchWindow, String> titles = new IdentityHashMap<>();
    private volatile boolean active;
    private ScheduledFuture<?> polling;
    private PublicKey serverPublic;
    private PublicKey recipientPublic;
    private PrivateKey devicePrivate;
    private String deviceId;
    private volatile PrivateKey proposalPrivate;
    private final Set<String> seenProposals = ConcurrentHashMap.newKeySet();

    private BridgeClient() { }
    public static BridgeClient get() { return INSTANCE; }
    public boolean isActive() { return active; }
    public static String recipientFingerprint() { return RECIPIENT_PIN; }
    public static String serverFingerprint() { return SERVER_PIN; }

    public synchronized String pair() throws Exception {
        if (active) throw new IllegalStateException("Lesezugriff vor einer erneuten Kopplung stoppen.");
        loadPinnedKeys();
        KeyPair keys = KeyPairGenerator.getInstance("Ed25519").generateKeyPair();
        String pem = "-----BEGIN PUBLIC KEY-----\n"
            + Base64.getMimeEncoder(64, new byte[] {'\n'}).encodeToString(keys.getPublic().getEncoded())
            + "\n-----END PUBLIC KEY-----";
        HttpResponse<String> response = send("POST", "init", pem, null, null);
        if (response.statusCode() != 200) throw new IllegalStateException("Kopplung nicht erreichbar");
        String[] parts = response.body().split("\\n");
        if (parts.length != 2 || !parts[0].matches("[A-Za-z0-9_-]{24}")
            || !parts[1].matches("[0-9]{8}")) throw new IllegalStateException("Ungueltige Kopplungsantwort");
        ISecurePreferences node = SecurePreferencesFactory.getDefault().node("com.oje.eclipse.hello/bridge");
        node.put("deviceId", parts[0], true);
        node.put("devicePrivate", Base64.getEncoder().encodeToString(keys.getPrivate().getEncoded()), true);
        deviceId = parts[0]; devicePrivate = keys.getPrivate();
        return parts[1];
    }

    public synchronized void start() throws Exception {
        if (active) return;
        loadPinnedKeys(); loadDevice();
        KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
        generator.initialize(3072);
        KeyPair proposalKeys = generator.generateKeyPair();
        String proposalPem = "-----BEGIN PUBLIC KEY-----\n"
            + Base64.getMimeEncoder(64, new byte[] {'\n'}).encodeToString(proposalKeys.getPublic().getEncoded())
            + "\n-----END PUBLIC KEY-----";
        HttpResponse<String> response = send("POST", "session", "start\n" + proposalPem, deviceId, devicePrivate);
        if (response.statusCode() != 200) throw new IllegalStateException(
            "Geraet noch nicht gekoppelt. Code auf der Access-Seite bestaetigen und erneut starten.");
        active = true;
        proposalPrivate = proposalKeys.getPrivate();
        seenProposals.clear();
        Display.getDefault().syncExec(this::updateTitles);
        polling = scheduler.scheduleWithFixedDelay(this::pollSafely, 0, 2, TimeUnit.SECONDS);
    }

    public synchronized void stop() {
        active = false;
        proposalPrivate = null;
        seenProposals.clear();
        if (polling != null) polling.cancel(false);
        Display.getDefault().syncExec(this::updateTitles);
        if (deviceId != null && devicePrivate != null) {
            scheduler.execute(() -> {
                try { send("POST", "session", "stop", deviceId, devicePrivate); } catch (Exception ignored) { }
            });
        }
    }

    private void pollSafely() {
        if (!active) return;
        try {
            HttpResponse<String> response = send("GET", "poll", "", deviceId, devicePrivate);
            if (response.statusCode() != 200) return;
            for (String line : response.body().split("\\n")) {
                if (line.isBlank() || !active) continue;
                String[] fields = line.split("\\t", -1);
                if (fields.length == 3 && "P".equals(fields[0])) {
                    receiveProposal(fields[1], fields[2]);
                    continue;
                }
                if (fields.length < 2 || !fields[0].matches("[a-f0-9-]{36}")) continue;
                String payload = capture(fields);
                if (payload == null || !active) continue;
                byte[] bytes = payload.getBytes(StandardCharsets.UTF_8);
                if (bytes.length > 1_048_576) bytes = error(fields[0], "too_large").getBytes(StandardCharsets.UTF_8);
                String envelope = JweEnvelope.encrypt(bytes, recipientPublic);
                send("POST", "respond/" + fields[0], envelope, deviceId, devicePrivate);
            }
            Display.getDefault().asyncExec(this::updateTitles);
        } catch (Exception ignored) {
            // Keep the grant local; no fallback or plaintext transport on network failure.
        }
    }

    private String capture(String[] fields) {
        final String[] result = new String[1];
        Display display = Display.getDefault();
        if (display.isDisposed()) return null;
        display.syncExec(() -> {
            if (!active) return;
            List<Editor> open = openEditors();
            String id = fields[0];
            if (fields.length == 2 && "list".equals(fields[1])) {
                StringBuilder json = new StringBuilder("{\"requestId\":").append(quote(id))
                    .append(",\"kind\":\"list\",\"items\":[");
                for (Editor editor : open) {
                    if (json.charAt(json.length() - 1) != '[') json.append(',');
                    json.append("{\"id\":").append(quote(editor.id)).append(",\"title\":")
                        .append(quote(editor.part.getTitle())).append(",\"dirty\":")
                        .append(editor.part.isDirty()).append('}');
                }
                result[0] = json.append("]}").toString();
            } else if (fields.length == 3 && "read".equals(fields[1])) {
                for (Editor editor : open) {
                    if (!editor.id.equals(fields[2])) continue;
                    IDocument document = editor.text.getDocumentProvider().getDocument(editor.part.getEditorInput());
                    if (document == null) break;
                    String content = document.get();
                    result[0] = "{\"requestId\":" + quote(id) + ",\"kind\":\"read\",\"editorId\":"
                        + quote(editor.id) + ",\"title\":" + quote(editor.part.getTitle())
                        + ",\"dirty\":" + editor.part.isDirty() + ",\"sha256\":"
                        + quote(sha256(content)) + ",\"text\":" + quote(content) + "}";
                    return;
                }
                result[0] = error(id, "editor_closed_or_unreadable");
            }
        });
        return result[0];
    }

    private List<Editor> openEditors() {
        List<Editor> result = new ArrayList<>();
        for (IWorkbenchWindow window : PlatformUI.getWorkbench().getWorkbenchWindows()) {
            for (var page : window.getPages()) for (IEditorReference ref : page.getEditorReferences()) {
                IEditorPart part = ref.getEditor(false);
                if (part == null) continue;
                ITextEditor text = part instanceof ITextEditor direct ? direct : part.getAdapter(ITextEditor.class);
                if (text == null || text.getDocumentProvider() == null
                    || text.getDocumentProvider().getDocument(part.getEditorInput()) == null) continue;
                String id = editorIds.computeIfAbsent(part, ignored -> UUID.randomUUID().toString().replace("-", ""));
                result.add(new Editor(id, part, text));
            }
        }
        return result;
    }

    private void receiveProposal(String id, String envelope) throws Exception {
        if (!id.matches("[a-f0-9-]{36}") || seenProposals.contains(id) || proposalPrivate == null) return;
        byte[] plain = JweReader.decrypt(envelope, proposalPrivate);
        String[] parts = new String(plain, StandardCharsets.UTF_8).split("\n", -1);
        if (parts.length != 6 || !id.equals(parts[0]) || !parts[1].matches("[a-f0-9]{32}")
            || !parts[2].matches("[a-f0-9]{64}") || !parts[3].matches("[0-9]{13}")
            || Math.abs(System.currentTimeMillis() - Long.parseLong(parts[3])) > 120_000) return;
        String summary = new String(Base64.getDecoder().decode(parts[4]), StandardCharsets.UTF_8);
        String suggested = new String(Base64.getDecoder().decode(parts[5]), StandardCharsets.UTF_8);
        if (summary.length() > 500 || suggested.length() > 1_048_576) return;
        seenProposals.add(id);
        Display display = Display.getDefault();
        if (display.isDisposed()) return;
        display.asyncExec(() -> showProposal(parts[1], parts[2], summary, suggested));
        send("POST", "ack/" + id, "", deviceId, devicePrivate);
    }

    private void showProposal(String editorId, String baseHash, String summary, String suggested) {
        if (!active || Display.getDefault().isDisposed()) return;
        for (Editor editor : openEditors()) {
            if (!editor.id.equals(editorId)) continue;
            IDocument document = editor.text.getDocumentProvider().getDocument(editor.part.getEditorInput());
            if (document == null || !baseHash.equals(sha256(document.get()))) {
                MessageDialog.openWarning(Display.getDefault().getActiveShell(), "Oje.me Vorschlag",
                    "Der Editor hat sich seit dem Lesen geaendert. Vorschlag verworfen; bitte erneut lesen.");
                return;
            }
            Shell shell = new Shell(Display.getDefault().getActiveShell(), SWT.SHELL_TRIM | SWT.RESIZE);
            shell.setText("Oje.me Vorschlag: " + editor.part.getTitle());
            shell.setLayout(new GridLayout(2, true));
            Label heading = new Label(shell, SWT.WRAP);
            heading.setText(summary + "\nRechts bearbeiten, dann bewusst in den offenen Editor uebernehmen. "
                + "Das speichert oder aktiviert nichts in SAP. Ungenutzte Aenderungen rechts verfallen beim Schliessen.");
            heading.setLayoutData(new GridData(SWT.FILL, SWT.TOP, true, false, 2, 1));
            new Label(shell, SWT.NONE).setText("Aktueller Editor");
            new Label(shell, SWT.NONE).setText("Vorschlag (bearbeitbar)");
            StyledText current = new StyledText(shell, SWT.BORDER | SWT.MULTI | SWT.V_SCROLL | SWT.H_SCROLL | SWT.READ_ONLY);
            current.setText(document.get());
            current.setLayoutData(new GridData(SWT.FILL, SWT.FILL, true, true));
            StyledText proposed = new StyledText(shell, SWT.BORDER | SWT.MULTI | SWT.V_SCROLL | SWT.H_SCROLL);
            proposed.setText(suggested);
            proposed.setLayoutData(new GridData(SWT.FILL, SWT.FILL, true, true));
            Button apply = new Button(shell, SWT.PUSH);
            apply.setText("In offenen Editor uebernehmen");
            apply.setLayoutData(new GridData(SWT.BEGINNING, SWT.CENTER, false, false));
            apply.addListener(SWT.Selection, event -> {
                Editor target = null;
                for (Editor candidate : openEditors()) {
                    if (candidate.id.equals(editorId)) { target = candidate; break; }
                }
                if (target == null) {
                    MessageDialog.openWarning(shell, "Uebernahme nicht moeglich", "Der Ziel-Editor ist nicht mehr offen.");
                    return;
                }
                IDocument latest = target.text.getDocumentProvider().getDocument(target.part.getEditorInput());
                if (latest == null || !baseHash.equals(sha256(latest.get()))) {
                    MessageDialog.openWarning(shell, "Uebernahme nicht moeglich",
                        "Der Ziel-Editor wurde seit dem Lesen geaendert. Bitte neu lesen und einen neuen Vorschlag anfordern.");
                    return;
                }
                if (!target.text.isEditable()) {
                    MessageDialog.openWarning(shell, "Uebernahme nicht moeglich", "Der Ziel-Editor ist schreibgeschuetzt.");
                    return;
                }
                if (!MessageDialog.openConfirm(shell, "Vorschlag uebernehmen?",
                    "Den rechten Text in den offenen Eclipse-Editor uebernehmen? "
                        + "Das speichert oder aktiviert den ABAP-Quelltext nicht in SAP.")) return;
                if (!baseHash.equals(sha256(latest.get())) || !target.text.isEditable()) {
                    MessageDialog.openWarning(shell, "Uebernahme nicht moeglich",
                        "Der Ziel-Editor hat sich waehrend der Bestaetigung geaendert. Bitte neu lesen.");
                    return;
                }
                try {
                    latest.replace(0, latest.getLength(), proposed.getText());
                    shell.close();
                    target.part.getSite().getPage().activate(target.part);
                } catch (BadLocationException exception) {
                    MessageDialog.openError(shell, "Uebernahme fehlgeschlagen", exception.getMessage());
                }
            });
            Button close = new Button(shell, SWT.PUSH);
            close.setText("Verwerfen / Schliessen");
            close.setLayoutData(new GridData(SWT.END, SWT.CENTER, false, false));
            close.addListener(SWT.Selection, event -> shell.close());
            shell.setSize(1100, 700);
            shell.open();
            return;
        }
        MessageDialog.openWarning(Display.getDefault().getActiveShell(), "Oje.me Vorschlag",
            "Der Ziel-Editor ist nicht mehr offen. Vorschlag verworfen.");
    }

    private static String sha256(String text) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(text.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) { throw new IllegalStateException(e); }
    }

    private void updateTitles() {
        if (Display.getDefault().isDisposed()) return;
        for (IWorkbenchWindow window : PlatformUI.getWorkbench().getWorkbenchWindows()) {
            if (window.getShell() == null || window.getShell().isDisposed()) continue;
            String current = window.getShell().getText();
            if (active) {
                if (!current.endsWith(TITLE_MARK)) {
                    titles.put(window, current);
                    window.getShell().setText(current + TITLE_MARK);
                }
            } else if (current.endsWith(TITLE_MARK)) {
                window.getShell().setText(current.substring(0, current.length() - TITLE_MARK.length()));
            }
        }
    }

    private void loadDevice() throws Exception {
        if (deviceId != null && devicePrivate != null) return;
        ISecurePreferences node = SecurePreferencesFactory.getDefault().node("com.oje.eclipse.hello/bridge");
        deviceId = node.get("deviceId", null);
        String encoded = node.get("devicePrivate", null);
        if (deviceId == null || encoded == null) throw new IllegalStateException("Bitte zuerst Geraet koppeln.");
        devicePrivate = KeyFactory.getInstance("Ed25519").generatePrivate(
            new PKCS8EncodedKeySpec(Base64.getDecoder().decode(encoded)));
    }

    private void loadPinnedKeys() throws Exception {
        if (serverPublic != null) return;
        String recipientPem = resource("/keys/bridge-recipient.pub");
        recipientPublic = PinnedRecipientKey.fromPem(recipientPem, RECIPIENT_PIN);
        String serverPem = resource("/keys/bridge-signing.pub");
        byte[] der = Base64.getMimeDecoder().decode(serverPem.replace("-----BEGIN PUBLIC KEY-----", "")
            .replace("-----END PUBLIC KEY-----", ""));
        String hash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(der));
        if (!hash.equals(SERVER_PIN)) throw new SecurityException("Server signing key pin mismatch");
        serverPublic = KeyFactory.getInstance("Ed25519").generatePublic(new X509EncodedKeySpec(der));
    }

    private String resource(String name) throws Exception {
        try (InputStream stream = BridgeClient.class.getResourceAsStream(name)) {
            if (stream == null) throw new IllegalStateException("Missing bridge key");
            return new String(stream.readAllBytes(), StandardCharsets.US_ASCII);
        }
    }

    private HttpResponse<String> send(String method, String action, String body, String id, PrivateKey privateKey)
        throws Exception {
        String path = "/device/" + action;
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(BASE + action)).timeout(Duration.ofSeconds(8));
        if (id != null) {
            String stamp = String.valueOf(System.currentTimeMillis());
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(bytes);
            String canonical = method + "\n" + path + "\n" + stamp + "\n" + HexFormat.of().formatHex(digest);
            Signature signer = Signature.getInstance("Ed25519"); signer.initSign(privateKey);
            signer.update(canonical.getBytes(StandardCharsets.UTF_8));
            builder.header("X-OJE-Device", id).header("X-OJE-Timestamp", stamp)
                .header("X-OJE-Signature", Base64.getUrlEncoder().withoutPadding().encodeToString(signer.sign()));
        }
        builder.method(method, method.equals("GET") ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofByteArray(bytes));
        HttpResponse<String> response = http.send(builder.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        String stamp = response.headers().firstValue("X-OJE-Time").orElseThrow();
        String signed = response.headers().firstValue("X-OJE-Server-Signature").orElseThrow();
        if (!stamp.matches("[0-9]{13}") || Math.abs(System.currentTimeMillis() - Long.parseLong(stamp)) > 30_000)
            throw new SecurityException("Stale bridge response");
        byte[] hash = MessageDigest.getInstance("SHA-256").digest(response.body().getBytes(StandardCharsets.UTF_8));
        String canonical = stamp + "\n" + HexFormat.of().formatHex(hash);
        Signature verifier = Signature.getInstance("Ed25519"); verifier.initVerify(serverPublic);
        verifier.update(canonical.getBytes(StandardCharsets.UTF_8));
        if (!verifier.verify(Base64.getUrlDecoder().decode(signed))) throw new SecurityException("Invalid bridge signature");
        return response;
    }

    private static String quote(String value) {
        StringBuilder out = new StringBuilder("\"");
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            switch (c) {
                case '\\' -> out.append("\\\\");
                case '"' -> out.append("\\\"");
                case '\n' -> out.append("\\n");
                case '\r' -> out.append("\\r");
                case '\t' -> out.append("\\t");
                default -> { if (c < 32) out.append(String.format("\\u%04x", (int) c)); else out.append(c); }
            }
        }
        return out.append('"').toString();
    }

    private static String error(String id, String reason) {
        return "{\"requestId\":" + quote(id) + ",\"kind\":\"error\",\"error\":" + quote(reason) + "}";
    }

    private record Editor(String id, IEditorPart part, ITextEditor text) { }
}
