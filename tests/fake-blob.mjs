import { BlobPreconditionFailedError } from '@vercel/blob';
export function fakeBlob({compressedReads=false}={}) {
  const files=new Map();let revision=0;
  const metadata=(key,v)=>({pathname:key,size:v.bytes.byteLength,etag:v.etag,contentType:v.contentType,url:`https://fixture.private.blob.vercel-storage.com/${key}`});
  return {
    files,
    async get(key,options){
      if(options.useCache!==false)throw new Error('CMS reads must bypass cache');
      const v=files.get(key);
      if(!v)return null;
      const details=metadata(key,v);
      if(compressedReads&&options.headers?.['Accept-Encoding']!=='identity')details.etag='W/'+details.etag;
      return {stream:new Response(v.bytes).body,blob:details,statusCode:200};
    },
    async put(key,content,options){
      const old=files.get(key);
      if(options.ifMatch&&options.ifMatch!==old?.etag)throw new BlobPreconditionFailedError();
      if(old&&!options.allowOverwrite)throw new Error('Blob already exists');
      const bytes=new Uint8Array(await new Response(content).arrayBuffer());
      // Check again after body consumption to simulate atomic writes under concurrent requests.
      const latest=files.get(key);
      if(options.ifMatch&&options.ifMatch!==latest?.etag)throw new BlobPreconditionFailedError();
      if(latest&&!options.allowOverwrite)throw new Error('Blob already exists');
      const value={bytes,contentType:options.contentType,etag:`"${++revision}"`};files.set(key,value);return metadata(key,value);
    },
    async head(key){const v=files.get(key);if(!v)throw new Error('Missing blob');return metadata(key,v);},
    async list({prefix}){return {blobs:[...files].filter(([key])=>key.startsWith(prefix)).map(([key,v])=>metadata(key,v))};},
    async del(key,{ifMatch}={}){if(ifMatch&&files.get(key)?.etag!==ifMatch)throw new BlobPreconditionFailedError();files.delete(key);},
    async copy(key,destination,options){const v=files.get(key);if(!v)throw new Error('Missing blob');if(options.ifMatch!==v.etag)throw new BlobPreconditionFailedError();return this.put(destination,v.bytes,{...options,ifMatch:undefined});},
  };
}
