const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl=(value,base)=>{if(!value)return '';try{const url=new URL(value,base);return ['http:','https:'].includes(url.protocol)?url.href:'';}catch{return '';}};
const fileTypes={mp4:'video/mp4',m4v:'video/mp4',webm:'video/webm',ogv:'video/ogg',ogg:'video/ogg'};
function embedUrl(source){
 const url=new URL(source),host=url.hostname;
 if(host==='youtu.be')return `https://www.youtube.com/embed/${encodeURIComponent(url.pathname.slice(1))}`;
 if(host==='www.youtube.com'||host==='youtube.com')return `https://www.youtube.com/embed/${encodeURIComponent(url.searchParams.get('v')||url.pathname.split('/').pop())}`;
 if(host==='vk.com'||host==='vkvideo.ru'||host==='rutube.ru')return url.href;
 return '';
}
export function resolveVideo(item,base='https://site.test/'){
 const src=safeUrl(item.src,base);if(!src)return {kind:'invalid',src:''};
 let pathname=new URL(src).pathname;try{pathname=decodeURIComponent(pathname);}catch{}
 const extension=pathname.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase(),type=fileTypes[extension];
 // Direct files use the native player even when imported as "video by link".
 if(type)return {kind:'file',src,type};
 const embed=embedUrl(src);if(embed)return {kind:'embed',src:embed};
 const hint=typeof item.mimeType==='string'&&/^video\/[a-z0-9.+-]+(?:\s*;.*)?$/i.test(item.mimeType)?item.mimeType:'';
 if(item.type==='video'||hint)return {kind:'file',src,type:hint};
 return {kind:'link',src};
}
export function renderVideoPlayer(item,base){
 const player=resolveVideo(item,base),title=esc(item.caption||'Видеозапись турнира');
 if(player.kind==='invalid')return '<p class="media-playback-error">Укажите корректную ссылку на видео.</p>';
 const source=esc(player.src);
 if(player.kind==='embed')return `<iframe src="${source}" title="${title}" loading="lazy" allow="fullscreen; picture-in-picture" allowfullscreen sandbox="allow-scripts allow-same-origin allow-presentation"></iframe>`;
 if(player.kind==='file')return `<video data-inline-video controls playsinline preload="metadata" aria-label="${title}"${item.poster?` poster="${esc(safeUrl(item.poster,base))}"`:''}><source src="${source}"${player.type?` type="${esc(player.type)}"`:''}>Ваш браузер не поддерживает проигрыватель. <a href="${source}" target="_blank" rel="noopener">Открыть видео</a></video><p class="media-playback-error" role="status" hidden>Не удалось загрузить видео. <a href="${source}" target="_blank" rel="noopener">Открыть источник</a> или проверить ссылку в редакторе.</p>`;
 return `<a href="${source}" target="_blank" rel="noopener">Открыть видео</a>`;
}
export function bindVideoPlayerErrors(root){
 root.querySelectorAll('video[data-inline-video]').forEach(video=>{
  const showError=()=>{const message=video.parentElement?.querySelector('.media-playback-error');if(message)message.hidden=false;};
  video.addEventListener('error',showError,{once:true});video.querySelector('source')?.addEventListener('error',showError,{once:true});
 });
}
