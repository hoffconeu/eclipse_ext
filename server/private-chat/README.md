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

Die erste Anmeldung ist hier absichtlich nicht automatisiert: OpenAI verlangt
bei diesem OSS-Flow einen lokalen `127.0.0.1`-Callback und gepruefte ID-Token-
Identitaet; ausserdem sind private Web-Apps in der Vorschau nur selektiv
zugelassen. Die Anmeldung muss mit dem Konto des Nutzers auf dessen privatem
Rechner erfolgen. Erst nach dieser Freigabe und einem erfolgreichen
Inferenztest ist der Chat betriebsbereit.

Offizielle Referenzen:

- https://developers.openai.com/siwc/token-sharing-open-source/self-hosted-vms
- https://developers.openai.com/siwc/token-sharing-open-source/sign-in
- https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference
