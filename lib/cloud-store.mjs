import { CmsError, validateDocument } from './cms.mjs';
import seed from '../public/data/seasons.json';
export function cloudStore(env){
 const ready=async()=>{if(!env.DB||!env.BUCKET)throw new Error('Storage bindings unavailable');await env.DB.prepare('INSERT OR IGNORE INTO cms_state (id,revision,data,updated_at) VALUES (1,0,?,?)').bind(JSON.stringify(validateDocument(seed)),new Date().toISOString()).run();};
 const read=async()=>{await ready();const row=await env.DB.prepare('SELECT revision,data,updated_at FROM cms_state WHERE id=1').first();return {data:validateDocument(JSON.parse(row.data)),revision:row.revision,updatedAt:row.updated_at};};
 return {read,
 async save(data,revision){await ready();if(!Number.isInteger(revision))throw new CmsError('Обновите панель.',409);const time=new Date().toISOString();const result=await env.DB.batch([
 env.DB.prepare('INSERT OR IGNORE INTO cms_history (revision,data,updated_at) SELECT revision,data,updated_at FROM cms_state WHERE id=1 AND revision=?').bind(revision),
 env.DB.prepare('UPDATE cms_state SET data=?,revision=revision+1,updated_at=? WHERE id=1 AND revision=?').bind(JSON.stringify(data),time,revision),
 env.DB.prepare('DELETE FROM cms_history WHERE revision NOT IN (SELECT revision FROM cms_history ORDER BY revision DESC LIMIT 20)')]);if(!result[1].meta.changes)throw new CmsError('Сайт уже изменён в другой вкладке. Экспортируйте черновик, затем загрузите свежие данные.',409);return read();},
 async history(){await ready();const rows=await env.DB.prepare('SELECT revision,updated_at FROM cms_history ORDER BY revision DESC LIMIT 20').all();return rows.results.map(r=>({revision:r.revision,updatedAt:r.updated_at}));},
 async version(revision){await ready();const row=await env.DB.prepare('SELECT data FROM cms_history WHERE revision=?').bind(revision).first();return row?{data:validateDocument(JSON.parse(row.data))}:null;},
 async upload(info){await env.BUCKET.put(`uploads/${info.key}`,info.bytes,{httpMetadata:{contentType:info.type},customMetadata:{name:info.name}});},
 async files(){const result=await env.BUCKET.list({prefix:'uploads/',limit:1000});return result.objects.map(o=>({url:`/${o.key}`,name:o.key.split('/').pop(),size:o.size}));},
 async file(key){return env.BUCKET.get(`uploads/${key}`);}
 };
}
