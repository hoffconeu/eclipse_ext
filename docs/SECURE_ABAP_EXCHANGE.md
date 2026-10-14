# Geplanter ABAP-Austausch (noch nicht aktiv)

## Produktgrenze

Die Erweiterung soll nur bewusst markierten ABAP-Text einlesen und spaeter
Vorschlaege anzeigen. Sie soll nichts automatisch nach SAP zurueckschreiben.
Version 1.0.2 prueft ausschliesslich lokal, ob die Editor-Auswahl erkannt wird.
Der mitgelieferte JWE-Writer wird nicht vom UI aufgerufen. Es gibt noch keinen
ABAP-Upload-Endpunkt und keine produktive Schluesselkonfiguration.

## Implementierter Kryptobaustein

- `JweEnvelope.encrypt(byte[], PublicKey)` erzeugt ein JWE-Compact-Objekt
  mit RSA-OAEP-256 und A256GCM. Der Klartext ist auf 1 MiB begrenzt; je
  Nachricht werden ein neuer AES-256-Schluessel und ein neuer 96-Bit-IV
  zufaellig erzeugt. Der geschuetzte Header ist authentifiziert.
- `PinnedRecipientKey.fromPem(pem, sha256Hex)` akzeptiert genau einen
  RSA-Public-Key im PEM-Format `BEGIN PUBLIC KEY` (SubjectPublicKeyInfo).
  `sha256Hex` ist der 64-stellige SHA-256-Hash der DER-kodierten SPKI-Daten.
  Der Hash muss ueber einen **unabhaengig vertrauenswuerdigen Kanal**
  vorliegen; ein zusammen mit dem PEM von derselben inspizierten Webseite
  abgerufener Fingerprint ist keine Sicherheitspruefung.
- `server/crypto/jwe_envelope.py` entschluesselt nur dieses JWE-Profil mit
  einem RSA-Private-Key ab 3072 Bit. Es prueft Format und Groessen, bevor
  entschluesselt wird. Der Aufrufer muss den privaten Schluessel geschuetzt
  bereitstellen, den Sender authentifizieren und empfangene Daten begrenzen.

Die Funktionen lesen oder speichern selbst keine Schluesseldateien und
senden keine Netzwerkanfragen. Es existiert kein produktiver privater
Schluessel im Repository. Serverseitig ist das Python-Paket `cryptography`
erforderlich; die Routine wird noch von keinem Web-Endpunkt aufgerufen.

Kompatibilitaets- und Negativtests mit kurzlebigen Testschluesseln:

```bash
python3 -m unittest -v tests/test_jwe_interop.py
./mvnw --batch-mode --no-transfer-progress clean verify
```

## Bedrohungsmodell

Die Firmenverbindung kann TLS aufbrechen und Inhalte einsehen. Daher muss
Quelltext vor dem Verlassen von Eclipse mit einem unabhaengig verifizierten
Empfaenger-Public-Key verschluesselt werden. Der geplante Umschlag verwendet
JWE Compact mit RSA-OAEP-256 und A256GCM. Frische AES-Schluessel und Nonces
werden fuer jede Nachricht erzeugt. Die private Schluesselhaelfte bleibt auf
dem Server. Auch Antworten mit Quelltext muessen Ende-zu-Ende geschuetzt sein.

Transportverschluesselung allein reicht gegen den genannten TLS-Inspector
nicht. App-Layer-Verschluesselung schuetzt jedoch **nicht**, wenn der Inspector
den unsignierten Eclipse-Installer, die Erweiterung oder einen ungeprueft
abgerufenen Public Key austauschen kann. Vor der Uebertragung echter
Unternehmensdaten fehlen deshalb noch:

1. Vertrauenswuerdige Verteilung bzw. Signatur des Plug-ins und unabhaengige
   Pruefung eines festgelegten Schluessel-Fingerprints.
2. Authentifizierung des Senders und eng begrenzte Autorisierung am Empfang.
   Das Cloudflare-Access-Browser-Cookie authentifiziert nicht automatisch
   einen Eclipse-HTTP-Client. Keine langlebigen Service-Tokens im Plug-in.
3. Ein begrenzter, protokollierter Empfang mit festgelegter Aufbewahrung und
   Loeschung sowie ein sicherer, verschluesselter Antwortkanal.
4. Ein Ende-zu-Ende-Test der kuenftigen **Transportstrecke** mit synthetischen
   Daten. Die reine Java/Python-Kryptokompatibilitaet und Ablehnung
   veraenderter Nachrichten und falscher Schluessel sind bereits getestet.

Bis diese Punkte geklaert und geprueft sind, keine echten ABAP-Quellen ueber
Diagnose- oder Befehlsformulare senden. Die Bestaetigung, dass die Firma den
Datentransfer erlaubt, ersetzt nicht die technische Absicherung.
