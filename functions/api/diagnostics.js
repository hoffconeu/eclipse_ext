const JSON_HEADERS = {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
};
const MAX_REQUEST_SIZE = 11 * 1024 * 1024;

export async function onRequestPost(context) {
    const backendUrl = context.env.DIAGNOSTICS_ORIGIN_URL;
    if (!backendUrl) {
        return jsonResponse(503, 'Der Diagnose-Proxy ist noch nicht konfiguriert.');
    }

    const contentType = context.request.headers.get('Content-Type') || '';
    if (!contentType.toLowerCase().startsWith('multipart/form-data;')) {
        return jsonResponse(415, 'Es werden nur Formulardaten akzeptiert.');
    }

    const declaredSize = Number(context.request.headers.get('Content-Length') || 0);
    if (declaredSize > MAX_REQUEST_SIZE) {
        return jsonResponse(413, 'Der Diagnose-Upload ist zu gross.');
    }

    const body = await context.request.arrayBuffer();
    if (body.byteLength > MAX_REQUEST_SIZE) {
        return jsonResponse(413, 'Der Diagnose-Upload ist zu gross.');
    }

    let target;
    try {
        target = new URL(backendUrl);
    } catch {
        return jsonResponse(503, 'Der Diagnose-Proxy ist fehlerhaft konfiguriert.');
    }

    if (target.protocol !== 'https:') {
        return jsonResponse(503, 'Der Diagnose-Proxy erfordert ein HTTPS-Ziel.');
    }

    const headers = new Headers({
        Accept: 'application/json',
        'Content-Type': contentType,
        Origin: target.origin,
    });

    try {
        const response = await fetch(target, {
            method: 'POST',
            headers,
            body,
            redirect: 'manual',
        });

        const responseType = response.headers.get('Content-Type') || '';
        if (!responseType.toLowerCase().startsWith('application/json')) {
            return jsonResponse(502, 'Der Diagnoseserver hat ungueltig geantwortet.');
        }

        return new Response(response.body, {
            status: response.status,
            headers: JSON_HEADERS,
        });
    } catch {
        return jsonResponse(502, 'Der Diagnoseserver ist momentan nicht erreichbar.');
    }
}

export function onRequestOptions() {
    return new Response(null, {
        status: 204,
        headers: {
            Allow: 'POST, OPTIONS',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
        },
    });
}

export function onRequest() {
    return new Response(null, {
        status: 405,
        headers: {
            Allow: 'POST, OPTIONS',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
        },
    });
}

function jsonResponse(status, error) {
    return new Response(JSON.stringify({ error }), {
        status,
        headers: JSON_HEADERS,
    });
}
