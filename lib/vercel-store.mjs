import * as sdk from '@vercel/blob';
import { CmsError, fileTypes, uploadInfo, validateDocument } from './cms.mjs';
import seed from '../public/data/seasons.json' with {type:'json'};

const statePath='cms/state.json';
const conflict=()=>new CmsError('Сайт уже изменён в другой вкладке. Загрузите свежие данные.',409);
const options={access:'private',addRandomSuffix:false,cacheControlMaxAge:60};
export const stagingPattern=/^staging\/[\da-f-]{36}\.(png|jpe?g|webp|avif|gif|svg|pdf|mp4|webm|woff2?)$/i;
export const uploadPattern=/^uploads\/[\da-f-]{36}\.(png|jpe?g|webp|avif|gif|svg|pdf|mp4|webm|woff2?)$/i;
export function vercelStore({blob=sdk,env=process.env}={}) {
  const token=()=>{if(!env.BLOB_READ_WRITE_TOKEN)throw new CmsError('Подключите приватный Vercel Blob к проекту и выполните Redeploy.',503);return env.BLOB_READ_WRITE_TOKEN;};
  const get=key=>blob.get(key,{access:'private',token:token(),useCache:false});
  const initial=()=>({data:validateDocument(seed),revision:0,updatedAt:null,history:[]});
  const state=async()=>{
    const result=await get(statePath);
    if(!result)return {value:initial(),etag:null};
    const value=await new Response(result.stream).json();
    value.data=validateDocument(value.data);
    return {value,etag:result.blob.etag};
  };
  const publicState=({data,revision,updatedAt})=>({data,revision,updatedAt});
  return {
    async read(){if(!env.BLOB_READ_WRITE_TOKEN)return publicState(initial());return publicState((await state()).value);},
    async save(data,revision){
      const current=await state();
      if(!Number.isInteger(revision)||current.value.revision!==revision)throw conflict();
      await blob.put(`cms/history/${revision}.json`,JSON.stringify(publicState(current.value)),{...options,token:token(),contentType:'application/json',allowOverwrite:true});
      const next={data:validateDocument(data),revision:revision+1,updatedAt:new Date().toISOString(),history:[{revision,updatedAt:current.value.updatedAt},...(current.value.history||[])].slice(0,20)};
      try {
        await blob.put(statePath,JSON.stringify(next),{...options,token:token(),contentType:'application/json',allowOverwrite:Boolean(current.etag),...(current.etag?{ifMatch:current.etag}:{})});
      } catch(error) {
        if(error instanceof sdk.BlobPreconditionFailedError)throw conflict();
        const latest=await state();
        if(latest.value.revision!==revision || latest.etag!==current.etag)throw conflict();
        throw error;
      }
      // Keep twenty backups; this cleanup never affects the committed state.
      if(revision>=20)await blob.del(`cms/history/${revision-20}.json`,{token:token()}).catch(()=>{});
      return publicState(next);
    },
    async history(){return (await state()).value.history||[];},
    async version(revision){
      if(!(await this.history()).some(v=>v.revision===revision))return null;
      const result=await get(`cms/history/${revision}.json`);
      if(!result)return null;
      const version=await new Response(result.stream).json();version.data=validateDocument(version.data);return version;
    },
    async upload(info){await blob.put(`uploads/${info.key}`,info.bytes,{...options,token:token(),contentType:info.type});},
    async files(){const result=await blob.list({prefix:'uploads/',limit:1000,token:token()});return result.blobs.map(v=>({name:v.pathname.split('/').pop(),url:'/'+v.pathname,size:v.size}));},
    async file(key){if(!uploadPattern.test(key))return null;return get(key);},
    async finalize(pathname,name){
      if(!stagingPattern.test(pathname)||typeof name!=='string'||!name||name.length>200)throw new CmsError('Некорректный файл.');
      const ext=pathname.split('.').pop().toLowerCase();
      if(name.split('.').pop().toLowerCase()!==ext)throw new CmsError('Расширение файла не совпадает.');
      const metadata=await blob.head(pathname,{token:token()});
      if(!metadata.size||metadata.size>25*1024*1024)throw new CmsError('Размер файла должен быть от 1 байта до 25 МБ.');
      const key=pathname.replace(/^staging\//,'uploads/');
      if(ext==='svg'){
        const result=await get(pathname);
        const bytes=await new Response(result.stream).arrayBuffer();
        await uploadInfo(new File([bytes],name,{type:fileTypes[ext]}));
      }
      await blob.copy(pathname,key,{...options,token:token(),contentType:fileTypes[ext],ifMatch:metadata.etag});
      await blob.del(pathname,{token:token(),ifMatch:metadata.etag}).catch(()=>{});
      return {url:'/'+key,name,size:metadata.size,type:fileTypes[ext]};
    },
  };
}
