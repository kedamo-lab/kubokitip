import {S3Client,GetObjectCommand,PutObjectCommand,ListObjectsV2Command,DeleteObjectCommand} from '@aws-sdk/client-s3';
import {createHash} from 'node:crypto';
import {CmsError,fileTypes,uploadInfo,validateDocument} from './cms.mjs';
import seed from '../public/data/seasons.json' with {type:'json'};

const stateKey='cms/state.json';
const filePattern=/^uploads\/[\da-f-]{36}\.(png|jpe?g|webp|avif|gif|svg|pdf|mp4|webm|woff2?)$/i;
const historyPattern=/^cms\/history\/\d+-[\da-f]{64}\.json$/;
const conflict=()=>new CmsError('Сайт уже изменён в другой вкладке. Загрузите свежие данные.',409);
const missing=error=>error.name==='NoSuchKey'||error.$metadata?.httpStatusCode===404;
const precondition=error=>['PreconditionFailed','ConditionalRequestConflict'].includes(error.name)||[409,412].includes(error.$metadata?.httpStatusCode);
const hash=value=>createHash('sha256').update(value).digest('hex');
const initial=()=>({data:validateDocument(seed),revision:0,updatedAt:null,history:[]});
const publicState=({data,revision,updatedAt})=>({data,revision,updatedAt});
export const s3Configured=env=>Boolean(env.S3_BUCKET&&env.S3_ACCESS_KEY_ID&&env.S3_SECRET_ACCESS_KEY);

export function s3Store({env=process.env,client:providedClient}={}){
  let client=providedClient;
  const connect=()=>{
    if(!s3Configured(env))throw new CmsError('Подключите приватный бакет Object Storage и ключ доступа в настройках Layero.',503);
    return client??=new S3Client({
      endpoint:env.S3_ENDPOINT||'https://storage.yandexcloud.net',
      region:env.S3_REGION||'ru-central1',forcePathStyle:true,
      credentials:{accessKeyId:env.S3_ACCESS_KEY_ID,secretAccessKey:env.S3_SECRET_ACCESS_KEY},
      requestChecksumCalculation:'WHEN_REQUIRED',responseChecksumValidation:'WHEN_REQUIRED',
      maxAttempts:2
    });
  };
  const send=command=>connect().send(command);
  const get=async key=>{
    try{return await send(new GetObjectCommand({Bucket:env.S3_BUCKET,Key:key}));}
    catch(error){if(missing(error))return null;throw error;}
  };
  const readState=async()=>{
    const result=await get(stateKey);
    if(!result)return {value:initial(),etag:null};
    if(!result.ETag||result.ETag.startsWith('W/'))throw new Error('Storage did not return a strong ETag');
    const value=JSON.parse(await result.Body.transformToString());
    value.data=validateDocument(value.data);
    return {value,etag:result.ETag};
  };
  const put=async(key,body,properties={})=>send(new PutObjectCommand({
    Bucket:env.S3_BUCKET,Key:key,Body:body,
    ContentType:'application/json',ContentMD5:createHash('md5').update(body).digest('base64'),
    ...properties
  }));
  const backup=async value=>{
    const body=JSON.stringify(publicState(value));
    const key='cms/history/'+value.revision+'-'+hash(body)+'.json';
    // Immutable names let two competing saves share the same previous snapshot.
    try{await put(key,body,{IfNoneMatch:'*'});}catch(error){
      if(!precondition(error))throw error;
      const existing=await get(key);
      if(!existing||hash(await existing.Body.transformToString())!==hash(body))throw error;
    }
    return {key,revision:value.revision,updatedAt:value.updatedAt};
  };
  const list=async prefix=>{
    const files=[];let next;
    do{
      const page=await send(new ListObjectsV2Command({Bucket:env.S3_BUCKET,Prefix:prefix,MaxKeys:1000,ContinuationToken:next}));
      files.push(...(page.Contents||[]));next=page.IsTruncated?page.NextContinuationToken:undefined;
      if(page.IsTruncated&&!next)throw new Error('Incomplete object listing');
    }while(next);
    return files;
  };
  const checkedFile=async file=>{
    const pathname='uploads/'+file.key;
    if(!filePattern.test(pathname))throw new CmsError('Некорректное имя файла.');
    const ext=file.key.split('.').pop().toLowerCase();
    const info=await uploadInfo(new File([file.bytes],file.name||file.key,{type:fileTypes[ext]}));
    if(info.key.split('.').pop()!==ext)throw new CmsError('Расширение файла не совпадает.');
    return {...info,key:file.key};
  };
  const writeFile=info=>put('uploads/'+info.key,info.bytes,{ContentType:info.type,IfNoneMatch:'*'});
  const checkCapacity=async extra=>{
    const used=(await list('')).reduce((sum,file)=>sum+(file.Size||0),0);
    const limit=Number(env.S3_STORAGE_LIMIT_BYTES||900_000_000);
    if(!Number.isFinite(limit)||limit<=0||used+extra>limit)throw new CmsError('Достигнут лимит хранилища. Освободите место перед загрузкой.',413);
  };
  return {
    async read(){if(!s3Configured(env))return publicState(initial());return publicState((await readState()).value);},
    async save(data,revision){
      const current=await readState();
      if(!Number.isInteger(revision)||revision!==current.value.revision)throw conflict();
      const nextData=validateDocument(data);
      await checkCapacity(Buffer.byteLength(JSON.stringify(nextData))+Buffer.byteLength(JSON.stringify(publicState(current.value))));
      const previous=await backup(current.value);
      const next={data:nextData,revision:revision+1,updatedAt:new Date().toISOString(),history:[previous,...(current.value.history||[])].slice(0,20)};
      try{await put(stateKey,JSON.stringify(next),current.etag?{IfMatch:current.etag}:{IfNoneMatch:'*'});}
      catch(error){if(precondition(error)||missing(error))throw conflict();throw error;}
      const keep=new Set(next.history.map(item=>item.key));
      for(const item of current.value.history||[])if(!keep.has(item.key)&&historyPattern.test(item.key)){
        await send(new DeleteObjectCommand({Bucket:env.S3_BUCKET,Key:item.key})).catch(()=>{});
      }
      return publicState(next);
    },
    async history(){return ((await readState()).value.history||[]).map(({revision,updatedAt})=>({revision,updatedAt}));},
    async version(revision){
      const item=((await readState()).value.history||[]).find(item=>item.revision===revision);
      if(!item||!historyPattern.test(item.key))return null;
      const result=await get(item.key);if(!result)return null;
      const value=JSON.parse(await result.Body.transformToString());
      value.data=validateDocument(value.data);return publicState(value);
    },
    async upload(file){
      const info=await checkedFile(file);await checkCapacity(info.size);await writeFile(info);
    },
    async files(){return (await list('uploads/')).filter(item=>filePattern.test(item.Key)).map(item=>({name:item.Key.split('/').pop(),url:'/'+item.Key,size:item.Size}));},
    async file(key){
      if(!filePattern.test(key))return null;
      const result=await get(key);if(!result)return null;
      return {bytes:await result.Body.transformToByteArray(),type:fileTypes[key.split('.').pop().toLowerCase()],etag:result.ETag};
    },
    async importState({current,history=[],files=[]}){
      if((await readState()).etag)throw new CmsError('Хранилище уже содержит сайт. Импорт не перезаписывает рабочие данные.',409);
      if(!Number.isInteger(current.revision)||current.revision<0)throw new CmsError('Некорректная версия сайта.');
      const clean={...publicState(current),data:validateDocument(current.data)};
      const seen=new Set(),versions=[];
      for(const version of history){
        if(!Number.isInteger(version.revision)||version.revision<0||version.revision>=current.revision||seen.has(version.revision))throw new CmsError('Некорректная история сайта.');
        seen.add(version.revision);
        versions.push({...publicState(version),data:validateDocument(version.data)});
      }
      const uploads=[];for(const file of files)uploads.push(await checkedFile(file));
      if(new Set(uploads.map(file=>file.key)).size!==uploads.length)throw new CmsError('Повторяющиеся файлы.');
      versions.sort((a,b)=>b.revision-a.revision);
      await checkCapacity(uploads.reduce((sum,file)=>sum+file.size,0)+Buffer.byteLength(JSON.stringify(clean))+versions.reduce((sum,version)=>sum+Buffer.byteLength(JSON.stringify(version)),0));
      // Publish the pointer last; an incomplete migration never replaces a live site.
      for(const info of uploads){
        try{await writeFile(info);}catch(error){
          if(!precondition(error))throw error;
          const existing=await this.file('uploads/'+info.key);
          if(!existing||hash(existing.bytes)!==hash(info.bytes))throw new CmsError('Файл в целевом хранилище отличается: '+info.key,409);
        }
      }
      clean.history=[];for(const version of versions.slice(0,20))clean.history.push(await backup(version));
      try{await put(stateKey,JSON.stringify(clean),{IfNoneMatch:'*'});}
      catch(error){if(precondition(error))throw conflict();throw error;}
      return {revision:clean.revision,history:clean.history.length,files:uploads.length};
    },
    close(){if(!providedClient)client?.destroy();}
  };
}
