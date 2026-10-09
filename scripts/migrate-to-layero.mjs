import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {s3Store,s3Configured} from '../lib/s3-store.mjs';

const uploadPath=/^\/uploads\/[\da-f-]{36}\.(png|jpe?g|webp|avif|gif|svg|pdf|mp4|webm|woff2?)$/i;
const digest=value=>createHash('sha256').update(value).digest('hex');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function localize(value,origin){
  if(typeof value==='string'&&value.startsWith(origin+'/uploads/')){
    const url=new URL(value);
    if(uploadPath.test(url.pathname))return url.pathname+url.search;
  }
  if(Array.isArray(value))return value.map(item=>localize(item,origin));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,localize(item,origin)]));
  return value;
}
export async function migrateToLayero({sourceUrl,sourcePassword,target,fetcher=fetch,onProgress=()=>{}}){
  const source=new URL(sourceUrl);
  if(source.protocol!=='https:')throw new Error('Источник переноса должен использовать HTTPS.');
  const login=await fetcher(source.origin+'/api/login',{method:'POST',redirect:'manual',headers:{Origin:source.origin},body:new URLSearchParams({password:sourcePassword})});
  if(login.status!==303)throw new Error('Не удалось войти в панель исходного сайта.');
  const cookie=login.headers.get('Set-Cookie')?.split(';')[0];
  if(!cookie)throw new Error('Исходный сайт не выдал сессию.');
  const read=async route=>{
    const response=await fetcher(source.origin+route,{headers:{Cookie:cookie},cache:'no-store',redirect:'error'});
    if(!response.ok)throw new Error('Не удалось прочитать данные переноса: '+route+' ('+response.status+').');
    return response;
  };
  let csrf;
  try{
    csrf=(await (await read('/api/session')).json()).csrf;
    const current=await (await read('/api/content')).json();
    const versions=await (await read('/api/history')).json();
    const history=[];
    for(const version of versions.slice(0,20))history.push(await (await read('/api/version?revision='+version.revision)).json());
    const assets=await (await read('/api/assets')).json(),files=[];
    if(assets.length>=1000)throw new Error('Нужен постраничный экспорт большой библиотеки файлов.');
    let size=0;
    for(const asset of assets){
      const url=new URL(asset.url,source.origin);
      if(url.origin!==source.origin||!uploadPath.test(url.pathname))throw new Error('Неожиданная ссылка файла при переносе.');
      if(!Number.isInteger(asset.size)||asset.size<=0||asset.size>25*1024*1024)throw new Error('Недопустимый размер файла.');
      size+=asset.size;
      if(size>850_000_000)throw new Error('Файлы превышают безопасный объём бесплатного хранилища.');
      const response=await read(url.pathname);
      const bytes=new Uint8Array(await response.arrayBuffer());
      if(bytes.byteLength!==asset.size)throw new Error('Размер загруженного файла не совпадает.');
      files.push({key:url.pathname.slice('/uploads/'.length),name:asset.name,bytes});
    }
    const known=new Set(files.map(file=>'/uploads/'+file.key));
    const inspect=value=>{
      if(typeof value==='string'&&(value.startsWith('/uploads/')||value.startsWith(source.origin+'/uploads/'))){
        const url=new URL(value,source.origin);
        if(!known.has(url.pathname))throw new Error('В настройках есть файл, отсутствующий в библиотеке: '+url.pathname);
      }else if(value&&typeof value==='object')for(const item of Object.values(value))inspect(item);
    };
    inspect(current.data);for(const version of history)inspect(version.data);
    const latest=await (await read('/api/content')).json();
    if(!same(current,latest))throw new Error('Во время переноса исходный сайт изменился. Повторите перенос.');
    onProgress({stage:'downloaded',revision:current.revision,history:history.length,files:files.length,bytes:size});
    const snapshot={current:{...current,data:localize(current.data,source.origin)},history:history.map(version=>({...version,data:localize(version.data,source.origin)})),files};
    const result=await target.importState(snapshot);
    if(!same(await target.read(),snapshot.current))throw new Error('Проверка настроек после переноса не пройдена.');
    for(const version of snapshot.history)if(!same(await target.version(version.revision),version))throw new Error('Проверка истории после переноса не пройдена.');
    for(const file of files){
      const saved=await target.file('uploads/'+file.key);
      if(!saved||digest(saved.bytes)!==digest(file.bytes))throw new Error('Проверка файла после переноса не пройдена: '+file.key);
    }
    if(!same(await (await read('/api/content')).json(),current))throw new Error('Исходный сайт изменился после копирования. Не переключайте адрес до синхронизации.');
    return {...result,bytes:size,verified:true};
  }finally{
    if(csrf)await fetcher(source.origin+'/api/logout',{method:'POST',redirect:'manual',headers:{Cookie:cookie,Origin:source.origin},body:new URLSearchParams({csrf})}).catch(()=>{});
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  if(!s3Configured(process.env)||!process.env.SOURCE_ADMIN_PASSWORD)throw new Error('Задайте ключи приватного S3 и SOURCE_ADMIN_PASSWORD через переменные окружения.');
  const target=s3Store();
  try{console.log(JSON.stringify(await migrateToLayero({sourceUrl:process.env.SOURCE_URL||'https://kubokitip.vercel.app',sourcePassword:process.env.SOURCE_ADMIN_PASSWORD,target,onProgress:progress=>console.log(JSON.stringify(progress))})));}
  finally{target.close();}
}
