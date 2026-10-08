import test from 'node:test';
import assert from 'node:assert/strict';
import {handleCms,validateDocument} from '../lib/cms.mjs';
import seed from '../public/data/seasons.json' with {type:'json'};
const base=process.env.CMS_TEST_URL||'http://127.0.0.1:4180';
assert.equal(new URL(base).hostname,'127.0.0.1','Integration checks run only against the isolated local preview.');
const request=(path,options={})=>fetch(base+'/api/'+path,options);
const read=async()=>(await request('content')).json();
const save=(data,revision)=>request('content',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({data,revision})});
test('валидация защищает сезон, счёт, ссылки и составы',()=>{
 assert.throws(()=>validateDocument({...seed,currentSeason:'2099'}));
 const invalid=structuredClone(seed);invalid.seasons[0].disciplines[0].matches=[{id:'bad',status:'finished',stage:'Финал',team1Id:'deleted',score1:-1}];assert.throws(()=>validateDocument(invalid));
 const badOrder=structuredClone(seed);badOrder.seasons[0].order=['hero'];assert.throws(()=>validateDocument(badOrder));
});
test('запись без доступа и запрос с чужого сайта отклоняются',async()=>{
 const mock={read:async()=>({data:seed,revision:0})};
 const denied=await handleCms(new Request('https://site.test/api/content',{method:'PUT',body:'{}'}),mock,{authorized:false});assert.equal(denied.status,403);
 const cross=await handleCms(new Request('https://site.test/api/content',{method:'PUT',headers:{Origin:'https://other.test'},body:'{}'}),mock,{authorized:true});assert.equal(cross.status,400);
});
test('D1 сохраняет все категории, защищает от конфликтов и восстанавливает историю',async()=>{
 const original=await read();let current=original;
 try{
  const data=structuredClone(original.data);data.site.name='Проверка редактора';data.site.colors.accent='#DDEEFF';data.seasons[0].content.hero.tagline='Новый слоган';
  const game=data.seasons[0].disciplines[0];game.matches.push({id:'integration-match',date:'2026-07-10',time:'12:00',stage:'Финал',status:'finished',team1Id:game.teams[0].id,team2Id:game.teams[1].id,score1:2,score2:0,winnerId:game.teams[0].id,advancedTeamId:game.teams[0].id});game.bracket=[{name:'Финал',matches:[{matchId:'integration-match'}]}];game.winner={teamId:game.teams[0].id,photo:'assets/roster-3.png'};
  const next=structuredClone(data.seasons[0]);next.year='2027';next.media=[{type:'photo',src:'assets/banner.png',caption:'Тестовый кадр'}];data.seasons.push(next);
  const response=await save(data,original.revision);assert.equal(response.status,200);current=await response.json();
  const fresh=await read();assert.equal(fresh.data.site.name,'Проверка редактора');assert.equal(fresh.data.seasons.length,2);assert.equal(fresh.data.seasons[0].disciplines[0].winner.teamId,game.teams[0].id);assert.equal(fresh.data.seasons[0].disciplines[0].bracket[0].matches[0].matchId,'integration-match');
  const stale=await save(data,original.revision);assert.equal(stale.status,409);
  const versions=await (await request('history')).json();assert.ok(versions.some(v=>v.revision===original.revision));
  const backup=await (await request('version?revision='+original.revision)).json();assert.deepEqual(backup.data,original.data);
  const restored=await request('restore',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:original.revision,revision:current.revision})});assert.equal(restored.status,200);current=await restored.json();assert.deepEqual(current.data,original.data);
 }finally{const latest=await read();if(JSON.stringify(latest.data)!==JSON.stringify(original.data))await save(original.data,latest.revision);}
});
test('R2 сохраняет файлы и отклоняет SVG со скриптами',async()=>{
 const body=new FormData();body.append('file',new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><circle r="4" cx="5" cy="5"/></svg>'],{type:'image/svg+xml'}),'test.svg');
 const uploaded=await request('upload',{method:'POST',body});assert.equal(uploaded.status,201);const info=await uploaded.json();const file=await fetch(base+info.url);assert.equal(file.status,200);assert.match(file.headers.get('Content-Type'),/image\/svg\+xml/);assert.match(await file.text(),/<circle/);
 const unsafe=new FormData();unsafe.append('file',new Blob(['<svg><script>alert(1)</script></svg>']),'unsafe.svg');assert.equal((await request('upload',{method:'POST',body:unsafe})).status,400);
 const files=await (await request('assets')).json();assert.ok(files.some(f=>f.url===info.url));
});
