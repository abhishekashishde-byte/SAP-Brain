// Cloudflare Pages staging bridge. Keep the existing Vercel Node APIs available
// while the API handlers are converted and verified for the Workers runtime.
// This is deliberately not a production cutover.
const BACKEND='https://ask-wani.vercel.app';
export async function onRequest({request}) {
  const source=new URL(request.url);
  const target=new URL(source.pathname+source.search,BACKEND);
  const headers=new Headers(request.headers);
  headers.delete('host');
  headers.delete('cf-connecting-ip');
  headers.delete('x-forwarded-host');
  const upstream=await fetch(new Request(target.toString(),{method:request.method,headers,body:['GET','HEAD'].includes(request.method)?undefined:request.body,redirect:'manual',duplex:'half'}));
  const responseHeaders=new Headers(upstream.headers);
  responseHeaders.delete('content-encoding');
  responseHeaders.delete('content-length');
  responseHeaders.delete('transfer-encoding');
  return new Response(upstream.body,{status:upstream.status,statusText:upstream.statusText,headers:responseHeaders});
}
