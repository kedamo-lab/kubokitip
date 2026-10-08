import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createVercelHandler } from '../api/vercel.js';
import { vercelStore } from '../lib/vercel-store.mjs';
import { authContext } from '../lib/vercel-auth.mjs';
import { fakeBlob } from './fake-blob.mjs';

const env={ADMIN_PASSWORD:'fixture-only-editor-password',BLOB_READ_WRITE_TOKEN:'fixture-only-blob-token'};
const origin='https://fixture.test';
function fixture(){const blob=fakeBlob();const store=()=>vercelStore({blob,env});const handler=()=>createVercelHandler({env,store:store(),readPage:async()=>'<div class="toolbar-actions"></div>'});return {blob,store,handler};}
async function login(handle){
  const response=await handle(new Request(origin+'/api/login',{method:'POST',headers:{Origin:origin},body:new URLSearchParams({password:env.ADMIN_PASSWORD})}));
  assert.equal(response.status,303);const cookie=response.headers.get('Set-Cookie').split(';')[0];const auth=await handle(new Request(origin+'/api/session',{headers:{Cookie:cookie}}));return {cookie,csrf:(await auth.json()).csrf};
}
const write=(route,auth,data,method='PUT')=>new Request(origin+route,{method,headers:{Cookie:auth.cookie,Origin:origin,'X-Cup-CSRF':auth.csrf,'Content-Type':'application/json'},body:JSON.stringify(data)});

test('Vercel routes protect the editor, authenticate, reject tampering, and support logout',async()=>{
  const {handler}=fixture(),handle=handler();
  assert.match(await (await handle(new Request(origin+'/api/vercel?route=admin'))).text(),/Вход в редактор/);
  const denied=await handle(new Request(origin+'/api/login',{method:'POST',body:new URLSearchParams({password:'wrong'})}));assert.equal(denied.status,401);
  const cross=await handle(new Request(origin+'/api/login',{method:'POST',headers:{Origin:'https://elsewhere.test'},body:new URLSearchParams({password:env.ADMIN_PASSWORD})}));assert.equal(cross.status,403);
  const auth=await login(handle);assert.ok(auth.csrf);
  assert.match(await (await handle(new Request(origin+'/admin',{headers:{Cookie:auth.cookie}}))).text(),/Выйти/);
  assert.equal(authContext(new Request(origin,{headers:{Cookie:auth.cookie+'x'}}),env).authorized,false);
  assert.equal(authContext(new Request(origin,{headers:{Cookie:auth.cookie}}),{...env,ADMIN_PASSWORD:'changed-editor-password'}).authorized,false);
  const request=new Request(origin+'/api/logout',{method:'POST',headers:{Cookie:auth.cookie,Origin:origin},body:new URLSearchParams({csrf:auth.csrf})});const logout=await handle(request);assert.equal(logout.status,303);assert.match(logout.headers.get('Set-Cookie'),/Max-Age=0/);
});

test('Settings persist across new function instances, including history and restore',async()=>{
  const {handler}=fixture(),handle=handler(),auth=await login(handle);
  const initial=await (await handle(new Request(origin+'/api/content'))).json();
  const draft=structuredClone(initial.data);draft.site.name='Сохранённый Кубок';
  const saved=await handle(write('/api/vercel?route=api/content',auth,{data:draft,revision:0}));assert.equal(saved.status,200);
  const fresh=handler();const current=await (await fresh(new Request(origin+'/api/content'))).json();assert.equal(current.data.site.name,'Сохранённый Кубок');assert.equal(current.revision,1);
  const denied=await fresh(write('/api/content',{cookie:'',csrf:''},{data:draft,revision:1}));assert.equal(denied.status,403);
  const noCsrf=await fresh(write('/api/content',{cookie:auth.cookie,csrf:'wrong'},{data:draft,revision:1}));assert.equal(noCsrf.status,400);
  const history=await (await fresh(new Request(origin+'/api/history',{headers:{Cookie:auth.cookie}}))).json();assert.equal(history[0].revision,0);
  const restore=await fresh(write('/api/restore',auth,{version:0,revision:1},'POST'));assert.equal(restore.status,200);assert.equal((await restore.json()).data.site.name,initial.data.site.name);
});

test('Atomic Blob writes reject simultaneous saves, including first initialization',async()=>{
  for(const initialized of [false,true]){
    const {store}=fixture();const a=store(),b=store();let state=await a.read();
    if(initialized)state=await a.save(state.data,state.revision);
    const first=structuredClone(state.data),second=structuredClone(state.data);first.site.name='Первый';second.site.name='Второй';
    const results=await Promise.allSettled([a.save(first,state.revision),b.save(second,state.revision)]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(results.find(r=>r.status==='rejected').reason.status,409);
    assert.equal((await store().read()).revision,state.revision+1);
  }
});

test('Only twenty previous versions remain in the history',async()=>{
  const {store,blob}=fixture();let current=await store().read();
  for(let i=0;i<22;i++)current=await store().save(current.data,current.revision);
  assert.equal((await store().history()).length,20);assert.equal(await store().version(0),null);assert.equal(blob.files.has('cms/history/0.json'),false);assert.equal((await store().version(21)).revision,21);
});

test('Direct uploads require session/CSRF, enforce 25 MB, and never grant state-file access',async()=>{
  const {store}=fixture();let options;
  const uploadHandler=async input=>{options=await input.onBeforeGenerateToken(input.body.pathname,input.body.clientPayload);return {clientToken:'fixture-scoped-token'};};
  const handle=createVercelHandler({env,store:store(),uploadHandler});const auth=await login(handle);
  const body={pathname:`staging/${randomUUID()}.png`,clientPayload:JSON.stringify({csrf:auth.csrf})};
  const response=await handle(write('/api/blob-upload',auth,body,'POST'));assert.equal(response.status,200);assert.equal(options.maximumSizeInBytes,25*1024*1024);assert.equal(options.allowOverwrite,false);
  assert.equal((await handle(write('/api/blob-upload',{cookie:'',csrf:''},body,'POST'))).status,403);
  assert.equal((await handle(write('/api/blob-upload',auth,{...body,pathname:'cms/state.json'},'POST'))).status,400);
  assert.equal((await handle(write('/api/blob-upload',auth,{...body,clientPayload:'{}'},'POST'))).status,403);
});

test('The real Blob SDK issues a scoped client token without exposing the store token',async()=>{
  const fixtureEnv={...env,BLOB_READ_WRITE_TOKEN:'vercel_blob_rw_fixturestore_fixture-secret-for-tests'};
  const handle=createVercelHandler({env:fixtureEnv,store:vercelStore({env:fixtureEnv,blob:fakeBlob()})});
  const auth=await login(handle);
  const pathname=`staging/${randomUUID()}.woff2`;
  const body={type:'blob.generate-client-token',payload:{pathname,clientPayload:JSON.stringify({csrf:auth.csrf}),multipart:false}};
  const response=await handle(write('/api/blob-upload',auth,body,'POST'));assert.equal(response.status,200);
  const token=(await response.json()).clientToken;assert.match(token,/^vercel_blob_client_fixturestore_/);assert.ok(!token.includes(fixtureEnv.BLOB_READ_WRITE_TOKEN));
  const denied=await handle(write('/api/blob-upload',{cookie:'',csrf:''},body,'POST'));assert.equal(denied.status,403);
});

test('Uploads validate SVG before publication and files survive new store instances',async()=>{
  const {store,blob,handler}=fixture();const pathname=`staging/${randomUUID()}.svg`;
  await blob.put(pathname,'<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>',{contentType:'image/svg+xml'});
  const file=await store().finalize(pathname,'logo.svg');assert.match(file.url,/^\/uploads\//);assert.equal(blob.files.has(pathname),false);
  assert.equal((await store().files()).length,1);
  const response=await handler()(new Request(origin+'/api/vercel?route='+file.url.slice(1)));assert.equal(response.status,200);assert.match(response.headers.get('Content-Security-Policy'),/sandbox/);assert.match(await response.text(),/<svg/);
  const unsafe=`staging/${randomUUID()}.svg`;await blob.put(unsafe,'<svg><script>alert(1)</script></svg>',{contentType:'image/svg+xml'});
  await assert.rejects(()=>store().finalize(unsafe,'bad.svg'),/SVG должен быть статическим/);
  assert.equal((await store().files()).length,1);assert.equal(await store().file('cms/state.json'),null);
});

test('Missing storage/password gives setup instructions without enabling editor writes',async()=>{
  const handle=createVercelHandler({env:{},store:vercelStore({env:{}})});
  assert.equal((await handle(new Request(origin+'/admin'))).status,503);
  assert.equal((await handle(new Request(origin+'/api/session'))).status,200);
  assert.equal((await handle(new Request(origin+'/api/content'))).status,200);
  assert.equal((await handle(write('/api/content',{cookie:'',csrf:''},{data:{},revision:0}))).status,403);
  await assert.rejects(()=>vercelStore({env:{}}).save({},0),/Подключите приватный Vercel Blob/);
});
