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
https://ext.oje.me/repository/
```

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

## Installation

1. In Eclipse `Help` → `Install New Software...` oeffnen.
2. `https://ext.oje.me/repository/` als Software-Site hinzufuegen.
3. `OJE Eclipse Extension` installieren und Eclipse neu starten.
4. `Help` → `OJE Hello World` ausfuehren.

Das Plug-in ist derzeit nicht kryptografisch signiert. Eclipse kann deshalb
waehrend der Installation eine Warnung zu nicht signiertem Inhalt anzeigen.

## Schutz des oeffentlichen Repositories

Vor jedem Push wird `scripts/audit-public.sh` durch den lokalen Pre-Push-Hook
ausgefuehrt. Der Audit blockiert typische Zugangsdaten, private Schluessel und
serverlokale Dateien. Zusaetzlich muss der jeweilige Diff vor dem Push manuell
geprueft werden.
