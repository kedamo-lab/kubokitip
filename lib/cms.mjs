import { normalize } from '../public/editor-schema.js';
export class CmsError extends Error {constructor(message,status=400){super(message);this.status=status;}}
const check=(condition,message)=>{if(!condition)throw new CmsError(message);};
const safeLink=(value)=>{if(!value)return true;try{return ['http:','https:'].includes(new URL(value,'https://site.test').protocol);}catch{return false;}};
export function validateDocument(input){
 check(input&&typeof input==='object'&&!Array.isArray(input),'Нужен объект настроек сайта.');
 check(JSON.stringify(input).length<=2_000_000,'Настройки слишком большие. Файлы загружайте отдельно.');
 const walk=(value,depth=0)=>{check(depth<24,'Слишком большая вложенность данных.');if(value&&typeof value==='object')for(const [key,item] of Object.entries(value)){check(!['__proto__','constructor','prototype'].includes(key),'Недопустимое поле.');walk(item,depth+1);}else if(typeof value==='string')check(value.length<100_000,'Один из текстов слишком длинный.');};walk(input);
 check(Array.isArray(input.seasons)&&input.seasons.length>0&&input.seasons.length<=100,'В сайте должен быть хотя бы один сезон.');
 const years=new Set();
 for(const season of input.seasons){
  check(/^\d{4}$/.test(season.year)&&!years.has(season.year),'Годы сезонов должны быть уникальными, например 2027.');years.add(season.year);
  check(Array.isArray(season.disciplines)&&season.disciplines.length>0&&season.disciplines.length<=12,'В сезоне нужна хотя бы одна дисциплина.');
  check(!season.date||/^\d{4}-\d{2}-\d{2}$/.test(season.date)&&!Number.isNaN(Date.parse(season.date)),'Проверьте дату сезона.');
  check(safeLink(season.regulationsUrl),'Некорректная ссылка регламента.');
  const games=new Set();for(const game of season.disciplines){
   check(/^[\w-]+$/.test(game.id)&&!games.has(game.id),'Идентификаторы дисциплин должны быть уникальными.');games.add(game.id);
   check(typeof game.name==='string'&&game.name.trim(),'Укажите название дисциплины.');
   for(const key of ['teams','matches','bracket'])check(Array.isArray(game[key]),`Не найден список ${key}.`);
   const teams=new Set();for(const team of game.teams){check(typeof team.id==='string'&&team.id&&!teams.has(team.id),'Идентификаторы команд должны быть уникальными.');teams.add(team.id);check(typeof team.name==='string'&&team.name.trim(),'Укажите название команды.');check(Array.isArray(team.players)&&team.players.every(p=>typeof p==='string'),'Состав команды должен быть списком имён.');check(safeLink(team.image),'Некорректная ссылка фото команды.');}
   const matches=new Set();for(const match of game.matches){check(match.id&&!matches.has(match.id),'Идентификаторы матчей должны быть уникальными.');matches.add(match.id);check(['scheduled','live','finished'].includes(match.status),'Неизвестный статус матча.');}
   const validateMatch=(match)=>{for(const key of ['team1Id','team2Id','winnerId','advancedTeamId'])check(!match[key]||teams.has(match[key]),'Матч ссылается на удалённую команду.');for(const key of ['score1','score2'])check(match[key]==null||Number.isInteger(match[key])&&match[key]>=0&&match[key]<=999,'Счёт должен быть целым числом от 0 до 999.');if(match.team1Id&&match.team2Id)check(match.team1Id!==match.team2Id,'Команда не может играть сама с собой.');for(const key of ['winnerId','advancedTeamId'])check(!match[key]||[match.team1Id,match.team2Id].includes(match[key]),'Победитель должен участвовать в матче.');};
   game.matches.forEach(validateMatch);for(const round of game.bracket){check(Array.isArray(round.matches),'Раунд должен содержать список матчей.');for(const match of round.matches){if(match.matchId)check(matches.has(match.matchId),'В сетке выбран удалённый матч.');else validateMatch(match);}}
   check(!game.winner||teams.has(game.winner.teamId),'Победитель ссылается на удалённую команду.');check(!game.winner||safeLink(game.winner.photo),'Некорректная ссылка фото победителя.');
  }
  for(const key of ['media','organizers','partners'])check(Array.isArray(season[key]),`Не найден список ${key}.`);
  for(const item of season.media)check(['photo','video','embed'].includes(item.type)&&safeLink(item.src)&&safeLink(item.poster),'Проверьте тип и ссылки медиаматериала.');
 }
 check(years.has(input.currentSeason),'Выберите существующий текущий сезон.');
 const data=normalize(input);for(const value of Object.values(data.site.colors))check(/^#[\da-f]{6}$/i.test(value),'Цвет задаётся в формате #RRGGBB.');
 const strings=(object,keys)=>{check(object&&typeof object==='object','Неверная структура настроек.');for(const key of keys)check(typeof object[key]==='string',`Поле ${key} должно быть текстом.`);};
 strings(data.site,['name','description','titleTemplate']);strings(data.site.fonts,['body','heading','bodyFile','headingFile']);strings(data.site.header,['seasonLabel','currentLabel','archiveLabel']);strings(data.site.footer,['department','motto']);
 for(const key of ['links']){check(Array.isArray(data.site.header[key]),'Меню должно быть списком.');check(Array.isArray(data.site.footer[key]),'Ссылки подвала должны быть списком.');}
 for(const item of data.site.header.links){strings(item,['label','target']);check(['hero','about','teams','bracket','schedule','results','media','winners','organizers','closing'].includes(item.target),'Пункт меню ссылается на неизвестный раздел.');}
 for(const item of data.site.footer.links){strings(item,['label','url']);check(safeLink(item.url),'Неверная ссылка подвала.');}
 check(Array.isArray(data.site.ticker.items)&&data.site.ticker.items.every(i=>typeof i==='string'),'Бегущая строка должна содержать список надписей.');
 const limits={containerWidth:[800,1800],headerWidth:[720,1800],headerRadius:[0,50],sectionSpacing:[0,200],heroLogoWidth:[120,800]};
 for(const [key,[min,max]]of Object.entries(limits)){const value=data.site.layout[key];check(Number.isFinite(value)&&value>=min&&value<=max,`${key}: допустимый диапазон ${min}–${max}.`);}
 for(const key of ['speed','tickerSeconds','floatSeconds'])check(Number.isFinite(data.site.motion[key])&&data.site.motion[key]>0,`Проверьте настройку анимации ${key}.`);
 for(const season of data.seasons){
  strings(season,['year','date','dateLabel','venue','status','bracketAnnouncement']);
  const ids=['hero','about','teams','bracket','schedule','results','media','winners','organizers','closing'];check(Array.isArray(season.order)&&season.order.length===ids.length&&new Set(season.order).size===ids.length&&season.order.every(id=>ids.includes(id)),'В порядке разделов каждый блок должен встречаться ровно один раз.');
  for(const [id,content] of Object.entries(season.content)){check(content&&typeof content==='object',`Проверьте раздел ${id}.`);for(const [key,value] of Object.entries(content))if(!['visible','showBeforeFinal','placeholders','columns'].includes(key))check(typeof value==='string',`Текст ${id}.${key} должен быть строкой.`);}
  check(Array.isArray(season.content.schedule.columns)&&season.content.schedule.columns.length===5&&season.content.schedule.columns.every(i=>typeof i==='string'),'У расписания должно быть пять названий колонок.');
  check(Array.isArray(season.content.media.placeholders),'Пустые карточки медиа должны быть списком.');for(const item of season.content.media.placeholders)strings(item,['title','caption','icon']);
  for(const item of season.organizers){strings(item,['role']);check(item.name==null||typeof item.name==='string','Имя организатора должно быть текстом.');check(safeLink(item.photo)&&safeLink(item.url),'Проверьте ссылки организатора.');}
  for(const item of season.partners){strings(item,['name']);check(safeLink(item.logo)&&safeLink(item.url),'Проверьте ссылки партнёра.');}
  for(const item of season.media){strings(item,['caption']);check(!item.alt||typeof item.alt==='string','Описание изображения должно быть текстом.');}
  for(const game of season.disciplines){strings(game,['caption']);for(const round of game.bracket)strings(round,['name']);for(const match of game.matches){strings(match,['stage']);check(!match.date||/^\d{4}-\d{2}-\d{2}$/.test(match.date)&&!Number.isNaN(Date.parse(match.date)),'Проверьте дату матча.');check(!match.time||/^\d{2}:\d{2}$/.test(match.time),'Проверьте время матча.');}if(game.winner?.players)check(Array.isArray(game.winner.players)&&game.winner.players.every(p=>typeof p==='string'),'Состав победителя должен быть списком имён.');}
 }
 for(const value of Object.values(data.site.logos))check(safeLink(value),'Некорректная ссылка логотипа.');
 check(typeof data.site.customCSS==='string'&&data.site.customCSS.length<=40_000,'CSS должен быть текстом до 40 000 символов.');
 return data;
}
export const fileTypes={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',avif:'image/avif',gif:'image/gif',svg:'image/svg+xml',pdf:'application/pdf',mp4:'video/mp4',webm:'video/webm',woff:'font/woff',woff2:'font/woff2'};
export async function uploadInfo(file){
 check(file&&typeof file.arrayBuffer==='function','Выберите файл.');check(file.size>0&&file.size<=25*1024*1024,'Размер файла должен быть от 1 байта до 25 МБ.');
 const ext=file.name.split('.').pop().toLowerCase();check(fileTypes[ext],'Поддерживаются изображения, PDF, MP4/WebM и WOFF/WOFF2.');
 const bytes=new Uint8Array(await file.arrayBuffer());
 if(ext==='svg'){const text=new TextDecoder().decode(bytes);check(/<svg[\s>]/i.test(text)&&!/<(?:script|foreignObject|iframe|object|embed)\b|\bon\w+\s*=|(?:href|src)\s*=\s*["']\s*(?:javascript:|https?:|\/\/)|<!ENTITY/i.test(text),'SVG должен быть статическим и не содержать скриптов или внешних ресурсов.');}
 return {bytes,key:`${crypto.randomUUID()}.${ext}`,type:fileTypes[ext],name:file.name.slice(0,200),size:file.size};
}
const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export async function handleCms(request,store,context={authorized:false,csrf:''}){
 try{
  const route=new URL(request.url).pathname;
  if(route==='/api/session')return json({authorized:context.authorized,csrf:context.csrf||'',mode:context.mode||'hosted'});
  if(route==='/api/content'&&request.method==='GET')return json(await store.read());
  if(!context.authorized)throw new CmsError('Редактирование доступно владельцу сайта.',403);
  const size=Number(request.headers.get('Content-Length')||0);if(size>(route==='/api/upload'?26*1024*1024:2_000_000))throw new CmsError('Размер запроса превышает допустимый.',413);
  if(!['GET','HEAD'].includes(request.method)){
   const origin=request.headers.get('Origin');check(!origin||origin===new URL(request.url).origin,'Запрос с другого сайта отклонён.');
   if(context.csrf)check(request.headers.get('X-Cup-CSRF')===context.csrf,'Обновите панель и повторите сохранение.');
  }
  if(route==='/api/content'&&request.method==='PUT'){
   const body=await request.json();return json(await store.save(validateDocument(body.data),body.revision));
  }
  if(route==='/api/history'&&request.method==='GET')return json(await store.history());
  if(route==='/api/version'&&request.method==='GET'){const version=await store.version(Number(new URL(request.url).searchParams.get('revision')));check(version,'Резервная копия не найдена.');return json(version);}
  if(route==='/api/restore'&&request.method==='POST'){
   const body=await request.json();const backup=await store.version(body.version);check(backup,'Резервная копия не найдена.');return json(await store.save(validateDocument(backup.data),body.revision));
  }
  if(route==='/api/assets'&&request.method==='GET')return json(await store.files());
  if(route==='/api/upload'&&request.method==='POST'){
   const form=await request.formData();const info=await uploadInfo(form.get('file'));await store.upload(info);return json({url:`/uploads/${info.key}`,name:info.name,size:info.size,type:info.type},201);
  }
  throw new CmsError('Неизвестный запрос.',404);
 }catch(error){return json({error:error instanceof CmsError?error.message:'Не удалось выполнить действие. Попробуйте ещё раз.'},error instanceof CmsError?error.status:500);}
}
