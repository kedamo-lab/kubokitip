import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { handleCms, CmsError, fileTypes, validateDocument } from './lib/cms.mjs';
const root = path.resolve('public');
const runtime = path.resolve('.local');
await fs.mkdir(path.join(runtime,'uploads'),{recursive:true});
const stateFile=path.join(runtime,'content.json'),historyFile=path.join(runtime,'history.json');
const atomic=async(file,value)=>{const temp=file+'.'+randomUUID()+'.tmp';await fs.writeFile(temp,JSON.stringify(value,null,2));await fs.rename(temp,file);};
const read=async()=>{const state=JSON.parse(await fs.readFile(stateFile,'utf8'));state.data=validateDocument(state.data);return state;};
try{await read();}catch(error){if(error.code!=='ENOENT')throw error;const data=validateDocument(JSON.parse(await fs.readFile(path.join(root,'data/seasons.json'),'utf8')));await atomic(stateFile,{data,revision:0,updatedAt:new Date().toISOString()});}
const history=async()=>{try{return JSON.parse(await fs.readFile(historyFile,'utf8'));}catch(error){if(error.code==='ENOENT')return [];throw error;}};
let queue=Promise.resolve();
const store={read,async save(data,revision){const operation=queue.then(async()=>{const current=await read();if(current.revision!==revision)throw new CmsError('Сайт уже изменён в другой вкладке. Экспортируйте черновик, затем загрузите свежие данные.',409);const versions=await history();versions.unshift(current);await atomic(historyFile,versions.slice(0,20));const next={data,revision:revision+1,updatedAt:new Date().toISOString()};await atomic(stateFile,next);return next;});queue=operation.catch(()=>{});return operation;},async history(){return (await history()).map(({revision,updatedAt})=>({revision,updatedAt}));},async version(revision){return (await history()).find(v=>v.revision===revision);},async upload(info){await fs.writeFile(path.join(runtime,'uploads',info.key),info.bytes);},async files(){const names=await fs.readdir(path.join(runtime,'uploads'));return Promise.all(names.map(async name=>({name,url:'/uploads/'+name,size:(await fs.stat(path.join(runtime,'uploads',name))).size})));}};
const localAddresses=new Set(['127.0.0.1','::1',...Object.values(os.networkInterfaces()).flat().filter(Boolean).map(a=>a.address)]);
const sessions=new Map();
const host = process.env.HOST || '0.0.0.0';
const port = Number(process.env.PORT || 4173);
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.pdf':'application/pdf','.mp4':'video/mp4'};
http.createServer(async (req,res) => {
  try {
    const url=new URL(req.url,`http://${req.headers.host}`),pathname=decodeURIComponent(url.pathname);
    if(pathname.startsWith('/api/')){
      const trusted=localAddresses.has((req.socket.remoteAddress||'').replace(/^::ffff:/,''));
      let token=(req.headers.cookie||'').match(/(?:^|; )cup_editor=([\da-f-]+)/)?.[1];
      if(pathname==='/api/session'&&trusted&&!(token&&sessions.get(token)>Date.now())){token=randomUUID();sessions.set(token,Date.now()+8*3600_000);res.setHeader('Set-Cookie',`cup_editor=${token}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=28800`);}
      const authorized=trusted&&Boolean(token&&sessions.get(token)>Date.now());
      let bytes=0;const chunks=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>26*1024*1024)throw new CmsError('Файл слишком большой.',413);chunks.push(chunk);}
      const request=new Request(url,{method:req.method,headers:req.headers,...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(chunks)})});
      const response=await handleCms(request,store,{authorized,csrf:token||'',mode:'local'});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
    }
    const uploads=pathname.startsWith('/uploads/'),base=uploads?path.join(runtime,'uploads'):root;
    const relative=uploads?pathname.slice('/uploads'.length):pathname==='/'?'/index.html':pathname==='/admin'||pathname==='/admin/'?'/admin.html':pathname;
    const file = path.resolve(base,'.'+relative);
    if (!file.startsWith(base + path.sep)) { res.writeHead(403); res.end(); return; }
    const content = await fs.readFile(file);
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||fileTypes[path.extname(file).slice(1)]||'application/octet-stream','Cache-Control':uploads?'public,max-age=31536000,immutable':'no-cache','X-Content-Type-Options':'nosniff',...(uploads?{'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; sandbox"}:{})});
    res.end(content);
  } catch(error) { res.writeHead(error.status||404); res.end(error instanceof CmsError?error.message:'Not found'); }
}).listen(port,host,() => {
  console.log(`Local: http://127.0.0.1:${port}`);
  if (host === '0.0.0.0') {
    for (const addresses of Object.values(os.networkInterfaces())) {
      for (const address of addresses || []) {
        if (address.family === 'IPv4' && !address.internal) console.log(`Network: http://${address.address}:${port}`);
      }
    }
  }
});
