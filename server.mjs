import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('dist');
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.pdf':'application/pdf','.mp4':'video/mp4'};
http.createServer(async (req,res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const file = path.resolve(root,'.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    const content = await fs.readFile(file);
    res.writeHead(200,{'Content-Type':types[path.extname(file)] || 'application/octet-stream','Cache-Control':'no-cache'});
    res.end(content);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(4173,'127.0.0.1',() => console.log('Local: http://127.0.0.1:4173'));
