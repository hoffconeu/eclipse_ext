# OJE Eclipse Extension

Eine installierbare Eclipse-Erweiterung, die unabhaengig neben SAP ADT laeuft.
Der erste Meilenstein fuegt unter `Help` den Befehl `OJE Hello World` hinzu.

## Voraussetzungen

- JDK 21 fuer den Server-Build
- Maven Wrapper (im Projekt enthalten; laedt Maven 3.9.16 reproduzierbar)
- Eclipse mit Java 17 oder neuer fuer die Installation

## Bauen

```bash
./mvnw clean verify
```

Das fertige p2-Repository entsteht unter:

```text
releng/com.oje.eclipse.hello.repository/target/repository/
```

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

Freigegebene Fehlermeldungen, Logs und Screenshots koennen ueber den
PIN-geschuetzten Diagnosebereich gesendet werden:

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

## Installation

1. In Eclipse `Help` → `Install New Software...` oeffnen.
2. `https://eclipse-ext.pages.dev/repository/` als Software-Site hinzufuegen.
3. `OJE Eclipse Extension` installieren und Eclipse neu starten.
4. `Help` → `OJE Hello World` ausfuehren.

Das Plug-in ist derzeit nicht kryptografisch signiert. Eclipse kann deshalb
waehrend der Installation eine Warnung zu nicht signiertem Inhalt anzeigen.

## Schutz des oeffentlichen Repositories

Vor jedem Push wird `scripts/audit-public.sh` durch den lokalen Pre-Push-Hook
ausgefuehrt. Der Audit blockiert typische Zugangsdaten, private Schluessel und
serverlokale Dateien. Zusaetzlich muss der jeweilige Diff vor dem Push manuell
geprueft werden.
