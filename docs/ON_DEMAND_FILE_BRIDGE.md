# Eclipse ↔ Codex: freigegebene Texteditoren und Vorschlaege (1.0.8)

## Bedienung

1. In Eclipse ab Version 1.0.8 `Help` → `Oje.me` → `Codex-Geraet koppeln` ausfuehren.
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
6. `Help` → `Oje.me` → `Codex-Lesezugriff stoppen` widerruft die Sitzung. Auch ein
   Eclipse-Neustart beendet sie; die Geraetekopplung bleibt erhalten.

## Grenzen und Absicherung

- Kein Workspace-Scan, keine beliebigen Dateisystempfade, keine Binaerdateien,
  kein automatischer SAP-Zugriff. Die einzige Schreibfunktion ist die explizite
  lokale Uebernahme in den geoeffneten Editorpuffer. Der Vergleich markiert
  Aenderungen noch nicht zeilenweise.
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
  Schluesselpaar. Der lokale MCP-Adapter verschluesselt jeden Vorschlag fuer
  diesen Public Key; das Relay sieht nur JWE-Chiffretext. Vorschlaege sind
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
  `eclipse_show_proposal` nicht automatisch nach.

## Vertrauenspruefung vor echtem Firmeninhalt

Die Erweiterung ist weiterhin nicht signiert. Ein TLS-Inspector kann daher
die Installation oder eine ungepruefte Update-Site angreifen. Vor einer
Uebertragung echter Unternehmensquellen muss der Nutzer das installierte
Plug-in-Artefakt und die beiden in Eclipse angezeigten Fingerprints ueber
einen unabhaengig vertrauenswuerdigen Kanal vergleichen. Dass die Firma den
Transfer erlaubt, ersetzt diese technische Kontrolle nicht.

- Plug-in 1.0.8.202611170635 SHA-256:
  `c04848de83e318c27867320cca96a4b09ccd44307d5893b25dd1164b24a0bc75`
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
