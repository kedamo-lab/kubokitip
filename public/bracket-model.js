export const GRID=20;
export const SIDES=['top','right','bottom','left'];
export const SIDE_NAMES={top:'Сверху',right:'Справа',bottom:'Снизу',left:'Слева'};
export const emptyLayout=()=>({enabled:false,width:1600,height:900,background:'',nodes:[],edges:[]});
export const snap=value=>Math.round(value/GRID)*GRID;
export const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
export const overlaps=(a,b,gap=0)=>a.x<b.x+b.width+gap&&a.x+a.width+gap>b.x&&a.y<b.y+b.height+gap&&a.y+a.height+gap>b.y;
export function freePosition(layout,node,x,y,excludeId=node.id){
  const start={x:clamp(snap(x),0,layout.width-node.width),y:clamp(snap(y),0,layout.height-node.height)};
  const available=p=>!layout.nodes.some(other=>other.id!==excludeId&&overlaps({...node,...p},other,GRID));
  if(available(start))return start;
  let best=null,distance=Infinity;
  for(let cy=0;cy<=layout.height-node.height;cy+=GRID)for(let cx=0;cx<=layout.width-node.width;cx+=GRID){
    const d=(cx-start.x)**2+(cy-start.y)**2;
    if(d<distance&&available({x:cx,y:cy})){best={x:cx,y:cy};distance=d;}
  }
  return best;
}
export function removeNode(layout,id){return {...layout,nodes:layout.nodes.filter(n=>n.id!==id),edges:layout.edges.filter(e=>e.from!==id&&e.to!==id)};}
export const sameConnection=(a,b)=>a.from===b.from&&a.to===b.to&&a.fromSide===b.fromSide&&a.toSide===b.toSide;
export function portPoint(node,side){
  return {top:{x:node.x+node.width/2,y:node.y},right:{x:node.x+node.width,y:node.y+node.height/2},bottom:{x:node.x+node.width/2,y:node.y+node.height},left:{x:node.x,y:node.y+node.height/2}}[side];
}
const vectors={top:[0,-1],right:[1,0],bottom:[0,1],left:[-1,0]};
const step=(point,side)=>({x:point.x+vectors[side][0]*GRID,y:point.y+vectors[side][1]*GRID});
const segmentHits=(a,b,n)=>a.x===b.x?a.x>n.x&&a.x<n.x+n.width&&Math.max(a.y,b.y)>n.y&&Math.min(a.y,b.y)<n.y+n.height:a.y>n.y&&a.y<n.y+n.height&&Math.max(a.x,b.x)>n.x&&Math.min(a.x,b.x)<n.x+n.width;
export function connectionPoints(layout,edge){
  const from=layout.nodes.find(n=>n.id===edge.from),to=layout.nodes.find(n=>n.id===edge.to);
  if(!from||!to)return [];
  const a=portPoint(from,edge.fromSide),b=portPoint(to,edge.toSide),s=step(a,edge.fromSide),t=step(b,edge.toSide);
  const xs=[(s.x+t.x)/2,Math.min(from.x,to.x)-40,Math.max(from.x+from.width,to.x+to.width)+40];
  const ys=[(s.y+t.y)/2,Math.min(from.y,to.y)-40,Math.max(from.y+from.height,to.y+to.height)+40];
  for(const n of layout.nodes){xs.push(n.x-20,n.x+n.width+20);ys.push(n.y-20,n.y+n.height+20);}
  const lanes=(values,center)=>[...new Set([...values.slice(0,3),...values.slice(3).sort((p,q)=>Math.abs(p-center)-Math.abs(q-center)).slice(0,10),Math.min(...values),Math.max(...values)])];
  const candidates=[ [s,{x:t.x,y:s.y},t], [s,{x:s.x,y:t.y},t] ];
  for(const x of lanes(xs,(s.x+t.x)/2))candidates.push([s,{x,y:s.y},{x,y:t.y},t]);
  for(const y of lanes(ys,(s.y+t.y)/2))candidates.push([s,{x:s.x,y},{x:t.x,y},t]);
  const cost=points=>points.slice(1).reduce((total,p,i)=>total+Math.abs(p.x-points[i].x)+Math.abs(p.y-points[i].y)+layout.nodes.filter(n=>segmentHits(points[i],p,n)).length*100000+(p.x<0||p.y<0||p.x>layout.width||p.y>layout.height?10000:0),0);
  let best=candidates[0],bestCost=Infinity;for(const candidate of candidates){const score=cost(candidate);if(score<bestCost){best=candidate;bestCost=score;}}
  return [a,...best,b].filter((p,i,all)=>!i||p.x!==all[i-1].x||p.y!==all[i-1].y);
}
export const pathFromPoints=points=>points.map((p,i)=>`${i?'L':'M'}${p.x} ${p.y}`).join(' ');
export const connectionPath=(layout,edge)=>pathFromPoints(connectionPoints(layout,edge));
export function validateLayout(layout){
  const check=(valid,message)=>{if(!valid)throw new Error(message);};
  check(layout&&typeof layout==='object'&&!Array.isArray(layout),'Неверная структура визуальной сетки.');
  check(typeof layout.enabled==='boolean','Укажите режим показа сетки.');
  for(const [key,min,max] of [['width',800,3200],['height',400,2400]])check(Number.isInteger(layout[key])&&layout[key]>=min&&layout[key]<=max&&layout[key]%GRID===0,'Размер поля должен быть кратен 20 и находиться в допустимых пределах.');
  check(typeof layout.background==='string'&&layout.background.length<=2000,'Проверьте фон сетки.');
  if(layout.background){let url;try{url=new URL(layout.background,'https://site.test');}catch{}check(url&&['http:','https:'].includes(url.protocol),'Некорректная ссылка фона сетки.');}
  check(Array.isArray(layout.nodes)&&layout.nodes.length<=120,'В одной сетке может быть не более 120 прямоугольников.');
  check(Array.isArray(layout.edges)&&layout.edges.length<=240,'В одной сетке может быть не более 240 линий.');
  const ids=new Set(),validId=id=>typeof id==='string'&&/^[\w-]{1,80}$/.test(id);
  for(const n of layout.nodes){
    check(n&&validId(n.id)&&!ids.has(n.id),'Идентификаторы прямоугольников должны быть уникальными.');ids.add(n.id);
    check(typeof n.text==='string'&&n.text.length<=500,'Текст прямоугольника — до 500 символов.');
    check(['team','note','winner'].includes(n.kind)&&['accent','dark','outline'].includes(n.style),'Неизвестный вид прямоугольника.');
    for(const key of ['x','y','width','height'])check(Number.isInteger(n[key])&&n[key]%GRID===0,'Прямоугольники должны быть выровнены по сетке.');
    check(n.width>=120&&n.width<=640&&n.height>=40&&n.height<=400&&n.x>=0&&n.y>=0&&n.x+n.width<=layout.width&&n.y+n.height<=layout.height,'Прямоугольник выходит за границы поля или имеет неверный размер.');
  }
  const edgeIds=new Set(),connections=new Set();
  for(const e of layout.edges){
    check(e&&validId(e.id)&&!edgeIds.has(e.id),'Идентификаторы линий должны быть уникальными.');edgeIds.add(e.id);
    check(ids.has(e.from)&&ids.has(e.to)&&e.from!==e.to,'Линия должна соединять два существующих разных прямоугольника.');
    check(SIDES.includes(e.fromSide)&&SIDES.includes(e.toSide),'Выберите сторону для обоих концов линии.');
    const key=JSON.stringify([e.from,e.fromSide,e.to,e.toSide]);check(!connections.has(key),'Такая линия уже существует.');connections.add(key);
  }
  return layout;
}
export function eightTeamLayout(names=[],id=()=>crypto.randomUUID()){
  const layout={...emptyLayout(),enabled:true,height:800};let previous=[];
  for(let round=0;round<4;round++){
    const count=8/2**round,current=[];
    for(let i=0;i<count;i++){
      const center=round===0?110+i*80:(previous[i*2].y+previous[i*2+1].y)/2+30;
      const winner=round===3,node={id:id(),x:60+round*400,y:snap(center-(winner?80:30)),width:winner?260:240,height:winner?160:60,text:round===0?(names[i]||'Команда '+(i+1)):winner?'ПОБЕДИТЕЛЬ':'Участник определится',kind:winner?'winner':'team',style:'accent'};
      layout.nodes.push(node);current.push(node);
      if(round)for(const source of previous.slice(i*2,i*2+2))layout.edges.push({id:id(),from:source.id,fromSide:'right',to:node.id,toSide:'left'});
    }
    previous=current;
  }
  return layout;
}
