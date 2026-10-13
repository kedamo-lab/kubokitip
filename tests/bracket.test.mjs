import test from 'node:test';
import assert from 'node:assert/strict';
import {GRID,SIDES,emptyLayout,snap,freePosition,overlaps,removeNode,portPoint,connectionPoints,connectionPath,contentBounds,validateLayout,eightTeamLayout} from '../public/bracket-model.js';
const node=(id,x,y,width=240,height=60)=>({id,x,y,width,height,text:id,kind:'team',style:'accent'});
const edge=(id,from,to,fromSide='right',toSide='left')=>({id,from,to,fromSide,toSide});

test('Blocks snap to a grid, remain inside the field and find a free position',()=>{
  assert.equal(snap(31),40);assert.equal(snap(29),20);
  const layout=emptyLayout();layout.nodes=[node('first',40,40)];
  const second=node('second',40,40),position=freePosition(layout,second,40,40);
  assert.ok(position);assert.equal(position.x%GRID,0);assert.equal(position.y%GRID,0);assert.equal(overlaps({...second,...position},layout.nodes[0],GRID),false);
  assert.deepEqual(freePosition(layout,layout.nodes[0],40,40),{x:40,y:40});
  const bounded=freePosition(layout,second,9999,-99);assert.ok(bounded.x+second.width<=layout.width);assert.equal(bounded.y,0);
  assert.equal(freePosition({...layout,width:800,height:400,nodes:[node('filled',0,0,800,400)]},second,0,0),null);
});

test('Connections support all sixteen side combinations with orthogonal paths',()=>{
  const layout={...emptyLayout(),nodes:[node('a',40,200),node('b',1000,400)]};
  for(const fromSide of SIDES)for(const toSide of SIDES){
    const e=edge('line','a','b',fromSide,toSide),points=connectionPoints(layout,e);
    assert.deepEqual(points[0],portPoint(layout.nodes[0],fromSide));assert.deepEqual(points.at(-1),portPoint(layout.nodes[1],toSide));
    assert.ok(points.every((p,i)=>!i||p.x===points[i-1].x||p.y===points[i-1].y));assert.doesNotMatch(connectionPath(layout,e),/NaN|undefined/);
  }
});

test('Connection paths route around an intervening block and follow moved blocks',()=>{
  const layout={...emptyLayout(),nodes:[node('a',40,200),node('obstacle',500,180,240,100),node('b',1000,200)]},e=edge('line','a','b');
  const before=connectionPath(layout,e),points=connectionPoints(layout,e),obstacle=layout.nodes[1];
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i];
    const hits=a.x===b.x?a.x>obstacle.x&&a.x<obstacle.x+obstacle.width&&Math.max(a.y,b.y)>obstacle.y&&Math.min(a.y,b.y)<obstacle.y+obstacle.height:a.y>obstacle.y&&a.y<obstacle.y+obstacle.height&&Math.max(a.x,b.x)>obstacle.x&&Math.min(a.x,b.x)<obstacle.x+obstacle.width;
    assert.equal(hits,false);
  }
  layout.nodes[2].y=600;assert.notEqual(connectionPath(layout,e),before);
});

test('Removing one rectangle removes only incident connections and does not mutate its backup',()=>{
  const layout={...emptyLayout(),nodes:[node('a',40,40),node('b',400,40),node('c',800,40)],edges:[edge('ab','a','b'),edge('bc','b','c'),edge('ac','a','c')]};
  const result=removeNode(layout,'b');assert.deepEqual(result.nodes.map(n=>n.id),['a','c']);assert.deepEqual(result.edges.map(e=>e.id),['ac']);assert.equal(layout.nodes.length,3);assert.equal(layout.edges.length,3);
});

test('The eight-team template is aligned, editable and valid without changing supplied team names',()=>{
  let id=0;const layout=eightTeamLayout(['Команда «А»','<Команда Б>'],()=>String(++id));
  assert.equal(validateLayout(layout),layout);assert.equal(layout.nodes.length,15);assert.equal(layout.edges.length,14);assert.equal(layout.nodes[0].text,'Команда «А»');assert.equal(layout.nodes.at(-1).kind,'winner');
  assert.ok(layout.nodes.every(n=>[n.x,n.y,n.width,n.height].every(v=>v%GRID===0)));
});

test('Graph validation rejects invalid links, unsafe backgrounds, duplicate elements and off-grid placement',()=>{
  let id=0;const base=eightTeamLayout([],()=>String(++id));
  for(const change of [g=>g.edges[0].to='missing',g=>g.edges[0].to=g.edges[0].from,g=>g.edges[0].toSide='diagonal',g=>g.nodes[0].x=31,g=>g.nodes[0].x=3200,g=>g.nodes[1].id=g.nodes[0].id,g=>g.edges.push({...g.edges[0],id:'new'}),g=>g.background='javascript:alert(1)',g=>g.nodes[0].text='a'.repeat(501)]){
    const layout=structuredClone(base);change(layout);assert.throws(()=>validateLayout(layout));
  }
});

test('Public bounds trim empty space while retaining every rectangle, line and margin',()=>{
  const layout={...emptyLayout(),width:3200,height:2000,nodes:[node('a',1000,1200),node('b',1700,1400)],edges:[edge('ab','a','b','left','left')]},before=structuredClone(layout),bounds=contentBounds(layout);
  assert.ok(bounds.width<layout.width/2);assert.ok(bounds.height<layout.height/2);assert.ok(bounds.x>0&&bounds.y>0);
  const points=layout.nodes.flatMap(n=>[{x:n.x,y:n.y},{x:n.x+n.width,y:n.y+n.height}]).concat(connectionPoints(layout,layout.edges[0]));
  for(const p of points){assert.ok(p.x>=bounds.x+40&&p.x<=bounds.x+bounds.width-40);assert.ok(p.y>=bounds.y+40&&p.y<=bounds.y+bounds.height-40);}
  assert.deepEqual(layout,before);
  assert.deepEqual(contentBounds({...emptyLayout(),nodes:[node('single',0,0)]}),{x:-40,y:-40,width:320,height:140});
});
