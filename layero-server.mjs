import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createLayeroHandler} from './lib/layero-handler.mjs';

const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.avif':'image/avif','.woff':'font/woff','.woff2':'font/woff2','.pdf':'application/pdf','.mp4':'video/mp4','.webm':'video/webm'};
export function createLayeroServer({handle=createLayeroHandler(),publicDirectory=fileURLToPath(new URL('./layero-dist/',import.meta.url)),origin=process.env.PUBLIC_ORIGIN}={}){
  const root=path.resolve(publicDirectory);
  return http.createServer(async(req,res)=>{
    try{
      const url=new URL(req.url,origin||`http://${req.headers.host}`);
      const api=url.pathname.startsWith('/api/')||url.pathname.startsWith('/uploads/')||['/admin','/admin/'].includes(url.pathname);
      if(api){
        const limit=url.pathname==='/api/upload'?26*1024*1024:['/api/login','/api/logout'].includes(url.pathname)?4096:2_000_000;
        const chunks=[];let size=0;
        for await(const chunk of req){size+=chunk.length;if(size>limit)throw Object.assign(new Error('Запрос слишком большой.'),{status:413});chunks.push(chunk);}
        const request=new Request(url,{method:req.method,headers:req.headers,...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(chunks)})});
        const response=await handle(request);
        res.writeHead(response.status,Object.fromEntries(response.headers));
        if(response.body&&req.method!=='HEAD')await pipeline(Readable.fromWeb(response.body),res);else res.end();
        return;
      }
      if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
      if(url.pathname==='/healthz'){res.writeHead(200,{'Content-Type':'text/plain'});res.end('ok');return;}
      const pathname=decodeURIComponent(url.pathname),file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
      const relative=path.relative(root,file);
      if(relative.startsWith('..')||path.isAbsolute(relative)||pathname==='/admin.html'||pathname.includes('\0')){res.writeHead(404);res.end();return;}
      const bytes=await readFile(file);
      res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Content-Length':String(bytes.byteLength),'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
      res.end(req.method==='HEAD'?undefined:bytes);
    }catch(error){
      if(res.headersSent){res.destroy();return;}
      res.writeHead(error.status||404,{'Content-Type':'text/plain; charset=utf-8'});res.end(error.status===413?error.message:'Not found');
    }
  });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const port=Number(process.env.PORT||3000);
  createLayeroServer().listen(port,'0.0.0.0',()=>console.log(`Layero server listening on port ${port}`));
}
