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
                        + " Codex kann ADT-Objektlinks zum Oeffnen anbieten; normalerweise braucht jeder Link eine eigene Bestaetigung."
                        + " Der separat aktivierbare Sitzungsmodus laesst diese Bestaetigung und die zweite Nachfrage bei der Vorschlagsuebernahme aus."
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
            } else if (command.endsWith(".toggleConfirmations")) {
                if (!bridge.isActive()) throw new IllegalStateException("Bitte zuerst den Codex-Lesezugriff starten.");
                if (bridge.skipsConfirmations()) {
                    bridge.setSkipConfirmations(false);
                    MessageDialog.openInformation(HandlerUtil.getActiveShell(event), "OJE Codex",
                        "Einzelbestaetigungen fuer ADT-Links und Vorschlagsuebernahme sind wieder aktiv.");
                } else if (MessageDialog.openConfirm(HandlerUtil.getActiveShell(event),
                    "OJE Codex: Nachfragen fuer diese Sitzung ausschalten?",
                    "ADT-Links von Codex werden dann ohne weitere Rueckfrage an den registrierten Linkhandler uebergeben."
                        + " Bei einem angezeigten Vorschlag genuegt der Klick auf 'In offenen Editor uebernehmen';"
                        + " die zweite Bestaetigung entfaellt. Vorschlaege werden NICHT automatisch uebernommen,"
                        + " gespeichert oder in SAP aktiviert. Die Pruefung des Editorstands bleibt aktiv."
                        + "\n\nDer Modus gilt nur fuer die laufende Lesesitzung und wird beim Stoppen oder"
                        + " Neustart von Eclipse ausgeschaltet. Im Fenstertitel steht dann"
                        + " 'LINKS/VORSCHLAG OHNE FRAGE'. Jetzt einschalten?")) {
                    bridge.setSkipConfirmations(true);
                    MessageDialog.openInformation(HandlerUtil.getActiveShell(event), "OJE Codex",
                        "Sitzungsmodus aktiv: ADT-Links ohne Nachfrage; Vorschlagsuebernahme nach lokalem Klick ohne zweite Nachfrage.");
                }
            }
        } catch (Exception failure) {
            MessageDialog.openError(HandlerUtil.getActiveShell(event), "OJE Codex-Bruecke",
                "Vorgang fehlgeschlagen: " + failure.getMessage());
        }
        return null;
    }
}
