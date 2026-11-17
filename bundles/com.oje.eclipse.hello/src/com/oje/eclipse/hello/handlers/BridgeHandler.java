package com.oje.eclipse.hello.handlers;

import com.oje.eclipse.hello.bridge.BridgeClient;
import org.eclipse.core.commands.AbstractHandler;
import org.eclipse.core.commands.ExecutionEvent;
import org.eclipse.core.commands.ExecutionException;
import org.eclipse.jface.dialogs.MessageDialog;
import org.eclipse.ui.handlers.HandlerUtil;

/** Explicit pairing and session controls; never approves access on startup. */
public final class BridgeHandler extends AbstractHandler {
    @Override
    public Object execute(ExecutionEvent event) throws ExecutionException {
        BridgeClient bridge = BridgeClient.get();
        try {
            String command = event.getCommand().getId();
            if (command.endsWith(".pairBridge")) {
                String code = bridge.pair();
                MessageDialog.openInformation(HandlerUtil.getActiveShell(event), "OJE Codex koppeln",
                    "Oeffne https://eclipse-ext.pages.dev/commands-eclipse-pair.html nach dem Access-Login."
                        + "\n\nKopplungscode: " + code + "\n\nDanach separat 'Codex-Lesezugriff starten' waehlen.");
            } else if (command.endsWith(".startBridge")) {
                if (bridge.isActive()) {
                    MessageDialog.openInformation(HandlerUtil.getActiveShell(event), "OJE Codex", "Lesezugriff ist bereits aktiv.");
                    return null;
                }
                boolean accepted = MessageDialog.openConfirm(HandlerUtil.getActiveShell(event),
                    "OJE Codex-Lesezugriff bis Eclipse-Ende freigeben?",
                    "Codex darf ALLE aktuell und spaeter geoeffneten Texteditoren auflisten und deren Inhalt"
                        + " auf Anfrage lesen, auch ungespeicherte Aenderungen. Codex kann waehrend der Sitzung"
                        + " verschluesselte Textvorschlaege fuer zuvor gelesene Editoren senden."
                        + " Die Vorschlaege koennen nur nach lokalem Klick in den offenen Editorpuffer uebernommen werden."
                        + " Problem-Marker aus dem gesamten Workspace sind nur nach zusaetzlicher Bestaetigung je Abruf lesbar."
                        + " Keine Binardateien, kein automatisches SAP-Speichern oder Aktivieren."
                        + "\n\nDie Freigabe endet erst bei 'Codex-Lesezugriff stoppen' oder beim Schliessen von Eclipse."
                        + " Waehrenddessen steht LESEN AKTIV im Fenstertitel."
                        + "\n\nEmpfaenger-Schluessel SHA-256: " + BridgeClient.recipientFingerprint()
                        + "\nServer-Signatur-Schluessel SHA-256: " + BridgeClient.serverFingerprint()
                        + "\n\nFingerprints und Plug-in-Artefakt vor echtem Firmeninhalt unabhaengig pruefen. Jetzt starten?");
                if (accepted) {
                    bridge.start();
                    MessageDialog.openInformation(HandlerUtil.getActiveShell(event), "OJE Codex",
                        "Lesezugriff aktiv. Das Fenster zeigt [OJE Codex: LESEN AKTIV].");
                }
            } else if (command.endsWith(".stopBridge")) {
                bridge.stop();
                MessageDialog.openInformation(HandlerUtil.getActiveShell(event), "OJE Codex", "Lesezugriff beendet.");
            }
        } catch (Exception failure) {
            MessageDialog.openError(HandlerUtil.getActiveShell(event), "OJE Codex-Bruecke",
                "Vorgang fehlgeschlagen: " + failure.getMessage());
        }
        return null;
    }
}
