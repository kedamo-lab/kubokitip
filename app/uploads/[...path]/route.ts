import { env } from 'cloudflare:workers';
import { cloudStore } from '../../../lib/cloud-store.mjs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
 const key = new URL(request.url).pathname.slice('/uploads/'.length);
 if (!/^[\da-f-]+\.(png|jpe?g|webp|avif|gif|svg|pdf|mp4|webm|woff2?)$/i.test(key)) return new Response('Not found', {status:404});
 const object = await cloudStore(env).file(key);
 if (!object) return new Response('Not found', {status:404});
 const headers = new Headers({'Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; sandbox"});
 object.writeHttpMetadata(headers);
 return new Response(object.body, {headers});
}
