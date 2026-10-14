const JSON_HEADERS = {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
};

export async function onRequestGet(context) {
    const backendUrl = context.env.DIAGNOSTICS_ORIGIN_URL;
    const uploadPin = context.env.DIAGNOSTICS_UPLOAD_PIN;
    if (!backendUrl || !uploadPin) {
        return jsonResponse(503, 'Die Befehlsliste ist nicht konfiguriert.');
    }

    let target;
    try {
        target = new URL(backendUrl);
        if (target.protocol !== 'https:') {
            throw new Error('HTTPS required');
        }
        target.pathname = '/api/commands-feed';
        target.search = '';
    } catch {
        return jsonResponse(503, 'Die Befehlsliste ist fehlerhaft konfiguriert.');
    }

    try {
        const response = await fetch(target, {
            method: 'GET',
            headers: {
                Accept: 'application/json',
                Origin: target.origin,
                'X-OJE-Upload-Pin': uploadPin,
            },
            redirect: 'manual',
        });
        if (!response.ok || !(response.headers.get('Content-Type') || '').toLowerCase().startsWith('application/json')) {
            return jsonResponse(502, 'Die Befehlsliste ist momentan nicht erreichbar.');
        }
        const body = await response.text();
        if (new TextEncoder().encode(body).byteLength > 128_000) {
            return jsonResponse(502, 'Die Befehlsliste ist zu gross.');
        }
        const feed = JSON.parse(body);
        if (!Array.isArray(feed.commands)) {
            return jsonResponse(502, 'Die Befehlsliste ist ungueltig.');
        }
        return new Response(body, { status: 200, headers: JSON_HEADERS });
    } catch {
        return jsonResponse(502, 'Die Befehlsliste ist momentan nicht erreichbar.');
    }
}

export function onRequest() {
    return new Response(null, {
        status: 405,
        headers: { Allow: 'GET', 'Cache-Control': 'no-store' },
    });
}

function jsonResponse(status, error) {
    return new Response(JSON.stringify({ error }), { status, headers: JSON_HEADERS });
}
