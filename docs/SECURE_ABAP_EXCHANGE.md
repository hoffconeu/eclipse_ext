# Geplanter ABAP-Austausch (noch nicht aktiv)

## Produktgrenze

Die Erweiterung soll nur bewusst markierten ABAP-Text einlesen und spaeter
Vorschlaege anzeigen. Sie soll nichts automatisch nach SAP zurueckschreiben.
Version 1.0.2 prueft ausschliesslich lokal, ob die Editor-Auswahl erkannt wird.
Der mitgelieferte JWE-Writer wird nicht aufgerufen. Es gibt noch keinen
ABAP-Upload-Endpunkt und keine produktive Schluesselkonfiguration.

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
4. Ein Ende-zu-Ende-Test mit ausschliesslich synthetischen Daten, einschliesslich
   Ablehnung veraenderter Nachrichten und falscher Empfaengerschluessel.

Bis diese Punkte geklaert und geprueft sind, keine echten ABAP-Quellen ueber
Diagnose- oder Befehlsformulare senden. Die Bestaetigung, dass die Firma den
Datentransfer erlaubt, ersetzt nicht die technische Absicherung.
