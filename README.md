# OJE Eclipse Extension

Eine installierbare Eclipse-Erweiterung, die unabhaengig neben SAP ADT laeuft.
Der erste Meilenstein fuegt unter `Help` den Befehl `OJE Hello World` hinzu.

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

Als GitHub-basierte Alternative steht das gleiche p2-Repository unter dieser
Adresse bereit:

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

## Installation

1. In Eclipse `Help` → `Install New Software...` oeffnen.
2. `https://eclipse-ext.pages.dev/repository/` als Software-Site hinzufuegen.
3. `Contact all update sites during install to find required software`
   deaktivieren, damit Eclipse keine Plattformpakete aus anderen Update-Sites
   mit der bestehenden Installation vermischt.
4. `OJE Eclipse Extension` installieren und Eclipse neu starten.
5. `Help` → `OJE Hello World` ausfuehren.

Das Plug-in ist derzeit nicht kryptografisch signiert. Eclipse kann deshalb
waehrend der Installation eine Warnung zu nicht signiertem Inhalt anzeigen.

## Schutz des oeffentlichen Repositories

Vor jedem Push wird `scripts/audit-public.sh` durch den lokalen Pre-Push-Hook
ausgefuehrt. Der Audit blockiert typische Zugangsdaten, private Schluessel und
serverlokale Dateien. Zusaetzlich muss der jeweilige Diff vor dem Push manuell
geprueft werden.
