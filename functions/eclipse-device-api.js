const paths = {init: 'init', poll: 'poll', session: 'session'};

export async function onRequest(context) {
  const action = new URL(context.request.url).searchParams.get('action') || '';
  const match = /^(respond|ack)\/([a-f0-9-]{36})$/.exec(action);
  const suffix = paths[action] || (match && match[1] + '/' + match[2]);
  if (!suffix || !['GET', 'POST'].includes(context.request.method)) return new Response('Not found', {status: 404});
  const base = context.env.ECLIPSE_BRIDGE_ORIGIN_URL;
  if (!base) return new Response('Bridge not configured', {status: 503});
  let url;
  try { url = new URL(`${base.replace(/\/$/, '')}/device/${suffix}`); }
  catch { return new Response('Bridge configuration invalid', {status: 503}); }
  if (url.protocol !== 'https:') return new Response('HTTPS required', {status: 503});
  const headers = new Headers();
  for (const key of ['X-OJE-Device', 'X-OJE-Timestamp', 'X-OJE-Signature']) {
    const value = context.request.headers.get(key);
    if (value) headers.set(key, value);
  }
  const length = Number(context.request.headers.get('Content-Length') || 0);
  if (length > 2_000_000) return new Response('Too large', {status: 413});
  const body = context.request.method === 'POST' ? await context.request.arrayBuffer() : undefined;
  if (body && body.byteLength > 2_000_000) return new Response('Too large', {status: 413});
  try {
    const upstream = await fetch(url, {method: context.request.method, headers, body, redirect: 'manual'});
    const outbound = new Headers({'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff'});
    for (const key of ['X-OJE-Time', 'X-OJE-Server-Signature']) {
      const value = upstream.headers.get(key); if (value) outbound.set(key, value);
    }
    return new Response(upstream.body, {status: upstream.status, headers: outbound});
  } catch { return new Response('Bridge unavailable', {status: 502}); }
}
