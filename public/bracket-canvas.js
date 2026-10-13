import {GRID,SIDES,SIDE_NAMES,emptyLayout,snap,clamp,freePosition,overlaps,removeNode,sameConnection,portPoint,pathFromPoints,connectionPath,validateLayout,eightTeamLayout} from './bracket-model.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>globalThis.crypto?.randomUUID?.()||'node-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
const clone=value=>structuredClone(value);
const safeUrl=value=>{try{const u=new URL(value,location.href);return value&&['http:','https:'].includes(u.protocol)?u.href:'';}catch{return '';}};
const nodeMarkup=(node,editable)=>`<div class="bracket-node bracket-style-${node.style} bracket-kind-${node.kind}" data-node="${esc(node.id)}" style="left:${node.x}px;top:${node.y}px;width:${node.width}px;height:${node.height}px" ${editable?'tabindex="0" role="group"':''} aria-label="${esc(node.text||'Прямоугольник')}"><div class="bracket-face">${node.kind==='winner'?'<span class="bracket-crown" aria-hidden="true">♛</span>':''}<span class="bracket-node-text">${esc(node.text)}</span></div>${editable?`<button type="button" class="bracket-node-delete" data-bc="delete-node" data-id="${esc(node.id)}" aria-label="Удалить этот прямоугольник">×</button>${SIDES.map(side=>`<button type="button" class="bracket-port bracket-port-${side}" data-port="${side}" data-node-id="${esc(node.id)}" aria-label="Соединить: ${SIDE_NAMES[side].toLowerCase()}, ${esc(node.text||'прямоугольник')}" title="Соединить ${SIDE_NAMES[side].toLowerCase()}"></button>`).join('')}`:''}</div>`;
const linesMarkup=(layout,editable,selected)=>layout.edges.map(edge=>{const d=connectionPath(layout,edge);return `<g data-edge="${esc(edge.id)}" class="bracket-edge ${selected===edge.id?'is-selected':''}">${editable?`<path class="bracket-edge-hit" d="${d}"/>`:''}<path class="bracket-edge-line" d="${d}"/></g>`;}).join('');
function applyBackground(stage,value){const url=safeUrl(value);stage.style.backgroundImage=url?`linear-gradient(#080a0b55,#080a0b55),url(${JSON.stringify(url)})`:'';}
function zoomControls(){return '<div class="bracket-zoom"><button type="button" data-bc="zoom-out" aria-label="Уменьшить сетку">−</button><output data-zoom-label>100%</output><button type="button" data-bc="zoom-in" aria-label="Увеличить сетку">+</button><button type="button" data-bc="fit">Уместить</button></div>';}
export function renderBracketView(root,layout,label){
  root.innerHTML=`<div class="bracket-viewer"><div class="bracket-view-toolbar"><span>${esc(label)}</span>${zoomControls()}</div><div class="bracket-viewport" tabindex="0" role="region" aria-label="Турнирная сетка ${esc(label)}. Можно прокручивать и менять масштаб."><div class="bracket-space"><div class="bracket-stage"><svg class="bracket-lines" viewBox="0 0 ${layout.width} ${layout.height}" aria-hidden="true">${linesMarkup(layout,false)}</svg>${layout.nodes.map(n=>nodeMarkup(n,false)).join('')}</div></div></div><p class="bracket-help">Перемещайтесь по схеме прокруткой. Кнопка «Уместить» покажет сетку целиком.</p></div>`;
  const viewport=root.querySelector('.bracket-viewport'),stage=root.querySelector('.bracket-stage'),space=root.querySelector('.bracket-space');let scale=1,automatic=true;
  applyBackground(stage,layout.background);stage.style.width=layout.width+'px';stage.style.height=layout.height+'px';
  const zoom=value=>{scale=clamp(value,.15,1.5);stage.style.transform=`scale(${scale})`;space.style.width=layout.width*scale+'px';space.style.height=layout.height*scale+'px';root.querySelector('[data-zoom-label]').textContent=Math.round(scale*100)+'%';};
  const fit=()=>zoom(Math.min(1,(Math.max(viewport.clientWidth-24,viewport.clientWidth<600?880:0))/layout.width));
  const abort=new AbortController();root.addEventListener('click',e=>{const action=e.target.closest('[data-bc]')?.dataset.bc;if(!action)return;automatic=false;if(action==='fit'){zoom(Math.min(1,(viewport.clientWidth-24)/layout.width));viewport.scrollTo(0,0);}else zoom(scale+(action==='zoom-in'?0.1:-0.1));},{signal:abort.signal});
  const observer=new ResizeObserver(()=>{if(automatic)fit();});observer.observe(viewport);fit();
  return ()=>{abort.abort();observer.disconnect();};
}
export function mountBracketEditor(root,{value,teams=[],onChange,onNotice=()=>{},canEdit=()=>true,motionEnabled=()=>true,onUndo=()=>{},onRedo=()=>{}}){
  let layout=clone(value||emptyLayout()),selected=null,selectedEdge=null,pending=null,drag=null,linkDrag=null,zoom=1,autoFit=true,textTransaction=false,suppressClick=false;
  const abort=new AbortController(),listen=(target,event,fn)=>target.addEventListener(event,fn,{signal:abort.signal});
  root.classList.add('bracket-builder');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const updateMotion=()=>{let preference='auto';try{preference=localStorage.getItem('cup-motion')||'auto';}catch{}root.classList.toggle('bracket-motion-on',motionEnabled()&&document.visibilityState!=='hidden'&&(preference==='on'||preference!=='off'&&!reduced.matches));};
  listen(reduced,'change',updateMotion);listen(window,'storage',e=>{if(e.key==='cup-motion')updateMotion();});listen(document,'visibilitychange',updateMotion);updateMotion();
  root.innerHTML=`<div class="bracket-builder-toolbar"><div class="bracket-palette" aria-label="Прямоугольники для сетки">${[['team','+ Команда'],['note','+ Подпись'],['winner','♛ Победитель']].map(([kind,title])=>`<button type="button" class="secondary-button" draggable="true" data-template="${kind}">${title}</button>`).join('')}<button type="button" class="secondary-button" data-bc="template">Шаблон на 8 команд</button></div>${zoomControls()}</div><p class="bracket-help">Перетащите прямоугольник на поле или добавьте нажатием. Двойное нажатие — изменить текст. Соединяйте точки на любых сторонах.</p><div class="bracket-workbench"><div class="bracket-viewport" tabindex="0" role="region" aria-label="Поле конструктора турнирной сетки"><div class="bracket-space"><div class="bracket-stage"><svg class="bracket-lines" aria-hidden="true"></svg><div class="bracket-nodes"></div><div class="bracket-empty"><span>+</span><strong>Здесь начинается путь к кубку</strong><p>Добавьте первый прямоугольник<br>и соедините его со следующим.</p></div></div></div></div><aside class="bracket-inspector" aria-label="Настройки выбранного элемента"></aside></div><div class="bracket-builder-bottom"><span class="bracket-message" role="status" aria-live="polite">Все прямоугольники привязаны к сетке.</span><button type="button" class="danger-button" data-bc="clear">Очистить сетку</button></div>`;
  const viewport=root.querySelector('.bracket-viewport'),stage=root.querySelector('.bracket-stage'),space=root.querySelector('.bracket-space'),nodes=root.querySelector('.bracket-nodes'),svg=root.querySelector('svg'),inspector=root.querySelector('.bracket-inspector'),message=root.querySelector('.bracket-message');
  const notice=(text,error=false)=>{message.textContent=text;if(error)onNotice(text,true);};
  const point=e=>{const r=stage.getBoundingClientRect();return {x:(e.clientX-r.left)/zoom,y:(e.clientY-r.top)/zoom};};
  const nodeById=id=>layout.nodes.find(n=>n.id===id);
  function setZoom(next){zoom=clamp(next,.15,1.5);stage.style.transform=`scale(${zoom})`;space.style.width=layout.width*zoom+'px';space.style.height=layout.height*zoom+'px';root.querySelector('[data-zoom-label]').textContent=Math.round(zoom*100)+'%';}
  function fit(){setZoom(Math.min(1,(viewport.clientWidth-32)/layout.width));}
  function paintLines(){
    svg.setAttribute('viewBox',`0 0 ${layout.width} ${layout.height}`);svg.innerHTML=linesMarkup(layout,true,selectedEdge);
    const source=linkDrag?.source||pending,from=source&&nodeById(source.nodeId);
    if(from&&linkDrag){const a=portPoint(from,source.side),b=linkDrag.point;svg.insertAdjacentHTML('beforeend',`<path class="bracket-edge-ghost" d="${pathFromPoints([a,{x:(a.x+b.x)/2,y:a.y},{x:(a.x+b.x)/2,y:b.y},b])}"/>`);}
  }
  function paintSelection(){
    for(const node of nodes.children){node.classList.toggle('is-selected',node.dataset.node===selected);node.querySelectorAll('[data-port]').forEach(port=>port.classList.toggle('is-connecting',port.dataset.nodeId===pending?.nodeId&&port.dataset.port===pending?.side));}
    paintLines();
  }
  function draw(){
    stage.style.width=layout.width+'px';stage.style.height=layout.height+'px';applyBackground(stage,layout.background);
    nodes.innerHTML=layout.nodes.map(node=>nodeMarkup(node,true)).join('');root.querySelector('.bracket-empty').hidden=!!layout.nodes.length;
    if(autoFit)fit();else setZoom(zoom);paintSelection();drawInspector();
  }
  function drawInspector(){
    const n=nodeById(selected),edge=layout.edges.find(e=>e.id===selectedEdge);
    if(n){inspector.innerHTML=`<p class="bracket-inspector-label">ПРЯМОУГОЛЬНИК</p><label class="field"><span>Текст внутри</span><textarea data-node-prop="text" maxlength="500" rows="4">${esc(n.text)}</textarea></label><label class="field"><span>Вид</span><select data-node-prop="kind">${[['team','Команда / участник'],['note','Подпись'],['winner','Победитель']].map(([v,t])=>`<option value="${v}" ${v===n.kind?'selected':''}>${t}</option>`).join('')}</select></label><label class="field"><span>Оформление</span><select data-node-prop="style">${[['accent','Фирменный жёлтый'],['dark','Тёмный'],['outline','Только обводка']].map(([v,t])=>`<option value="${v}" ${v===n.style?'selected':''}>${t}</option>`).join('')}</select></label><div class="bracket-property-grid">${[['width','Ширина'],['height','Высота'],['x','По горизонтали'],['y','По вертикали']].map(([key,title])=>`<label class="field"><span>${title}</span><input type="number" step="20" min="${key==='width'?120:key==='height'?40:0}" max="${key==='width'?640:key==='height'?400:key==='x'?layout.width-n.width:layout.height-n.height}" value="${n[key]}" data-node-prop="${key}"></label>`).join('')}</div><button type="button" class="danger-button" data-bc="delete-node" data-id="${esc(n.id)}">Удалить прямоугольник</button><p class="bracket-help">Связанные с ним линии тоже удалятся. Действие можно отменить кнопкой ↶.</p>`;
    }else if(edge){inspector.innerHTML=`<p class="bracket-inspector-label">СОЕДИНИТЕЛЬНАЯ ЛИНИЯ</p><p class="bracket-edge-caption">${esc(nodeById(edge.from).text)} → ${esc(nodeById(edge.to).text)}</p>${[['fromSide','Выход из первого блока'],['toSide','Вход во второй блок']].map(([key,title])=>`<label class="field"><span>${title}</span><select data-edge-prop="${key}">${SIDES.map(side=>`<option value="${side}" ${edge[key]===side?'selected':''}>${SIDE_NAMES[side]}</option>`).join('')}</select></label>`).join('')}<button type="button" class="danger-button" data-bc="delete-edge">Удалить линию</button>`;
    }else{inspector.innerHTML=`<p class="bracket-inspector-label">НАСТРОЙКИ ПОЛЯ</p><p class="bracket-help">Выберите прямоугольник или линию для редактирования. Стрелки клавиатуры перемещают выбранный блок, Delete удаляет его.</p>${[['width','Ширина поля',800,3200],['height','Высота поля',400,2400]].map(([key,title,min,max])=>`<label class="field"><span>${title}</span><input type="number" step="20" min="${min}" max="${max}" value="${layout[key]}" data-board-prop="${key}"></label>`).join('')}<span class="bracket-count">${layout.nodes.length} прямоугольников · ${layout.edges.length} линий</span>`;}
    inspector.querySelectorAll('input,select,textarea,button').forEach(el=>el.disabled=!canEdit());
  }
  function publish(next,{remember=true,redraw=true}={}){
    if(!canEdit())return false;
    try{validateLayout(next);onChange(clone(next),{remember});layout=clone(next);if(redraw)draw();return true;}catch(error){notice(error.message,true);return false;}
  }
  function transact(fn,options){const next=clone(layout);fn(next);return publish(next,options);}
  function selectNode(id){selected=id;selectedEdge=null;paintSelection();drawInspector();}
  function addNode(kind,position){
    if(!canEdit())return;const next=clone(layout),node={id:uid(),kind,style:kind==='note'?'outline':'accent',text:kind==='winner'?'ПОБЕДИТЕЛЬ':kind==='note'?'Подпись':'Название команды',width:240,height:kind==='winner'?160:60};
    const p=position||{x:(viewport.scrollLeft+viewport.clientWidth/2)/zoom-node.width/2,y:(viewport.scrollTop+120)/zoom};
    const free=freePosition(next,node,p.x,p.y);if(!free){notice('На поле нет места. Увеличьте его размер.',true);return;}
    Object.assign(node,free);next.nodes.push(node);if(!layout.nodes.length)next.enabled=true;selected=node.id;selectedEdge=null;pending=null;if(publish(next))notice('Прямоугольник добавлен. Двойное нажатие — изменить текст.');
  }
  function connect(a,b){
    if(a.nodeId===b.nodeId){notice('Выберите сторону другого прямоугольника.',true);return;}
    const edge={id:uid(),from:a.nodeId,fromSide:a.side,to:b.nodeId,toSide:b.side};
    if(layout.edges.some(e=>sameConnection(e,edge))){notice('Эти стороны уже соединены.',true);return;}
    selected=null;selectedEdge=edge.id;pending=null;if(transact(next=>next.edges.push(edge)))notice('Линия добавлена. Её можно выбрать и удалить отдельно.');
  }
  function deleteNode(id){if(!nodeById(id))return;pending=null;selected=null;selectedEdge=null;if(publish(removeNode(layout,id)))notice('Прямоугольник и его линии удалены. Кнопка ↶ отменит действие.');}
  function deleteEdge(){const id=selectedEdge;selectedEdge=null;pending=null;if(transact(next=>next.edges=next.edges.filter(e=>e.id!==id)))notice('Линия удалена.');}
  listen(root,'click',e=>{
    if(suppressClick)return;
    const template=e.target.closest('[data-template]');if(template){addNode(template.dataset.template);return;}
    const port=e.target.closest('[data-port]');if(port&&canEdit()){
      const target={nodeId:port.dataset.nodeId,side:port.dataset.port};
      if(pending&&pending.nodeId!==target.nodeId)connect(pending,target);else{pending=pending?.nodeId===target.nodeId&&pending.side===target.side?null:target;notice(pending?'Выберите точку на стороне другого прямоугольника.':'Соединение отменено.');paintSelection();}return;
    }
    const action=e.target.closest('[data-bc]');if(action){const command=action.dataset.bc;
      if(command==='zoom-in'||command==='zoom-out'){autoFit=false;setZoom(zoom+(command==='zoom-in'?0.1:-0.1));}
      if(command==='fit'){autoFit=true;fit();viewport.scrollTo(0,0);}
      if(command==='delete-node')deleteNode(action.dataset.id||selected);
      if(command==='delete-edge')deleteEdge();
      if(command==='clear'&&canEdit()){selected=null;selectedEdge=null;pending=null;if(transact(next=>{next.nodes=[];next.edges=[];}))notice('Сетка очищена. Кнопка ↶ вернёт её целиком.');}
      if(command==='template'&&canEdit()){if(layout.nodes.length){notice('Для шаблона нужно пустое поле. Текущую сетку можно очистить и при необходимости вернуть кнопкой ↶.',true);return;}selected=null;selectedEdge=null;pending=null;if(publish(eightTeamLayout(teams.map(t=>t.name),uid)))notice('Шаблон готов. Изменяйте тексты, расположение и соединения.');}
      return;
    }
    const edge=e.target.closest('[data-edge]');if(edge){selected=null;selectedEdge=edge.dataset.edge;pending=null;paintSelection();drawInspector();return;}
    if(e.target.closest('[data-node]'))return;
    if(e.target.closest('.bracket-stage')){selected=null;selectedEdge=null;pending=null;paintSelection();drawInspector();}
  });
  listen(root,'pointerdown',e=>{
    if(e.button!==0||!canEdit()||e.target.closest('textarea,input,[data-bc]'))return;
    const port=e.target.closest('[data-port]');if(port){e.preventDefault();linkDrag={source:{nodeId:port.dataset.nodeId,side:port.dataset.port},point:point(e),startX:e.clientX,startY:e.clientY,pointerId:e.pointerId};return;}
    const element=e.target.closest('[data-node]');if(!element)return;e.preventDefault();selectNode(element.dataset.node);element.focus({preventScroll:true});
    const node=nodeById(selected),p=point(e);drag={id:node.id,start:clone(node),before:clone(layout),offsetX:p.x-node.x,offsetY:p.y-node.y,startX:e.clientX,startY:e.clientY,pointerId:e.pointerId,moved:false};element.classList.add('is-held');
  });
  listen(document,'pointermove',e=>{
    if(drag&&drag.pointerId===e.pointerId){
      if(!canEdit()){cancelDrag();return;}
      if(Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>3){if(!drag.moved)root.setPointerCapture(e.pointerId);drag.moved=true;}
      if(!drag.moved)return;e.preventDefault();const p=point(e),node=nodeById(drag.id);node.x=clamp(snap(p.x-drag.offsetX),0,layout.width-node.width);node.y=clamp(snap(p.y-drag.offsetY),0,layout.height-node.height);
      const element=[...nodes.children].find(n=>n.dataset.node===node.id);element.style.left=node.x+'px';element.style.top=node.y+'px';element.classList.toggle('is-overlapping',layout.nodes.some(n=>n.id!==node.id&&overlaps(node,n,GRID)));paintLines();
    }
    if(linkDrag&&linkDrag.pointerId===e.pointerId){if(!canEdit()){linkDrag=null;paintLines();return;}linkDrag.point=point(e);paintLines();}
  });
  function cancelDrag(){if(drag){layout=drag.before;drag=null;}linkDrag=null;draw();}
  listen(document,'pointercancel',e=>{if(drag?.pointerId===e.pointerId||linkDrag?.pointerId===e.pointerId)cancelDrag();});
  listen(document,'pointerup',e=>{
    if(drag?.pointerId===e.pointerId){const ended=drag;drag=null;if(root.hasPointerCapture(e.pointerId))root.releasePointerCapture(e.pointerId);
      if(ended.moved){suppressClick=true;setTimeout(()=>suppressClick=false,0);const node=nodeById(ended.id),free=freePosition(layout,node,node.x,node.y);if(free){Object.assign(node,free);const next=clone(layout);layout=ended.before;if(publish(next))notice('Положение выровнено по сетке.');}else{layout=ended.before;draw();notice('Недостаточно места. Прямоугольник возвращён.',true);}}
      else{nodes.querySelector('.is-held')?.classList.remove('is-held');}
    }
    if(linkDrag?.pointerId===e.pointerId){const ended=linkDrag;linkDrag=null;const port=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-port]');
      if(Math.hypot(e.clientX-ended.startX,e.clientY-ended.startY)>4){suppressClick=true;setTimeout(()=>suppressClick=false,0);if(port)connect(ended.source,{nodeId:port.dataset.nodeId,side:port.dataset.port});else{pending=ended.source;notice('Выберите точку на другом прямоугольнике.');paintSelection();}}
      else paintLines();
    }
  });
  listen(root,'dblclick',e=>{
    if(!canEdit()||e.target.closest('button,textarea'))return;const element=e.target.closest('[data-node]');if(!element)return;
    selectNode(element.dataset.node);const n=nodeById(selected),face=element.querySelector('.bracket-face');face.innerHTML=`<textarea class="bracket-inline" aria-label="Текст прямоугольника" maxlength="500">${esc(n.text)}</textarea>`;face.querySelector('textarea').focus();face.querySelector('textarea').select();textTransaction=false;
  });
  listen(root,'focusin',e=>{if(e.target.matches('[data-node-prop="text"],.bracket-inline'))textTransaction=false;});
  listen(root,'input',e=>{
    if(!e.target.matches('[data-node-prop="text"],.bracket-inline')||!selected)return;
    const next=clone(layout),n=next.nodes.find(n=>n.id===selected);n.text=e.target.value;
    if(publish(next,{remember:!textTransaction,redraw:false})){textTransaction=true;const element=[...nodes.children].find(n=>n.dataset.node===selected);element.setAttribute('aria-label',n.text||'Прямоугольник');const text=element.querySelector('.bracket-node-text');if(text)text.textContent=n.text;}
  });
  listen(root,'focusout',e=>{if(e.target.matches('.bracket-inline')){draw();}textTransaction=false;});
  listen(root,'change',e=>{
    if(!canEdit())return;
    const prop=e.target.dataset.nodeProp;if(prop&&prop!=='text'&&selected){
      const next=clone(layout),n=next.nodes.find(n=>n.id===selected);n[prop]=['x','y','width','height'].includes(prop)?snap(Number(e.target.value)):e.target.value;
      if(n.kind==='winner'&&prop==='kind')n.height=Math.max(n.height,160);
      if(n.width<120||n.width>640||n.height<40||n.height>400){notice('Ширина: 120–640, высота: 40–400.',true);drawInspector();return;}
      const free=freePosition(next,n,n.x,n.y);if(!free){notice('Нет места для такого размера.',true);drawInspector();return;}Object.assign(n,free);if(!publish(next))drawInspector();
    }
    if(e.target.dataset.edgeProp&&selectedEdge){if(!transact(next=>next.edges.find(edge=>edge.id===selectedEdge)[e.target.dataset.edgeProp]=e.target.value))drawInspector();}
    if(e.target.dataset.boardProp){if(!transact(next=>next[e.target.dataset.boardProp]=snap(Number(e.target.value))))drawInspector();}
  });
  listen(root,'keydown',e=>{
    if(e.target.matches('input,textarea,select')){if(e.target.matches('.bracket-inline')&&e.key==='Enter'&&!e.shiftKey){e.preventDefault();e.target.blur();}return;}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();(e.shiftKey?onRedo:onUndo)();return;}
    if(e.key==='Escape'){pending=null;selectedEdge=null;if(drag||linkDrag)cancelDrag();else{paintSelection();drawInspector();}notice('Соединение отменено.');}
    if((e.key==='Delete'||e.key==='Backspace')&&canEdit()){e.preventDefault();if(selected)deleteNode(selected);else if(selectedEdge)deleteEdge();}
    const move={ArrowLeft:[-GRID,0],ArrowRight:[GRID,0],ArrowUp:[0,-GRID],ArrowDown:[0,GRID]}[e.key];
    if(move&&selected&&canEdit()){e.preventDefault();const next=clone(layout),n=next.nodes.find(n=>n.id===selected),free=freePosition(next,n,n.x+move[0],n.y+move[1]);if(free){Object.assign(n,free);publish(next);}}
  });
  listen(root,'dragstart',e=>{const template=e.target.closest('[data-template]');if(!template||!canEdit()){e.preventDefault();return;}e.dataTransfer.setData('application/x-cup-bracket-node',template.dataset.template);e.dataTransfer.effectAllowed='copy';});
  listen(viewport,'dragover',e=>{if([...e.dataTransfer.types].includes('application/x-cup-bracket-node')&&canEdit()){e.preventDefault();e.dataTransfer.dropEffect='copy';viewport.classList.add('is-drop-target');}});
  listen(viewport,'dragleave',e=>{if(!viewport.contains(e.relatedTarget))viewport.classList.remove('is-drop-target');});
  listen(viewport,'drop',e=>{viewport.classList.remove('is-drop-target');const kind=e.dataTransfer.getData('application/x-cup-bracket-node');if(['team','note','winner'].includes(kind)){e.preventDefault();addNode(kind,point(e));}});
  const observer=new ResizeObserver(()=>{if(autoFit)fit();});observer.observe(viewport);draw();
  return ()=>{abort.abort();observer.disconnect();};
}
