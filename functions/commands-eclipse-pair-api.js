export async function onRequestPost(context) {
  const base = context.env.ECLIPSE_BRIDGE_ORIGIN_URL;
  const secret = context.env.ECLIPSE_BRIDGE_PROXY_SECRET;
  if (!base || !secret) return new Response('Bridge not configured', {status: 503});
  const url = new URL(`${base.replace(/\/$/, '')}/pair/confirm`);
  if (url.protocol !== 'https:') return new Response('HTTPS required', {status: 503});
  if (Number(context.request.headers.get('Content-Length') || 0) > 32)
    return new Response('Too large', {status: 413});
  const bytes = await context.request.arrayBuffer();
  if (bytes.byteLength > 32) return new Response('Too large', {status: 413});
  const code = new TextDecoder().decode(bytes).trim();
  if (!/^\d{8}$/.test(code)) return new Response('Invalid code', {status: 400});
  try {
    const upstream = await fetch(url, {method: 'POST', headers: {Authorization: `Bearer ${secret}`}, body: code, redirect: 'manual'});
    return new Response(upstream.body, {status: upstream.status,
      headers: {'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8'}});
  } catch { return new Response('Bridge unavailable', {status: 502}); }
}

export function onRequest() { return new Response('Method not allowed', {status: 405}); }
