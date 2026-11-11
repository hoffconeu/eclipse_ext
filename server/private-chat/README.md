# Private Chat backend

Dieser Dienst akzeptiert nur Anfragen mit dem serverseitigen
`OJE_CHAT_PROXY_KEY` und bindet ausschliesslich an `127.0.0.1:8096`.
Cloudflare Access schuetzt die Pages-Pfade `/commands-chat*`; der Origin
antwortet ohne Proxy-Secret mit HTTP 401. Keine OpenAI-Zugangsdaten in Git,
Browser-Code, Pages-Variablen oder Diagnose-Uploads ablegen.

Die vom Kontoinhaber nach offizieller Sign-in-with-ChatGPT-Freigabe
uebertragene, verifizierte Credential-Datei gehoert nach
`/var/lib/oje-private-chat/credentials.json` (Eigentuemer `oje-chat`, Modus
`0600`; Verzeichnis `0700`). Sie muss `client_id`, `access_token`,
`refresh_token`, `scopes` mit `chatgpt.tokens.use.direct`, `expires_in` und
`saved_at` enthalten. Ein nur kopiertes ChatGPT-Browser-Cookie oder eine
Codex-CLI-`auth.json` ist **kein** Ersatz. Der Dienst erneuert gueltige SIWC-
Tokens mit dem ausgegebenen Client-ID, nicht mit `dynamic_agent_client`.

Der Anmeldehelfer `scripts/private-chat/siwc-login.mjs` laeuft auf dem
**privaten Rechner des Kontoinhabers**, nicht auf dem Server. Er braucht
Node.js 20 oder neuer, oeffnet die offizielle Anmeldeseite und verwendet
einen lokalen `127.0.0.1`-Callback mit PKCE, State und Nonce. Er prueft die
Signatur und Identitaet des ID-Tokens sowie die erteilte Plan-Berechtigung.
Die geschuetzte Datei liegt danach im Benutzerprofil unter
`oje-private-chat/credentials.json`. Sie darf weder in den Chat noch ins
Diagnoseformular kopiert werden.

Fuer den SSH-Transfer zuerst auf dem Server im eigenen Benutzerkonto ein
privates Verzeichnis `~/.oje-private-chat-transfer` (Modus `0700`) anlegen.
Die Datei dort per SCP als `credentials.json` ablegen. Anschliessend als
Administrator `sudo node /opt/oje-private-chat/import-siwc.mjs
/home/<BENUTZER>/.oje-private-chat-transfer/credentials.json` ausfuehren.
Der Import prueft die ID-Token-Signatur erneut, schreibt die Credential-Datei
atomar mit Modus `0600` fuer `oje-chat`, behaelt die eigene VM-Host-ID bei und
entfernt die Server-Transferkopie. Die lokale Originaldatei bleibt fuer
spaetere erneute Anmeldung im privaten Benutzerprofil.

Private remote gehostete Web-Apps sind laut OpenAI nur selektiv fuer die
ChatGPT-Plan-Nutzung zugelassen. Der Anmeldehelfer umgeht diese
Zulassungsgrenze nicht. Erst nach erfolgter Freigabe und einem erfolgreichen
Inferenztest ist der Chat betriebsbereit.

Offizielle Referenzen:

- https://developers.openai.com/siwc/token-sharing-open-source/self-hosted-vms
- https://developers.openai.com/siwc/token-sharing-open-source/sign-in
- https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference
