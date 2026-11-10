const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

export async function onRequest(context) {
    if (!['GET', 'POST'].includes(context.request.method)) return new Response(null, { status: 405, headers: { Allow: 'GET, POST' } });
    const base = context.env.DIAGNOSTICS_ORIGIN_URL;
    const key = context.env.OJE_CHAT_PROXY_KEY;
    if (!base || !key) return json(503, { error: 'Chat ist noch nicht eingerichtet.' });
    let target;
    try {
        target = new URL(base);
        if (target.protocol !== 'https:') throw new Error('HTTPS required');
        target.pathname = '/api/private-chat';
        target.search = '';
    } catch { return json(503, { error: 'Chat ist falsch konfiguriert.' }); }
    try {
        if (Number(context.request.headers.get('Content-Length')) > 256 * 1024) return json(413, { error: 'Nachricht zu gross.' });
        const payload = context.request.method === 'POST' ? await limitedBody(context.request) : undefined;
        if (payload === null) return json(413, { error: 'Nachricht zu gross.' });
        const response = await fetch(target, {
            method: context.request.method,
            body: payload,
            headers: { Accept: 'application/json', 'Content-Type': 'application/json', Origin: target.origin, 'X-OJE-Chat-Key': key },
            redirect: 'manual',
        });
        if (!(response.headers.get('Content-Type') || '').toLowerCase().startsWith('application/json')) return json(502, { error: 'Unerwartete Serverantwort.' });
        const body = await response.text();
        if (new TextEncoder().encode(body).byteLength > 1024 * 1024) return json(502, { error: 'Antwort zu gross.' });
        return new Response(body, { status: response.status, headers });
    } catch { return json(502, { error: 'Chat ist momentan nicht erreichbar.' }); }
}

function json(status, data) { return new Response(JSON.stringify(data), { status, headers }); }

async function limitedBody(request) {
    if (!request.body) return new Uint8Array();
    const reader = request.body.getReader();
    const chunks = [];
    let size = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 256 * 1024) { await reader.cancel(); return null; }
        chunks.push(value);
    }
    const result = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
    return result;
}
