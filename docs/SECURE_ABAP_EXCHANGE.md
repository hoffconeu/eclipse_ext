# ABAP-Austausch: Kryptobaustein und lesende Bruecke

## Produktgrenze

Die Erweiterung soll ABAP-Text nur nach ausdruecklicher Freigabe einer
Lesesitzung einlesen und spaeter Vorschlaege anzeigen. Sie soll nichts
automatisch nach SAP zurueckschreiben. Die 1.0.5-Bruecke kann offene
Texteditoren auflisten und einzelne Inhalte verschluesselt uebertragen;
siehe `docs/ON_DEMAND_FILE_BRIDGE.md`.
Version 1.0.2 prueft ausschliesslich lokal, ob die Editor-Auswahl erkannt wird.
Version 1.0.3 nutzt den JWE-Writer nur fuer einen fest eingebauten,
synthetischen Testmarker. Der Marker wird verschluesselt in die Zwischenablage
kopiert; der Nutzer sendet ihn bewusst ueber die Access-geschuetzte
Befehlsseite. Dieser alte Testbefehl liest keinen Editor. Die neue Bruecke
nutzt ein separates Schluesselpaar und einen separaten Transport.

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

Die Kryptofunktionen selbst lesen oder speichern keine Schluesseldateien und
senden keine Netzwerkanfragen. Das 1.0.3-Plug-in enthaelt nur einen
oeffentlichen **Test**schluessel; der zugehoerige private Schluessel liegt mit
Dateimodus 0600 ausserhalb von Git und Webroot auf dem Server. Es existiert
kein produktiver privater Schluessel im Repository. Die 1.0.5-Bruecke hat
separate Schluessel ausserhalb von Git und Webroot. Fuer den alten Test ist das
Python-Paket `cryptography` erforderlich; ein separater Pruefbefehl
entschluesselt aus einer Access-geschuetzten Rueckmeldung nur den Testmarker
und gibt lediglich dessen UUID aus. Kein Web-Endpunkt entschluesselt beliebige
Inhalte automatisch.

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
abgerufenen Public Key austauschen kann. Die Bruecke implementiert nun
Geraeteauthentifizierung, Antwortsignaturen, gepinnte Schluessel und
fluechtige Einmalanfragen. Vor echtem Unternehmensinhalt bleiben offen:

1. Vertrauenswuerdige Verteilung bzw. Signatur des Plug-ins und unabhaengige
   Pruefung eines festgelegten Schluessel-Fingerprints.
2. Ein Ende-zu-Ende-Test der **neuen ABAP-Transportstrecke am Zielrechner**.
   Der erste Test ueber Eclipse-Zwischenablage und die bestehende
   Access-geschuetzte Rueckmeldung transportiert ausschliesslich einen
   synthetischen Marker. Java/Python-Kryptokompatibilitaet und Ablehnung
   veraenderter Nachrichten und falscher Schluessel sind bereits getestet.

Bis diese Punkte geklaert und geprueft sind, keine echten ABAP-Quellen ueber
die Bruecke oder Diagnose-/Befehlsformulare senden. Die Bestaetigung, dass
die Firma den Datentransfer erlaubt, ersetzt nicht die technische Absicherung.
