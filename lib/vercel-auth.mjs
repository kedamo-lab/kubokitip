import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

const cookieName = 'cup_vercel_editor';
const digest = value => createHash('sha256').update(value).digest();
const equal = (a,b) => timingSafeEqual(digest(String(a)),digest(String(b)));
const sign = (value,password) => createHmac('sha256',password).update(value).digest('base64url');
export const configured = env => typeof env.ADMIN_PASSWORD === 'string' && env.ADMIN_PASSWORD.length >= 16;
export const passwordMatches = (input,env) => configured(env) && equal(input,env.ADMIN_PASSWORD);
export function sessionCookie(request,env) {
  const payload = Buffer.from(JSON.stringify({id:randomUUID(),exp:Date.now()+8*3600_000})).toString('base64url');
  const token = `${payload}.${sign(payload,env.ADMIN_PASSWORD)}`;
  return `${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${new URL(request.url).protocol==='https:'?'; Secure':''}`;
}
export function authContext(request,env) {
  const token = (request.headers.get('Cookie')||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(cookieName+'='))?.slice(cookieName.length+1);
  if (!configured(env) || !token) return {authorized:false,csrf:'',mode:'vercel'};
  try {
    const [payload,signature,...extra] = token.split('.');
    const value = JSON.parse(Buffer.from(payload,'base64url').toString());
    if (extra.length || !signature || !equal(signature,sign(payload,env.ADMIN_PASSWORD)) || !value.id || !Number.isFinite(value.exp) || value.exp<=Date.now()) throw new Error('Invalid session');
    return {authorized:true,csrf:sign('csrf:'+token,env.ADMIN_PASSWORD),mode:'vercel'};
  } catch { return {authorized:false,csrf:'',mode:'vercel'}; }
}
export function requireWrite(request,context) {
  if (!context.authorized) throw Object.assign(new Error('Войдите в панель редактирования.'),{status:403});
  const origin = request.headers.get('Origin');
  if (origin && origin!==new URL(request.url).origin) throw Object.assign(new Error('Запрос с другого сайта отклонён.'),{status:403});
  if (!equal(request.headers.get('X-Cup-CSRF')||'',context.csrf)) throw Object.assign(new Error('Обновите панель и повторите действие.'),{status:403});
}
