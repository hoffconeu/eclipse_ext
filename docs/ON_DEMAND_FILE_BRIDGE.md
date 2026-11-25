# Eclipse ↔ Codex: Texteditoren, Vorschlaege, Problem-Marker und ADT-Links (1.0.11)

Hinweis zu 1.0.12: `eclipse_list_open_editors` liefert zusaetzlich Editor- und
Input-Typ, Workbench-Editor-ID sowie (falls verfuegbar) Input-URI. Diese
Metadaten dienen der Diagnose von ADT-Text-Elementen. Sie werden nur in der
freigegebenen Sitzung verschluesselt uebertragen; die drei Text-Elemente-
Bereiche werden damit noch nicht vollstaendig gelesen.

## Bedienung

1. In Eclipse ab Version 1.0.9 `Help` → `Oje.me` → `Codex-Geraet koppeln` ausfuehren.
2. Den achtstelligen Code auf `https://eclipse-ext.pages.dev/commands-eclipse-pair.html`
   nach dem Cloudflare-Access-Login bestaetigen. Die Kopplung allein gibt **keine** Inhalte frei.
3. In Eclipse `Help` → `Oje.me` → `Codex-Lesezugriff starten` ausfuehren. Der Dialog nennt den
   Umfang und die Fingerprints. Nur nach expliziter Zustimmung steht
   `[OJE Codex: LESEN AKTIV]` im Fenstertitel.
4. Codex kann nun `eclipse_connection_status`, `eclipse_list_open_editors`,
   `eclipse_read_editor(editor_id)` und bei laengeren Antworten `eclipse_get_result(request_id)`
   nutzen. Es werden nur lesbare, bereits geoeffnete Texteditoren angeboten.
   Ein spaeter geoeffneter Texteditor und ungespeicherte Aenderungen gehoeren
   waehrend der Sitzung ebenfalls dazu. Inhalte werden nur einzeln auf Abruf
   gesendet, nicht schon beim Oeffnen.
5. `eclipse_read_editor` liefert ab 1.0.7 neben dem Text `sha256`. Codex kann
   `eclipse_show_proposal(editor_id, base_sha256, proposed_text, summary)` aufrufen.
   Eclipse zeigt den aktuellen Stand links schreibgeschuetzt und den Vorschlag
   rechts bearbeitbar. Mit `In offenen Editor uebernehmen` und einer weiteren
   Bestaetigung wird der rechte Text in den noch offenen Editorpuffer eingesetzt.
   Stimmen Editor-ID oder SHA-256 des aktuellen Textes nicht mehr, wird die
   Uebernahme verweigert. Eclipse speichert/aktiviert dabei nichts in SAP.
   Ohne Uebernahme verfallen Aenderungen am rechten Text beim Schliessen.
   Ab 1.0.11 wartet der MCP-Aufruf kurz auf eine bestaetigte Anzeige.
   `displayed` bedeutet, dass Eclipse das Vergleichsfenster geoeffnet hat;
   `queued` bedeutet nur, dass die Anfrage noch aussteht. Mit
   `eclipse_get_result(request_id)` oder `eclipse_get_delivery_status(delivery_id)`
   kann der Status spaeter erneut abgefragt werden. `failed` enthaelt einen
   Grund wie `editor_closed`, `editor_changed` oder `ui_error`; auch
   `expired` und `session_stopped` sind moeglich. Die Statusantwort bestaetigt
   keine Uebernahme des Vorschlags in den Editor.
6. Mit `eclipse_read_problems` kann Codex die Problem-Marker des gesamten
   Eclipse-Workspace anfragen. Eclipse fragt **bei jedem Abruf gesondert** nach
   Bestaetigung und zeigt zuvor die Anzahl von Fehlern, Warnungen und Infos.
   Danach werden Beschreibung, Workspace-Pfad, Zeile, Position und Schweregrad
   verschluesselt uebertragen. Individuelle Filter der Problems-Ansicht werden
   nicht nachgebildet; der Abruf kann groesser sein als die sichtbare Liste.
   Bei mehr als 500 Markern oder mehr als 1 MiB Antwort gibt es einen Fehler
   statt einer gekuerzten Liste.
7. `Help` → `Oje.me` → `Codex-Lesezugriff stoppen` widerruft die Sitzung. Auch ein
   Eclipse-Neustart beendet sie; die Geraetekopplung bleibt erhalten.
8. `eclipse_open_adt_link(adt_link)` bietet ab 1.0.10 einen `adt://`-Link
   verschluesselt in der laufenden Sitzung an. Eclipse zeigt System und Objekt
   und verlangt fuer **jeden** Link eine lokale Bestaetigung. Danach uebergibt
   es ihn an den registrierten ADT-Linkhandler. Das Oeffnen allein uebertraegt
   keinen Quelltext; dazu ist `eclipse_read_editor` weiterhin separat noetig.
   Die Antwort `queued` bedeutet nur, dass die Anfrage zugestellt wurde, nicht
   dass der Nutzer zugestimmt oder ADT das Objekt geoeffnet hat.

## Grenzen und Absicherung

- Kein Dateiinhalts-Scan, keine beliebigen Dateisystempfade, keine Binaerdateien,
  kein automatischer SAP-Zugriff. Die einzige Schreibfunktion ist die explizite
  lokale Uebernahme in den geoeffneten Editorpuffer. Der Vergleich markiert
  Aenderungen noch nicht zeilenweise.
- Der Problem-Abruf liest ausschliesslich Eclipse-Problem-Marker im Workspace;
  er liest keine Dateien und keine Eclipse-Error-Logs. SAP-ADT-Meldungen, die
  nicht als Problem-Marker angelegt sind, koennen fehlen.
- ADT-Links sind auf `adt://<System>/sap/bc/adt/...` begrenzt. Andere
  Protokolle und Dateipfade werden verworfen. Der registrierte ADT-Linkhandler
  muss auf die gewuenschte Eclipse-Installation zeigen; das manuelle Oeffnen
  ueber `Navigate` → `Open ADT Link` prueft diese Registrierung nicht. Der
  Der Zielrechner-Test mit einem ADT-Link gelang nach Aktivierung der
  Windows-Link-Zuordnung.
- Je Antwort maximal 1 MiB Klartext. Uebergrosse Texte erzeugen einen
  `too_large`-Fehler, keine still gekuerzten Inhalte.
- Die Eclipse-Instanz erzeugt einen Ed25519-Geraeteschluessel und speichert
  den privaten Teil in Eclipse Secure Storage. Die Kopplung wird nur ueber die
  Access-geschuetzte Seite bestaetigt. Geraeteanfragen sind signiert und
  zeitlich begrenzt. Der Browser-Access-Cookie wird nicht fuer die Eclipse-API
  wiederverwendet.
- Relay-Antworten werden mit einem im Plug-in gepinnten Ed25519-Server-Key
  verifiziert. Editorliste und Inhalte verlassen Eclipse als JWE Compact
  (RSA-OAEP-256/A256GCM) fuer den ebenfalls gepinnten Empfaenger-Key.
  Private Server-Keys liegen ausserhalb von Git und Webroot mit Modus 0600.
- Beim Sitzungsstart erzeugt Eclipse zusaetzlich ein fluechtiges RSA-3072-
  Schluesselpaar. Der lokale MCP-Adapter verschluesselt jeden Vorschlag und
  ADT-Link fuer diesen Public Key; das Relay sieht nur JWE-Chiffretext. Vorschlaege sind
  an Sitzung, Editor-ID, Ausgangs-SHA-256 und zwei Minuten gebunden.
  Stoppen/Neustart verwerfen ausstehende Vorschlaege und den privaten
  Sitzungsschluessel.
- Der Relay-Dienst speichert nur den oeffentlichen Geraeteschluessel dauerhaft.
  Anfragen und Chiffretexte liegen nur im Arbeitsspeicher, verfallen nach
  hoechstens zwei Minuten und sind einmalig abrufbar. Prozessneustart
  beendet aktive Sitzungen. Logs sollen keine Editorinhalte enthalten.
- Der lokale MCP-Adapter unter `server/eclipse-bridge/mcp.mjs` entschluesselt
  erst nach einmaligem Abruf und bindet das Ergebnis an die Anfrage-ID.
  Der Codex-MCP-Eintrag `oje-eclipse` ist fuer den lokalen Benutzer angelegt;
  **neue Codex-Sitzungen** laden neue Tools. Die laufende Sitzung laedt
  neu hinzugefuegte Tools nicht automatisch nach.

## Vertrauenspruefung vor echtem Firmeninhalt

Die Erweiterung ist weiterhin nicht signiert. Ein TLS-Inspector kann daher
die Installation oder eine ungepruefte Update-Site angreifen. Vor einer
Uebertragung echter Unternehmensquellen muss der Nutzer das installierte
Plug-in-Artefakt und die beiden in Eclipse angezeigten Fingerprints ueber
einen unabhaengig vertrauenswuerdigen Kanal vergleichen. Dass die Firma den
Transfer erlaubt, ersetzt diese technische Kontrolle nicht.

- Plug-in 1.0.11.202611241306 SHA-256:
  `bceb10e94b88582cb280f212d166879df46c6e99b41bade43bb639f8b1a60d0b`
- Empfaenger-SPKI SHA-256:
  `a5d565c67dd4bcd67317ab2e32db843cf732e51c383f7403d3dcc43921643c7e`
- Server-Signatur-SPKI SHA-256:
  `8d52a5d0abc7cee905afd3693dbf3c5f76cabf89e315f41154e0d3fa27e8c466`

Die lokal isolierten Tests fuer Kopplung, Signaturen, JWE, Replay, Widerruf,
einmaligen Abruf und verschluesselten Vorschlag bestehen. Der
Windows-/SAP-ADT-Ende-zu-Ende-Test mit einem
synthetischen Editor ist **noch offen**; bis dahin keinen echten ABAP-Text
uebertragen. Die Kompatibilitaet des ADT-Editors mit `ITextEditor` und dessen
`IDocument` ist noch nicht auf dem Zielrechner bestaetigt.

## Betrieb

Der Relay-Dienst bindet nur lokal. Cloudflare Pages leitet den Geraetekanal
`/eclipse-device-api` und den Access-geschuetzten Kopplungs-Endpunkt weiter.
Der Geraetekanal hat bewusst kein Browser-Access-Cookie; er verlangt
signierte Geraeteaufrufe, ausgenommen die inhaltsfreie
Kopplungsinitialisierung. Die lokale MCP-API ist separat authentifiziert.
Serverpfade und Betriebsbefehle stehen nur in der privaten Betriebsdokumentation.

Tests: `node --test tests/eclipse-bridge-*.test.mjs`,
`./mvnw --batch-mode --no-transfer-progress clean verify`,
`./scripts/audit-p2-repository.sh`.
