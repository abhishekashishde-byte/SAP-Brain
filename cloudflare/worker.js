// Staging only. Cloudflare serves Vite static assets; Vercel still runs the API.
// Do NOT point the primary Wani domain here until the APIs are migrated and tested.
const API_ORIGIN = 'https://ask-wani.vercel.app';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }
    const target = new URL(url.pathname + url.search, API_ORIGIN);
    const headers = new Headers(request.headers);
    headers.delete('host');
    headers.delete('cf-connecting-ip');
    headers.delete('x-forwarded-host');
    headers.delete('x-forwarded-proto');
    const init = {
      method: request.method,
      headers,
      redirect: 'manual',
      ...(request.method === 'GET' || request.method === 'HEAD' ? {} : { body: request.body })
    };
    const upstream = await fetch(new Request(target, init));
    const outputHeaders = new Headers(upstream.headers);
    outputHeaders.delete('content-length');
    outputHeaders.delete('content-encoding');
    outputHeaders.delete('transfer-encoding');
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: outputHeaders
    });
  }
};
