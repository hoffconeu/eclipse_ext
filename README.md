# OJE Eclipse Extension

Eine installierbare Eclipse-Erweiterung, die unabhaengig neben SAP ADT laeuft.
Alle Aktionen liegen ab Version 1.0.6 unter `Help` → `Oje.me`.
Der erste Meilenstein fuegte den Befehl `Hello World` hinzu.
Version 1.0.2 ergaenzt `OJE ABAP-Auswahl pruefen (lokal)`: In einem
geoeffneten ABAP-Editor Quelltext markieren und den Befehl waehlen. Er zeigt
nur Editortitel und Laenge der Markierung an. Ohne Markierung wird kein ganzes
Objekt erfasst. Es findet weder ein Upload noch eine Aenderung in SAP statt.
Der Befehl dient zunaechst dazu, die ADT-Editor-Kompatibilitaet zu pruefen.
Version 1.0.3 ergaenzt `OJE Verschluesselungstest (nur Testtext)`. Dieser
Befehl verschluesselt ausschliesslich einen synthetischen Testmarker, kopiert
das JWE in die Zwischenablage und zeigt die Test-ID an. Ueber die geschuetzte
Befehlsseite kann das JWE gesendet und auf dem Server mit dem separaten
Testschluessel geprueft werden. Der Editor wird nicht ausgelesen.

Version 1.0.4 ergaenzt `OJE Teams-Popups pruefen (nur lokal)`. Der Befehl
startet unter Windows fuer hoechstens 45 Sekunden die vorhandene PowerShell
und prueft, ob neue Teams-Fenster fuer Testnachricht und Testanruf per
Windows UI Automation sichtbar werden. Er meldet nur Fensteranzahl und
generische Schaltflaechen-Merkmale; Titel, Namen und Nachrichtentexte werden
nicht ausgegeben. Es wird nichts an Telegram oder einen Server gesendet.
Erst wenn beide Ereignisse auf dem Zielrechner wiederholt eindeutig erkannt
werden, wird die automatische Weiterleitung entwickelt.

Version 1.0.5 ergaenzt die lesende Eclipse/Codex-Bruecke: einmalige
Geraetekopplung ueber Cloudflare Access, anschliessend eine ausdruecklich in
Eclipse gestartete Lesesitzung bis zum Widerruf oder Eclipse-Ende. Codex kann
offene Texteditoren auflisten und einzelne Inhalte einschliesslich
ungespeicherter Aenderungen verschluesselt anfordern. Kein Workspace-Scan,
kein automatischer Gesamtupload und kein SAP-Schreiben. Anleitung,
Sicherheitsgrenzen und Fingerprints: [docs/ON_DEMAND_FILE_BRIDGE.md](docs/ON_DEMAND_FILE_BRIDGE.md).
Der Zielrechner-/ADT-Test mit synthetischem Text steht noch aus; bis dahin
keine echten Unternehmensquellen senden.

Version 1.0.6 fasst die bisherigen Help-Menueeintraege unter `Oje.me` in
einem Untermenue zusammen. Kopplung und Lesezugriff stehen oben, die lokalen
Testaktionen darunter. Das Verhalten der Aktionen ist unveraendert.

Version 1.0.7 ergaenzt den verschluesselten Rueckweg: Codex kann fuer einen
gelesenen Editor einen Textvorschlag senden. Eclipse zeigt Original und
Vorschlag nur schreibgeschuetzt nebeneinander, wenn die Ausgangspruefsumme
noch stimmt. Es gibt keine Uebernahme oder SAP-Speicherung. Details stehen in
[docs/ON_DEMAND_FILE_BRIDGE.md](docs/ON_DEMAND_FILE_BRIDGE.md).

Version 1.0.8 macht die rechte Vergleichsseite bearbeitbar und bietet eine
ausdrueckliche Uebernahme in den offenen Eclipse-Editorpuffer an. Vor der
Uebernahme wird der unveraenderte Ausgangstext erneut geprueft; SAP-Speicherung
und -Aktivierung bleiben manuell.

Version 1.0.9 ergaenzt einen gesondert zu bestaetigenden, verschluesselten
Abruf der Eclipse-Problem-Marker (Fehler, Warnungen, Infos) im Workspace.
Ansichtsfilter werden nicht nachgebildet; maximal 500 Marker bzw. 1 MiB.

Version 1.0.10 ergaenzt `eclipse_open_adt_link`: Codex kann einen gueltigen
`adt://`-Objektlink verschluesselt an Eclipse senden. Erst nach lokaler
Bestaetigung wird er an den registrierten ADT-Linkhandler uebergeben. Die
Funktion oeffnet ein Objekt, liest aber keinen Quelltext. Der Windows-/ADT-
Test gelang nach Aktivierung der `adt://`-Link-Zuordnung.

Version 1.0.11 meldet fuer Textvorschlaege erst `displayed`, wenn das
Vergleichsfenster in Eclipse tatsaechlich geoeffnet wurde. Fehler wie ein
inzwischen geschlossener oder veraenderter Editor werden als Zustellstatus
zurueckgegeben; `queued` allein ist keine Anzeigebestaetigung.

Automatisches Zurueckschreiben in SAP ist nicht vorgesehen. Die
Java-Verschluesselungsroutine mit Public-Key-Fingerprint-Pruefung wird von
der lesenden 1.0.5-Bruecke genutzt; der alte Python-Entschluesseler fuer den
synthetischen Test bleibt separat. Das Sicherheitskonzept
steht in [docs/SECURE_ABAP_EXCHANGE.md](docs/SECURE_ABAP_EXCHANGE.md).

## Voraussetzungen

- JDK 21 fuer den Server-Build
- Maven Wrapper (im Projekt enthalten; laedt Maven 3.9.16 reproduzierbar)
- Eclipse-2026-06-Release-Repository als Build-Zielplattform
- Eclipse 2026-06 mit Java 21 oder neuer fuer die Installation

## Bauen

```bash
./mvnw clean verify
./scripts/audit-p2-repository.sh
```

Das fertige p2-Repository entsteht unter:

```text
releng/com.oje.eclipse.hello.repository/target/repository/
```

Der Repository-Audit erlaubt dort ausschliesslich das OJE-Plug-in und sein
Feature. Insbesondere duerfen keine Eclipse-, SAP- oder ASM-Bibliotheken in
die veroeffentlichte Update-Site gelangen.

## Update-Site

Die derzeitige Update-Site lautet:

```text
https://eclipse-ext.pages.dev/repository/
```

Die bisherige Origin-Adresse `https://ext.oje.me/repository/` bleibt als
serverseitige Alternative bestehen.

Die GitHub-basierte Alternative wird nicht automatisch mit der
Cloudflare-Pages-Site synchronisiert und kann einen aelteren Stand enthalten:

```text
https://raw.githubusercontent.com/hoffconeu/eclipse_ext/gh-pages/repository/
```

Fuer eine lokale Installation kann die fertige Update-Site als ZIP geladen
und in Eclipse ueber `Add...` -> `Archive...` ausgewaehlt werden:

```text
https://raw.githubusercontent.com/hoffconeu/eclipse_ext/gh-pages/oje-eclipse-update-site.zip
```

Freigegebene Fehlermeldungen, Logs und Screenshots koennen ueber den durch
Cloudflare Access geschuetzten Diagnosebereich gesendet werden:

```text
https://eclipse-ext.pages.dev/diagnostics
```

Aktuelle Diagnose- und Wiederherstellungsbefehle fuer den Zielrechner stehen
mit Kopierfunktion unter. Auf derselben Seite koennen der ausgefuehrte Befehl
und seine Ausgabe nach Cloudflare-Access-Anmeldung an den Diagnose-Posteingang
zurueckgesendet werden:

```text
https://eclipse-ext.pages.dev/commands
```

Das Rueckmeldeformular nimmt bis zu 5 MiB UTF-8-Text pro Nachricht an und
schneidet eingefuegte Logs nicht stillschweigend ab. Groessere Nachrichten
werden vor dem Senden mit einer Fehlermeldung abgelehnt; der Text bleibt im
Formular erhalten.

Neue Befehle werden aus einer geschuetzten Befehlsliste geladen. Ein offener
Tab prueft alle 15 Sekunden auf Aenderungen. Zum Veroeffentlichen wird eine
lokale Textdatei mit dem Befehl benoetigt:

```bash
./scripts/command-board.py put --id mein-test --title "Mein Test" --body-file /pfad/zum/befehl.txt
```

Der Befehl erscheint ohne Git-Push oder Pages-Deployment. Mit `list` lassen
sich die Titel anzeigen; `remove mein-test` entfernt einen Eintrag. Die
serverlokale Einrichtung ist in der privaten Betriebsdokumentation beschrieben.

Der Diagnosebefehl `scripts/diagnostics/check-p2-download.ps1` prueft bei
einem p2-Artefaktfehler die Metadaten und die beiden OJE-JARs direkt auf dem
Zielrechner. Er speichert keine Dateien und aendert Eclipse nicht. Wenn die
Downloads dort funktionieren, helfen die Details aus der Eclipse-Ansicht
`Window` -> `Show View` -> `Error Log` und der Wert von `General` ->
`Network Connections` -> `Active Provider` bei der weiteren Eingrenzung.

## Cloudflare Pages

Das Cloudflare-Pages-Projekt `eclipse-ext` wird unter
`https://eclipse-ext.pages.dev/` betrieben. Deployment-Grundlage ist der
Branch `gh-pages` mit folgenden Einstellungen:

- Production Branch: `gh-pages`
- Framework Preset: keines
- Build Command: `exit 0`
- Build Output Directory: `.`

Die Pages Function unter `/api/diagnostics` leitet Diagnose-Uploads
serverseitig an das bestehende Backend weiter. Im Browser wird dadurch keine
Backend-Domain verwendet. Im Pages-Projekt ist fuer Production und Preview die
Variable
`DIAGNOSTICS_ORIGIN_URL` mit der vollstaendigen HTTPS-Adresse des bestehenden
Diagnose-Endpunkts gesetzt. Der interne Upload-Schluessel liegt ausschliesslich
als Cloudflare-Secret `DIAGNOSTICS_UPLOAD_PIN` vor und wird von der Function
serverseitig ergaenzt. Die Pfade `/commands*`, `/diagnostics*` und
`/api/diagnostics*` sind durch Cloudflare Access geschuetzt; das p2-Repository
bleibt oeffentlich. Zugangsdaten gehoeren nicht in Git.

Die Pages Function unter `/commands-feed` holt die Befehlsliste serverseitig
ueber denselben internen Schluessel. Der Pfad faellt unter den bestehenden
Cloudflare-Access-Schutz fuer `/commands*`.

Unter `/commands-chat` ist eine separate, Access-geschuetzte Chat-Oberflaeche
vorbereitet. Ihr Same-Origin-Endpunkt `/commands-chat-api` leitet nur an den
separaten Loopback-Dienst weiter. Nachrichten und Antworten werden nicht als
Chatverlauf auf dem Server gespeichert. Der Dienst akzeptiert ausschliesslich
ein serverseitiges Proxy-Secret; ChatGPT-Zugangsdaten liegen weder im Browser
noch im Repository. Erst nach einer vom Kontoinhaber autorisierten
ChatGPT-Plan-Verbindung ist das Senden aktiv. Ob ein privater Web-Dienst fuer
diese Vorschau freigeschaltet wird, muss beim Login/Inferenztest bestaetigt
werden. Bis dahin zeigt die Seite ausdruecklich "noch nicht verbunden".

Fuer die einmalige Verbindung ist ein plattformunabhaengiger lokaler
Anmeldehelfer unter `scripts/private-chat/siwc-login.mjs` vorbereitet. Er
verwendet einen lokalen Browser-Callback auf dem privaten Rechner und prueft
das OpenAI-ID-Token kryptographisch. Der Import auf den Server erfolgt nur
ueber einen gesonderten sicheren Transfer; Voraussetzungen stehen in
`server/private-chat/README.md`. Keine Tokens in den Chat kopieren.

Die 1.0.5-Bruecke und ihr derzeitiger Teststand sind in
`docs/ON_DEMAND_FILE_BRIDGE.md` beschrieben. Geraetekopplung und
Sitzungsfreigabe sind getrennte Schritte; die Sitzung umfasst alle
geoeffneten Texteditoren bis zum manuellen Stoppen oder Eclipse-Ende.

## Installation

1. In Eclipse `Help` → `Install New Software...` oeffnen.
2. `https://eclipse-ext.pages.dev/repository/` als Software-Site hinzufuegen.
3. `Contact all update sites during install to find required software`
   deaktivieren, damit Eclipse keine Plattformpakete aus anderen Update-Sites
   mit der bestehenden Installation vermischt.
4. `OJE Eclipse Extension` installieren und Eclipse neu starten.
5. `Help` → `Oje.me` → `Hello World` ausfuehren.

Fuer den Update-Test auf Version 1.0.2 denselben Repository-Eintrag erneut
unter `Help` → `Install New Software...` waehlen und den Haken bei `Contact
all update sites during install to find required software` deaktiviert lassen.
Vor dem Abschluss in `Install Details` pruefen, dass keine Eclipse-, ASM-,
Jetty- oder EMF-Plattformpakete zur Installation vorgesehen sind. Nach dem
Neustart zeigt `Help` → `OJE Hello World` den Dialogtitel
`OJE Eclipse Extension – Update-Test v1.0.1` und den neuen Meldungstext;
zusaetzlich steht `OJE ABAP-Auswahl pruefen (lokal)` im Help-Menue. Zum Test
nur eine harmlose Markierung verwenden und lediglich bestaetigen, ob Titel und
Laenge angezeigt werden. Keinen Quelltext im Diagnoseformular versenden.

Das Plug-in ist derzeit nicht kryptografisch signiert. Eclipse kann deshalb
waehrend der Installation eine Warnung zu nicht signiertem Inhalt anzeigen.

## Schutz des oeffentlichen Repositories

Vor jedem Push wird `scripts/audit-public.sh` durch den lokalen Pre-Push-Hook
ausgefuehrt. Der Audit blockiert typische Zugangsdaten, private Schluessel und
serverlokale Dateien. Zusaetzlich muss der jeweilige Diff vor dem Push manuell
geprueft werden.
