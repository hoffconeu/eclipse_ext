# Eclipse → Codex: freigegebene Texteditoren (1.0.5)

## Bedienung

1. In Eclipse `Help` → `OJE Codex-Geraet koppeln` ausfuehren.
2. Den achtstelligen Code auf `https://eclipse-ext.pages.dev/commands-eclipse-pair.html`
   nach dem Cloudflare-Access-Login bestaetigen. Die Kopplung allein gibt **keine** Inhalte frei.
3. In Eclipse `Help` → `OJE Codex-Lesezugriff starten` ausfuehren. Der Dialog nennt den
   Umfang und die Fingerprints. Nur nach expliziter Zustimmung steht
   `[OJE Codex: LESEN AKTIV]` im Fenstertitel.
4. Codex kann nun `eclipse_connection_status`, `eclipse_list_open_editors`,
   `eclipse_read_editor(editor_id)` und bei laengeren Antworten `eclipse_get_result(request_id)`
   nutzen. Es werden nur lesbare, bereits geoeffnete Texteditoren angeboten.
   Ein spaeter geoeffneter Texteditor und ungespeicherte Aenderungen gehoeren
   waehrend der Sitzung ebenfalls dazu. Inhalte werden nur einzeln auf Abruf
   gesendet, nicht schon beim Oeffnen.
5. `Help` → `OJE Codex-Lesezugriff stoppen` widerruft die Sitzung. Auch ein
   Eclipse-Neustart beendet sie; die Geraetekopplung bleibt erhalten.

## Grenzen und Absicherung

- Kein Workspace-Scan, keine beliebigen Dateisystempfade, keine Binaerdateien,
  keine Schreibfunktion und kein automatischer SAP-Zugriff.
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
- Der Relay-Dienst speichert nur den oeffentlichen Geraeteschluessel dauerhaft.
  Anfragen und Chiffretexte liegen nur im Arbeitsspeicher, verfallen nach
  hoechstens zwei Minuten und sind einmalig abrufbar. Prozessneustart
  beendet aktive Sitzungen. Logs sollen keine Editorinhalte enthalten.
- Der lokale MCP-Adapter unter `server/eclipse-bridge/mcp.mjs` entschluesselt
  erst nach einmaligem Abruf und bindet das Ergebnis an die Anfrage-ID.
  Der Codex-MCP-Eintrag `oje-eclipse` ist fuer den lokalen Benutzer angelegt;
  **neue Codex-Sitzungen** laden ihn. Die laufende Sitzung laedt neue Tools
  nicht automatisch nach.

## Vertrauenspruefung vor echtem Firmeninhalt

Die Erweiterung ist weiterhin nicht signiert. Ein TLS-Inspector kann daher
die Installation oder eine ungepruefte Update-Site angreifen. Vor einer
Uebertragung echter Unternehmensquellen muss der Nutzer das installierte
Plug-in-Artefakt und die beiden in Eclipse angezeigten Fingerprints ueber
einen unabhaengig vertrauenswuerdigen Kanal vergleichen. Dass die Firma den
Transfer erlaubt, ersetzt diese technische Kontrolle nicht.

- Plug-in 1.0.5.202611161618 SHA-256:
  `846493a831b67df4d5e1c70a46abd798d39ea8cd3d4499db8d78228feec8edd5`
- Empfaenger-SPKI SHA-256:
  `a5d565c67dd4bcd67317ab2e32db843cf732e51c383f7403d3dcc43921643c7e`
- Server-Signatur-SPKI SHA-256:
  `8d52a5d0abc7cee905afd3693dbf3c5f76cabf89e315f41154e0d3fa27e8c466`

Die lokal isolierten Tests fuer Kopplung, Signaturen, JWE, Replay, Widerruf
und einmaligen Abruf bestehen. Pages-Route, p2-Artefakte und Access-Redirect
sind live geprueft. Der Windows-/SAP-ADT-Ende-zu-Ende-Test mit einem
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
