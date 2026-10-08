import { env } from 'cloudflare:workers';
import { handleCms } from '../../../lib/cms.mjs';
import { cloudStore } from '../../../lib/cloud-store.mjs';
export const dynamic = 'force-dynamic';
// Dispatch protects this existing owner-private Site. Keep its audience private.
const handler = (request: Request) => handleCms(request, cloudStore(env), { authorized: true, mode: 'hosted' });
export const GET = handler;
export const POST = handler;
export const PUT = handler;
