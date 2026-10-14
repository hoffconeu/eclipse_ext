package com.oje.eclipse.hello.handlers;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.concurrent.TimeUnit;
import org.eclipse.core.commands.AbstractHandler;
import org.eclipse.core.commands.ExecutionEvent;
import org.eclipse.core.commands.ExecutionException;
import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.core.runtime.IStatus;
import org.eclipse.core.runtime.Status;
import org.eclipse.core.runtime.jobs.Job;
import org.eclipse.jface.dialogs.MessageDialog;
import org.eclipse.swt.widgets.Display;
import org.eclipse.swt.widgets.Shell;
import org.eclipse.ui.handlers.HandlerUtil;

/** Starts a bounded, read-only probe of Teams-owned top-level windows. */
public final class TeamsPopupProbeHandler extends AbstractHandler {
    private static final int MAX_OUTPUT = 12_000;

    @Override
    public Object execute(ExecutionEvent event) throws ExecutionException {
        Shell shell = HandlerUtil.getActiveShell(event);
        String os = System.getProperty("os.name", "");
        if (!os.toLowerCase(java.util.Locale.ROOT).contains("windows")) {
            MessageDialog.openInformation(shell, "OJE Teams-Popup-Test",
                "Dieser Test ist nur unter Windows verfuegbar.");
            return null;
        }
        MessageDialog.openInformation(shell, "OJE Teams-Popup-Test",
            "Der lokale Test laeuft jetzt 45 Sekunden. Bitte in dieser Zeit zuerst eine"
                + " Testnachricht und dann einen Testanruf in Teams ausloesen lassen."
                + " Es werden keine Namen, Nachrichtentexte oder Daten gesendet.");
        Display display = shell.getDisplay();
        Job job = new Job("OJE Teams-Popup-Test") {
            @Override
            protected IStatus run(IProgressMonitor monitor) {
                String result = probe();
                if (!display.isDisposed()) {
                    display.asyncExec(() -> {
                        if (!display.isDisposed()) {
                            Shell parent = shell.isDisposed() ? null : shell;
                            MessageDialog.openInformation(parent, "OJE Teams-Popup-Test", result);
                        }
                    });
                }
                return Status.OK_STATUS;
            }
        };
        job.setUser(true);
        job.schedule();
        return null;
    }

    private static String probe() {
        Path script = null;
        Process process = null;
        try (InputStream source = TeamsPopupProbeHandler.class
            .getResourceAsStream("/teams-popup-probe.ps1")) {
            if (source == null) {
                return "Das Testskript fehlt im installierten Plug-in.";
            }
            script = Files.createTempFile("oje-teams-probe-", ".ps1");
            Files.copy(source, script, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
            String systemRoot = System.getenv("SystemRoot");
            if (systemRoot == null || systemRoot.isBlank()) {
                return "Windows PowerShell wurde nicht gefunden.";
            }
            Path powershell = Path.of(systemRoot, "System32", "WindowsPowerShell",
                "v1.0", "powershell.exe");
            if (!Files.isRegularFile(powershell)) {
                return "Windows PowerShell wurde nicht gefunden.";
            }
            process = new ProcessBuilder(powershell.toString(), "-NoProfile", "-NonInteractive",
                "-File", script.toString()).redirectErrorStream(true).start();
            boolean finished = process.waitFor(Duration.ofSeconds(55).toMillis(), TimeUnit.MILLISECONDS);
            if (!finished) {
                process.destroyForcibly();
                return "Der Test wurde nach 55 Sekunden beendet (Zeitlimit).";
            }
            byte[] output = process.getInputStream().readNBytes(MAX_OUTPUT + 1);
            if (output.length > MAX_OUTPUT) {
                return "Die Testausgabe war zu gross und wurde verworfen.";
            }
            String report = new String(output, StandardCharsets.UTF_8).trim();
            if (process.exitValue() != 0) {
                return "Der lokale Test konnte nicht ausgefuehrt werden."
                    + " Bitte nur die folgende Statusmeldung senden:\n\n" + safeReport(report);
            }
            return "Lokaler Windows-Test, keine Daten gesendet."
                + " Bitte diese Ausgabe ueber die geschuetzte Befehlsseite senden:\n\n"
                + safeReport(report);
        } catch (IOException | InterruptedException exception) {
            if (exception instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            return "Der lokale Test konnte nicht gestartet oder abgeschlossen werden."
                + " Bitte keine Teams-Inhalte senden.";
        } finally {
            if (process != null && process.isAlive()) {
                process.destroyForcibly();
            }
            if (script != null) {
                try {
                    Files.deleteIfExists(script);
                } catch (IOException ignored) {
                    // The temporary script contains no credentials or user data.
                }
            }
        }
    }

    private static String safeReport(String report) {
        if (report.matches("(?s)PROBE started duration=45s\\R(?:WINDOW seconds=\\d+ buttons=\\d+"
                + " accept=(True|False) decline=(True|False) reply=(True|False)\\R)*"
                + "PROBE finished windows=\\d+")) {
            return report;
        }
        if (report.contains("PROBE unavailable:")) {
            return "Windows UI Automation ist nicht verfuegbar.";
        }
        return "PowerShell oder eine Richtlinie hat den Test blockiert (keine Rohdaten angezeigt).";
    }
}
