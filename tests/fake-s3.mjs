import {createHash} from 'node:crypto';

export function fakeS3(){
  const objects=new Map(),calls=[];
  const failure=(name,status)=>Object.assign(new Error(name),{name,$metadata:{httpStatusCode:status}});
  return {objects,calls,async send(command){
    const input=command.input;calls.push({command:command.constructor.name,...input});
    const current=objects.get(input.Key);
    if(command.constructor.name==='GetObjectCommand'){
      if(!current)throw failure('NoSuchKey',404);
      const bytes=Uint8Array.from(current.bytes);
      return {ETag:current.etag,ContentType:current.type,Body:{transformToString:async()=>new TextDecoder().decode(bytes),transformToByteArray:async()=>bytes}};
    }
    if(command.constructor.name==='PutObjectCommand'){
      const bytes=Buffer.from(input.Body);
      if(input.ContentMD5!==createHash('md5').update(bytes).digest('base64'))throw failure('BadDigest',400);
      if(input.IfNoneMatch==='*'&&current||input.IfMatch&&current?.etag!==input.IfMatch)throw failure('PreconditionFailed',412);
      const etag='"'+createHash('md5').update(bytes).digest('hex')+'"';
      objects.set(input.Key,{bytes,type:input.ContentType,etag});return {ETag:etag};
    }
    if(command.constructor.name==='ListObjectsV2Command'){
      const all=[...objects.entries()].filter(([key])=>key.startsWith(input.Prefix)).sort(([a],[b])=>a.localeCompare(b));
      const start=Number(input.ContinuationToken||0),end=start+Math.min(input.MaxKeys||1000,2),page=all.slice(start,end);
      return {Contents:page.map(([Key,value])=>({Key,Size:value.bytes.byteLength})),IsTruncated:end<all.length,NextContinuationToken:end<all.length?String(end):undefined};
    }
    if(command.constructor.name==='DeleteObjectCommand'){objects.delete(input.Key);return {};}
    throw new Error('Unhandled command '+command.constructor.name);
  }};
}
