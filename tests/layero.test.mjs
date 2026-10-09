import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {s3Store} from '../lib/s3-store.mjs';
import {createLayeroHandler} from '../lib/layero-handler.mjs';
import {createLayeroServer} from '../layero-server.mjs';
import {uploadInfo} from '../lib/cms.mjs';
import {fakeS3} from './fake-s3.mjs';
import {migrateToLayero} from '../scripts/migrate-to-layero.mjs';

const env={ADMIN_PASSWORD:'fixture-only-editor-password',S3_BUCKET:'fixture-private-bucket',S3_ACCESS_KEY_ID:'fixture-access-id',S3_SECRET_ACCESS_KEY:'fixture-only-secret'};
const origin='https://fixture.test';
const fixture=()=>{
  const client=fakeS3(),store=()=>s3Store({env,client});
  const handler=()=>createLayeroHandler({env,store:store(),readPage:async()=>'<div class="toolbar-actions"></div>'});
  return {client,store,handler};
};
async function login(handle){
  const response=await handle(new Request(origin+'/api/login',{method:'POST',headers:{Origin:origin},body:new URLSearchParams({password:env.ADMIN_PASSWORD})}));
  assert.equal(response.status,303);assert.match(response.headers.get('Set-Cookie'),/HttpOnly.*Secure/);
  const cookie=response.headers.get('Set-Cookie').split(';')[0];
  const session=await (await handle(new Request(origin+'/api/session',{headers:{Cookie:cookie}}))).json();
  assert.equal(session.mode,'layero');assert.ok(session.csrf);
  assert.ok(!JSON.stringify(session).includes(env.S3_SECRET_ACCESS_KEY));return {cookie,csrf:session.csrf};
}
const write=(route,auth,data,method='PUT')=>new Request(origin+route,{method,headers:{Cookie:auth.cookie,Origin:origin,'X-Cup-CSRF':auth.csrf,'Content-Type':'application/json'},body:JSON.stringify(data)});

test('Layero authenticates the editor, rejects cross-site login and CSRF, supports logout',async()=>{
  const handle=fixture().handler();
  assert.match(await (await handle(new Request(origin+'/admin'))).text(),/Вход в редактор/);
  assert.equal((await handle(new Request(origin+'/api/login',{method:'POST',body:new URLSearchParams({password:'wrong'})}))).status,401);
  assert.equal((await handle(new Request(origin+'/api/login',{method:'POST',headers:{Origin:'https://other.test'},body:new URLSearchParams({password:env.ADMIN_PASSWORD})}))).status,403);
  const auth=await login(handle);
  assert.match(await (await handle(new Request(origin+'/admin',{headers:{Cookie:auth.cookie}}))).text(),/Выйти/);
  const initial=await (await handle(new Request(origin+'/api/content'))).json();
  assert.equal((await handle(write('/api/content',{cookie:'',csrf:''},{data:initial.data,revision:0}))).status,403);
  assert.equal((await handle(write('/api/content',{...auth,csrf:'wrong'},{data:initial.data,revision:0}))).status,400);
  const logout=await handle(new Request(origin+'/api/logout',{method:'POST',headers:{Cookie:auth.cookie,Origin:origin},body:new URLSearchParams({csrf:auth.csrf})}));
  assert.equal(logout.status,303);assert.match(logout.headers.get('Set-Cookie'),/Max-Age=0/);
});

test('Settings survive new server instances, repeated saves and restore',async()=>{
  const {handler}=fixture();const handle=handler(),auth=await login(handle);
  let current=await (await handle(new Request(origin+'/api/content'))).json();
  const original=current.data.site.name;
  for(let i=0;i<3;i++){
    const data=structuredClone(current.data);data.site.name='Изменение '+i;
    const response=await handler()(write('/api/content',auth,{data,revision:current.revision}));
    assert.equal(response.status,200);current=await response.json();
  }
  assert.equal(current.revision,3);
  assert.equal((await (await handler()(new Request(origin+'/api/content'))).json()).data.site.name,'Изменение 2');
  const restored=await handler()(write('/api/restore',auth,{version:0,revision:3},'POST'));
  assert.equal(restored.status,200);assert.equal((await restored.json()).data.site.name,original);
});

test('Conditional S3 writes reject simultaneous first saves and edits without losing history',async()=>{
  for(const initialized of [false,true]){
    const {store,client}=fixture();let current=await store().read();
    if(initialized)current=await store().save(current.data,current.revision);
    const a=structuredClone(current.data),b=structuredClone(current.data);
    a.site.name='Первая вкладка';b.site.name='Вторая вкладка';
    const results=await Promise.allSettled([store().save(a,current.revision),store().save(b,current.revision)]);
    assert.equal(results.filter(item=>item.status==='fulfilled').length,1);
    assert.equal(results.find(item=>item.status==='rejected').reason.status,409);
    const latest=await store().read();assert.equal(latest.revision,current.revision+1);
    assert.deepEqual((await store().version(current.revision)).data,current.data);
    for(const call of client.calls.filter(call=>call.command==='PutObjectCommand'&&call.Key==='cms/state.json'))assert.ok(call.IfMatch||call.IfNoneMatch==='*');
  }
});

test('S3 keeps twenty immutable backups and paginates file listings',async()=>{
  const {store,client}=fixture();let current=await store().read();
  for(let i=0;i<22;i++)current=await store().save(current.data,current.revision);
  assert.equal((await store().history()).length,20);assert.equal(await store().version(0),null);
  assert.equal([...client.objects.keys()].filter(key=>key.startsWith('cms/history/')).length,20);
  for(let i=0;i<5;i++)await store().upload(await uploadInfo(new File(['photo '+i],i+'.png')));
  assert.equal((await store().files()).length,5);
});

test('Uploads validate SVG, preserve URLs, support HEAD and conditional reads',async()=>{
  const {store,handler}=fixture(),handle=handler(),auth=await login(handle);
  const form=new FormData();form.set('file',new File(['<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>'],'logo.svg'));
  const response=await handle(new Request(origin+'/api/upload',{method:'POST',headers:{Origin:origin,Cookie:auth.cookie,'X-Cup-CSRF':auth.csrf},body:form}));
  assert.equal(response.status,201);const {url}=await response.json();
  const media=await handler()(new Request(origin+url));assert.equal(media.status,200);
  assert.match(media.headers.get('Content-Security-Policy'),/sandbox/);assert.match(await media.text(),/<svg/);
  const head=await handle(new Request(origin+url,{method:'HEAD'}));assert.equal(head.status,200);assert.equal(await head.text(),'');
  assert.equal((await handle(new Request(origin+url,{headers:{'If-None-Match':media.headers.get('ETag')}}))).status,304);
  await assert.rejects(()=>store().upload({key:randomUUID()+'.svg',name:'bad.svg',bytes:Buffer.from('<svg><script/></svg>')}),/SVG должен быть статическим/);
  assert.equal(await store().file('cms/state.json'),null);assert.equal((await store().files()).length,1);
});

test('Migration preserves current revision, history and file names, refuses a populated target',async()=>{
  const {store}=fixture();const data=(await store().read()).data;
  data.site.name='Живые данные';
  const snapshot={current:{data,revision:8,updatedAt:'2026-10-09T12:00:00.000Z'},history:[{data,revision:7,updatedAt:null}],files:[{key:randomUUID()+'.png',name:'photo.png',bytes:Buffer.from('photo bytes')}]};
  const result=await store().importState(snapshot);assert.deepEqual(result,{revision:8,history:1,files:1});
  assert.deepEqual(await store().read(),snapshot.current);assert.equal((await store().version(7)).revision,7);
  assert.equal(Buffer.from((await store().file('uploads/'+snapshot.files[0].key)).bytes).toString(),'photo bytes');
  await assert.rejects(()=>store().importState(snapshot),error=>error.status===409);
});

test('Invalid migration is rejected before writing any files; capacity limits block uploads',async()=>{
  const {store,client}=fixture();const current=await store().read();
  await assert.rejects(()=>store().importState({current,files:[{key:randomUUID()+'.svg',name:'bad.svg',bytes:Buffer.from('<svg><script/></svg>')}]}),/SVG должен быть статическим/);
  assert.equal(client.objects.size,0);
  const tiny=s3Store({env:{...env,S3_STORAGE_LIMIT_BYTES:'2'},client});
  await assert.rejects(()=>tiny.upload({key:randomUUID()+'.png',name:'a.png',bytes:Buffer.from('more than two')}),error=>error.status===413);
  assert.equal(client.objects.size,0);
});

test('Without storage, landing data remains available and the editor is disabled',async()=>{
  const handle=createLayeroHandler({env:{}});
  assert.equal((await handle(new Request(origin+'/admin'))).status,503);
  assert.equal((await handle(new Request(origin+'/api/content'))).status,200);
  assert.equal((await (await handle(new Request(origin+'/api/session'))).json()).storageReady,false);
  assert.equal((await handle(write('/api/content',{cookie:'',csrf:''},{data:{},revision:0}))).status,403);
});

test('Migration driver copies and verifies settings, history and files through authenticated APIs',async()=>{
  const source=fixture(),target=fixture().store(),sourceStore=source.store();
  const info=await uploadInfo(new File(['photo bytes'],'team.png'));
  await sourceStore.upload(info);
  let current=await sourceStore.read();
  current.data.site.logos.hero=origin+'/uploads/'+info.key;
  current=await sourceStore.save(current.data,0);
  current.data.site.name='Последние данные';await sourceStore.save(current.data,1);
  const handle=source.handler();
  const result=await migrateToLayero({sourceUrl:origin,sourcePassword:env.ADMIN_PASSWORD,target,fetcher:(url,options)=>handle(new Request(url,options))});
  assert.deepEqual(result,{revision:2,history:2,files:1,bytes:11,verified:true});
  assert.equal((await target.read()).data.site.name,'Последние данные');
  assert.equal((await target.read()).data.site.logos.hero,'/uploads/'+info.key);
  assert.equal((await target.version(1)).data.site.logos.hero,'/uploads/'+info.key);
});

test('Migration driver refuses changed source data before touching the target',async()=>{
  const source=fixture(),targetFixture=fixture(),handle=source.handler();let reads=0;
  await assert.rejects(()=>migrateToLayero({sourceUrl:origin,sourcePassword:env.ADMIN_PASSWORD,target:targetFixture.store(),fetcher:async(url,options)=>{
    if(new URL(url).pathname==='/api/content'&&++reads===2){
      const current=await source.store().read();current.data.site.name='Правка во время переноса';await source.store().save(current.data,current.revision);
    }
    return handle(new Request(url,options));
  }}),/Во время переноса исходный сайт изменился/);
  assert.equal(targetFixture.client.objects.size,0);
});

test('Node server serves built assets, hides the admin source and preserves HTTPS origin',async t=>{
  const handle=fixture().handler(),server=createLayeroServer({handle,origin});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base='http://127.0.0.1:'+server.address().port;
  assert.equal((await fetch(base+'/')).status,200);
  assert.equal((await fetch(base+'/assets/logo.svg')).status,200);
  assert.equal((await fetch(base+'/admin.html')).status,404);
  assert.equal((await fetch(base+'/%2e%2e%5cpackage.json')).status,404);
  assert.equal(await (await fetch(base+'/healthz')).text(),'ok');
  const loginResponse=await fetch(base+'/api/login',{method:'POST',redirect:'manual',headers:{Origin:origin},body:new URLSearchParams({password:env.ADMIN_PASSWORD})});
  assert.equal(loginResponse.status,303);assert.match(loginResponse.headers.get('Set-Cookie'),/Secure/);
  const session=await fetch(base+'/api/session',{headers:{Cookie:loginResponse.headers.get('Set-Cookie').split(';')[0]}});
  assert.equal((await session.json()).authorized,true);
});
