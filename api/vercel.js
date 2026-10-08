import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { handleUpload } from '@vercel/blob/client';
import { handleCms, CmsError, fileTypes } from '../lib/cms.mjs';
import { configured, passwordMatches, sessionCookie, authContext, requireWrite } from '../lib/vercel-auth.mjs';
import { vercelStore, stagingPattern } from '../lib/vercel-store.mjs';

const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const html=(body,status=200)=>new Response(body,{status,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Frame-Options':'DENY'}});
function loginPage(message=''){
  return `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Вход — Кубок ИТиП</title><link rel="stylesheet" href="/admin.css"><body class="login-page"><main class="login-card"><a href="/"><img src="/assets/logo.svg" alt="Кубок ИТиП" width="140"></a><p class="eyebrow">ПАНЕЛЬ РЕДАКТИРОВАНИЯ</p><h1>Вход в редактор</h1><p class="login-message" role="status">${message||'Введите пароль владельца сайта.'}</p><form action="/api/login" method="post"><label>Пароль<input name="password" type="password" autocomplete="current-password" required maxlength="256"></label><button class="primary-button" type="submit">Войти</button></form><a class="login-back" href="/">Вернуться на сайт</a></main></body></html>`;
}
export function createVercelHandler({env=process.env,store=vercelStore({env}),uploadHandler=handleUpload,readPage=()=>readFile(path.join(process.cwd(),'public/admin.html'),'utf8')}={}){
  return async request=>{
    try{
      const url=new URL(request.url);
      const routed=url.searchParams.get('route');
      if(routed){url.pathname='/'+routed.replace(/^\//,'');url.searchParams.delete('route');request=new Request(url,request);}
      const route=url.pathname,context=authContext(request,env);
      if(route==='/admin'||route==='/admin/'){
        if(request.method!=='GET')return json({error:'Метод не поддерживается.'},405);
        if(!configured(env))return html(loginPage('Добавьте ADMIN_PASSWORD длиной от 16 символов в настройках Vercel и выполните Redeploy.'),503);
        if(!env.BLOB_READ_WRITE_TOKEN)return html(loginPage('Подключите приватный Blob Store к проекту Vercel и выполните Redeploy.'),503);
        if(!context.authorized)return html(loginPage());
        const page=await readPage();
        return html(page.replace('<div class="toolbar-actions">','<div class="toolbar-actions"><form action="/api/logout" method="post"><input type="hidden" name="csrf" value="'+context.csrf+'"><button class="secondary-button" type="submit">Выйти</button></form>'));
      }
      if(route==='/api/login'&&request.method==='POST'){
        const origin=request.headers.get('Origin');
        if(origin&&origin!==url.origin)return json({error:'Запрос с другого сайта отклонён.'},403);
        if(!configured(env)||!env.BLOB_READ_WRITE_TOKEN)return html(loginPage('Панель ещё не настроена. Добавьте пароль и подключите приватный Blob Store.'),503);
        if(Number(request.headers.get('Content-Length')||0)>4096)return json({error:'Запрос слишком большой.'},413);
        const password=(await request.formData()).get('password');
        if(typeof password!=='string'||!passwordMatches(password,env))return html(loginPage('Неверный пароль.'),401);
        return new Response(null,{status:303,headers:{Location:'/admin','Set-Cookie':sessionCookie(request,env),'Cache-Control':'no-store'}});
      }
      if(route==='/api/logout'&&request.method==='POST'){
        const csrf=(await request.formData()).get('csrf');
        const headers=new Headers(request.headers);headers.set('X-Cup-CSRF',String(csrf||''));requireWrite(new Request(request.url,{method:'POST',headers}),context);
        return new Response(null,{status:303,headers:{Location:'/admin','Set-Cookie':'cup_vercel_editor=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'+(url.protocol==='https:'?'; Secure':''),'Cache-Control':'no-store'}});
      }
      if(route==='/api/blob-upload'&&request.method==='POST'){
        if(Number(request.headers.get('Content-Length')||0)>10000)throw new CmsError('Запрос слишком большой.',413);
        const body=await request.json();
        // SDK verifies its callback signature; browser token requests require our session and CSRF.
        const result=await uploadHandler({body,request,token:env.BLOB_READ_WRITE_TOKEN,
          onBeforeGenerateToken:async(pathname,payload)=>{
            const client=JSON.parse(payload||'{}');const headers=new Headers(request.headers);headers.set('X-Cup-CSRF',client.csrf||'');requireWrite(new Request(request.url,{method:'POST',headers}),context);
            if(!stagingPattern.test(pathname))throw new CmsError('Некорректное имя файла.');
            const ext=pathname.split('.').pop().toLowerCase();
            return {allowedContentTypes:[fileTypes[ext]],maximumSizeInBytes:25*1024*1024,validUntil:Date.now()+15*60_000,addRandomSuffix:false,allowOverwrite:false};
          },
        });return json(result);
      }
      if(route==='/api/finalize-upload'&&request.method==='POST'){
        requireWrite(request,context);if(Number(request.headers.get('Content-Length')||0)>4096)throw new CmsError('Запрос слишком большой.',413);
        const body=await request.json();return json(await store.finalize(body.pathname,body.name),201);
      }
      if(route.startsWith('/uploads/')&&request.method==='GET'){
        const object=await store.file(route.slice(1));if(!object)return new Response('Not found',{status:404});
        return new Response(object.stream,{headers:{'Content-Type':object.blob.contentType||'application/octet-stream','Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; sandbox",'ETag':object.blob.etag}});
      }
      if(route.startsWith('/api/')){
        if(route==='/api/session')return json({...context,storageReady:Boolean(env.BLOB_READ_WRITE_TOKEN)});
        // Vercel limits function request bodies; the editor uses direct Blob uploads for larger files.
        if(route==='/api/upload'&&Number(request.headers.get('Content-Length')||0)>4_000_000)throw new CmsError('Используйте загрузку через панель редактирования.',413);
        return handleCms(request,store,context);
      }
      return new Response('Not found',{status:404});
    }catch(error){return json({error:error.status?error.message:'Не удалось выполнить действие. Проверьте настройки Blob в Vercel.'},error.status||500);}
  };
}
export default {fetch:createVercelHandler()};
