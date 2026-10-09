import {readFile} from 'node:fs/promises';
import {handleCms} from './cms.mjs';
import {configured,passwordMatches,sessionCookie,authContext,requireWrite} from './vercel-auth.mjs';
import {s3Store,s3Configured} from './s3-store.mjs';

const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const html=(body,status=200)=>new Response(body,{status,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Frame-Options':'DENY'}});
function loginPage(message='Введите пароль владельца сайта.'){
  return `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Вход — Кубок ИТиП</title><link rel="stylesheet" href="/admin.css"><body class="login-page"><main class="login-card"><a href="/"><img src="/assets/logo.svg" alt="Кубок ИТиП" width="140"></a><p class="eyebrow">ПАНЕЛЬ РЕДАКТИРОВАНИЯ</p><h1>Вход в редактор</h1><p class="login-message" role="status">${message}</p><form action="/api/login" method="post"><label>Пароль<input name="password" type="password" autocomplete="current-password" required maxlength="256"></label><button class="primary-button" type="submit">Войти</button></form><a class="login-back" href="/">Вернуться на сайт</a></main></body></html>`;
}
export function createLayeroHandler({env=process.env,store=s3Store({env}),readPage=()=>readFile(new URL('../public/admin.html',import.meta.url),'utf8')}={}){
  return async request=>{
    try{
      const url=new URL(request.url),route=url.pathname;
      const storageReady=s3Configured(env);
      const context={...authContext(request,env),mode:'layero'};
      if(route==='/admin'||route==='/admin/'){
        if(request.method!=='GET')return json({error:'Метод не поддерживается.'},405);
        if(!configured(env)||!storageReady)return html(loginPage('Панель ещё не настроена. Добавьте пароль владельца и подключите хранилище.'),503);
        if(!context.authorized)return html(loginPage());
        return html((await readPage()).replace('<div class="toolbar-actions">','<div class="toolbar-actions"><form action="/api/logout" method="post"><input type="hidden" name="csrf" value="'+context.csrf+'"><button class="secondary-button" type="submit">Выйти</button></form>'));
      }
      if(route==='/api/login'&&request.method==='POST'){
        if(request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin)return json({error:'Запрос с другого сайта отклонён.'},403);
        if(!configured(env)||!storageReady)return html(loginPage('Панель ещё не настроена.'),503);
        if(Number(request.headers.get('Content-Length')||0)>4096)return json({error:'Запрос слишком большой.'},413);
        const password=(await request.formData()).get('password');
        if(typeof password!=='string'||!passwordMatches(password,env))return html(loginPage('Неверный пароль.'),401);
        return new Response(null,{status:303,headers:{Location:'/admin','Set-Cookie':sessionCookie(request,env),'Cache-Control':'no-store'}});
      }
      if(route==='/api/logout'&&request.method==='POST'){
        const csrf=(await request.formData()).get('csrf');
        const headers=new Headers(request.headers);headers.set('X-Cup-CSRF',String(csrf||''));
        requireWrite(new Request(request.url,{method:'POST',headers}),context);
        return new Response(null,{status:303,headers:{Location:'/admin','Set-Cookie':'cup_vercel_editor=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'+(url.protocol==='https:'?'; Secure':''),'Cache-Control':'no-store'}});
      }
      if(route==='/api/session')return json({...context,storageReady});
      if(route.startsWith('/api/'))return handleCms(request,store,context);
      if(route.startsWith('/uploads/')&&['GET','HEAD'].includes(request.method)){
        const file=await store.file(route.slice(1));if(!file)return new Response('Not found',{status:404});
        const headers={'Content-Type':file.type,'Content-Length':String(file.bytes.byteLength),'ETag':file.etag,'Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; sandbox"};
        if(request.headers.get('If-None-Match')===file.etag)return new Response(null,{status:304,headers:{ETag:file.etag,'Cache-Control':headers['Cache-Control']}});
        return new Response(request.method==='HEAD'?null:file.bytes,{headers});
      }
      return new Response('Not found',{status:404});
    }catch(error){return json({error:error.status?error.message:'Не удалось выполнить действие. Проверьте подключение к хранилищу.'},error.status||500);}
  };
}
