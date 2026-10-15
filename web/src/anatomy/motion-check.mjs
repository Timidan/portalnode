import * as A from './iso/audit.mjs';
import * as G from './iso/lathe.mjs';
import assert from 'node:assert/strict';

const recorded=new WeakMap(),homeSignatures=new WeakMap(),boundsCache=new WeakMap();
const bounds=shape=>{if(!boundsCache.has(shape))boundsCache.set(shape,A.boundsOf(shape));return boundsCache.get(shape);};
const intersects=(a,b)=>a.min.every((v,i)=>v<=b.max[i]&&a.max[i]>=b.min[i]);
const screenBounds=(shape,cam)=>{const box=bounds(shape),axes=[cam.R,cam.D],pad=.25/cam.k;return {min:axes.map(axis=>axis.reduce((s,v,i)=>s+v*(v<0?box.max[i]:box.min[i]),0)-pad),max:axes.map(axis=>axis.reduce((s,v,i)=>s+v*(v<0?box.min[i]:box.max[i]),0)+pad)};};
const signature=shape=>JSON.stringify([shape.kind,shape.F,shape.o,shape.poly,shape.points,shape.radii,shape.s0,shape.s1],(_,v)=>typeof v==='number'?Math.round(v*1e8)/1e8:v);
export function posedParts(parts,m,H){
  const off=H.offsets(m),spring=H.springAt(5.35*m.punch);
  return parts.map((base,index)=>{
    let p=base.pose?base.pose(m):base;
    const {kind,args,meta={}}=p.shape;
    let shape=recorded.get(p);if(!shape){shape=A[kind](...args,{name:p.name,...meta});recorded.set(p,shape);}
    let delta=G.sub3(p.at,base.at);
    if(base.motion&&off[base.motion]){
      const translation=off[base.motion];
      if(!base.pose)shape=A.moved(shape,translation);
      delta=translation;
    }
    if(base.name.startsWith('coin.')){
      const {F}=H.coinPaths(m,Number(base.name.at(-1)));shape=A.disc(F,-.65,.65,5.3,{name:p.name});delta=G.sub3(F.o,base.at);
    }
    if(base.name.startsWith('spring.')){
      const piece=spring.pieces[Number(base.name.split('.')[1])];shape=A.tube(piece.points,piece.radii,{name:p.name});delta=G.sub3(piece.mid,base.at);
    }
    if(!homeSignatures.has(base)){const {kind,args,meta={}}=base.shape;homeSignatures.set(base,signature(A[kind](...args,{name:base.name,...meta})));}
    const poseSignature=signature(shape);return {base,shape,delta,dynamic:poseSignature!==homeSignatures.get(base),index,signature:poseSignature};
  });
}

/** The renderer and checks reconstruct the same pose, including reverse scrubs. */
export async function checkMotion(parts,P,R){
  const H=await import('./.build/live-model.mjs');
  const {modelAt,CLOCK,ERA_HOURS}=H;
  assert.equal(ERA_HOURS,CLOCK.sessionsPerEra*CLOCK.sessionHours);
  assert.deepEqual([0,9,14,17,23,27].map(t=>modelAt(t).state),['open','unpunched','armed','punched','filed','expired']);
  assert.equal(modelAt(15.99).claimMarked,false);assert.equal(modelAt(16).claimMarked,true);
  assert.equal(modelAt(27).oldCardAge,CLOCK.historyDepth+1);
  for(const [name,points,r] of [['coin-latch.upper',H.latchRoutes(modelAt(0))[0],.25],['coin-latch.lower',H.latchRoutes(modelAt(0))[1],.25],['cycle.latch',H.barrelLatchPoints(modelAt(0)),.25],['cycle.hold-pawl',H.holdPawlPoints(modelAt(0)),.25],['bell.trip-link',H.tripPoints,H.tripRadius]])R.route(name,points,r,name==='cycle.latch'?{gaps:H.latchGaps(modelAt(0))}:name==='bell.trip-link'?{gaps:H.tripGaps}:{});
  const keys=Object.fromEntries(R.items.map(p=>[p.name,p.key])),camera=A.cameraBasis(P),V=camera.V;
  const depthItems=parts.map(p=>({name:p.name,key:keys[p.name],move:V,ride:p.name}));
  const overlaps={...R.settled.overlaps,pairs:[...R.settled.overlaps.pairs],states:[0]};
  const problems=new Map(),reference=new Map(),pairPoses=new Map(),fixedSolids=new Map(),priorDepth=new Map(),paintCycles=new Set();let frames=0,depthFrames=0;
  const record=(issue,t)=>{const key=[issue.tube,issue.other].sort().join(' × ');if(!problems.has(key))console.log(`intersection t=${t.toFixed(3)} ${key}: ${issue.clearance.toFixed(3)}`);if(!problems.has(key)||issue.clearance<problems.get(key).clearance)problems.set(key,{...issue,t});};
  for(let frame=0;frame<=1800;frame++){
    const t=frame/60,m=modelAt(t),posed=posedParts(parts,m,H).filter(({base})=>!(base.name==='rack.expired-card'&&t>=29.3)&&!(base.name==='punch.card'&&t>=30)&&!(base.name.startsWith('coin.')&&t>=30));
    // The kit accepts translations. Rebase rotating shapes, then undo exactly at state 1.
    const movingBounds=posed.filter(p=>p.dynamic&&p.shape.kind!=='tube').map(p=>bounds(p.shape));
    // Conservative bounds omit only pairs that cannot overlap in world space.
    const solids=posed.filter(p=>p.shape.kind!=='tube'&&(p.dynamic||movingBounds.some(b=>intersects(bounds(p.shape),b)))).map(p=>{
      if(!p.dynamic&&fixedSolids.has(p.base.name))return fixedSolids.get(p.base.name);
      const move=p.dynamic?[p.index+1,0,0]:[0,0,0],shape={...A.moved(p.shape,G.mul3(move,-1)),move,piece:'pose'};
      const ref=reference.get(p.base.name),profile=JSON.stringify([p.shape.kind,p.shape.poly,p.shape.cut&&[p.shape.cut].flat().map(c=>[c.kind,c.poly,c.s0,c.s1])]);
      // Cache only rigidly transformed samples; the recorded surfaces are unchanged.
      if(ref?.profile===profile&&ref.shape.F&&shape.F&&!shape.slide){
        const cache=A.solidClearances.cache?.get(ref.shape);
        if(cache){const next=new Map();for(const [key,grid] of cache){const cell=Number(key.split(':')[1]),mapped=new Map();for(const points of grid.values())for(const point of points){const q=G.sub3(point,ref.shape.F.o),F=shape.F,R=ref.shape.F,p=G.add3(F.o,G.add3(G.mul3(F.a,G.dot3(q,R.a)),G.add3(G.mul3(F.u,G.dot3(q,R.u)),G.mul3(F.v,G.dot3(q,R.v))))),bin=p.map(v=>Math.floor(v/cell)).join(',');if(!mapped.has(bin))mapped.set(bin,[]);mapped.get(bin).push(p);}next.set(key,mapped);}A.solidClearances.cache.set(shape,next);}
      }
      if(!ref||!A.solidClearances.cache?.has(ref.shape))reference.set(p.base.name,{shape,profile});if(!p.dynamic)fixedSolids.set(p.base.name,shape);return shape;
    });
    for(const issue of A.solidClearances(solids,{state:1}))record(issue,t);
    if(frame%4===0){
      const shapes=posed.filter(p=>p.shape.kind!=='tube').map(p=>p.shape);
      // This thin link needs the tube check: the solid audit's 0.5 sink limit exceeds its radius.
      const linkParts=posed.filter(p=>p.base.physical==='punch.coin-gate.link'&&p.base.shape.kind==='disc'),F=linkParts[0].shape.F;
      const profile=linkParts.flatMap(p=>p.shape.poly),ends=[Math.min(...profile.map(p=>p[0])),Math.max(...profile.map(p=>p[0]))],radius=Math.max(...profile.map(p=>p[1]));
      const link=A.tube(ends.map(s=>G.add3(F.o,G.mul3(F.a,s))),radius,{name:'punch.coin-gate.link'});
      for(const issue of A.clearances([link],posed.filter(p=>p.base.physical!=='punch.coin-gate.link'&&p.shape.kind!=='tube').map(p=>p.shape),{only:'through',mounts:new Map([[link,[null,null]]])}))record(issue,t);
      const wires=[['return-spring',H.springAt(5.35*m.punch).points,.34],['coin-latch.upper',H.latchRoutes(m)[0],.25],['coin-latch.lower',H.latchRoutes(m)[1],.25],['cycle.latch',H.barrelLatchPoints(m),.25],['cycle.hold-pawl',H.holdPawlPoints(m),.25],['bell.trip-link',H.tripPoints.map(p=>G.add3(p,H.offsets(m).trip)),H.tripRadius]];
      const wireShapes=wires.map(([name,points,r])=>A.tube(points,r,{name,owner:name,tips:[points[0],points.at(-1)],tipAxes:[G.unit3(G.sub3(points[1],points[0])),G.unit3(G.sub3(points.at(-1),points.at(-2)))],tipRims:[typeof r==='function'?r(0):r,typeof r==='function'?r(1):r]}));
      for(const issue of A.clearances(wireShapes,shapes,{only:'through'}))record(issue,t);
      const byName=new Map(posed.map(p=>[p.base.name,{name:p.base.name,key:keys[p.base.name]+G.dot3(p.delta,V),shapes:[p.shape],dynamic:p.dynamic,signature:p.signature}]));
      const items=parts.map(p=>byName.get(p.name)??{name:p.name,key:keys[p.name],shapes:[],dynamic:true});
      const state={label:`t=${t.toFixed(3)}`,shares:Object.fromEntries(items.map(p=>[p.name,p.key-keys[p.name]]))};
      const changed=items.filter(p=>p.shapes.length&&priorDepth.get(p.name)!==p.signature).map(p=>screenBounds(p.shapes[0],camera));
      const active=items.flatMap((p,index)=>p.shapes.length&&changed.some(b=>intersects(screenBounds(p.shapes[0],camera),b))?[{...p,index}]:[]);
      // Unchanged pairs already have constraints; offscreen bounds cannot share pixels.
      const pose=A.overlapsOf(active,P,{skip:(a,b)=>{if(priorDepth.get(a.name)===a.signature&&priorDepth.get(b.name)===b.signature)return true;const key=a.name+'|'+b.name,signature=a.signature+'|'+b.signature,seen=pairPoses.get(key)===signature;pairPoses.set(key,signature);return seen;}});
      for(const pair of pose.pairs)if(pair.front.every(side=>side.area>=pose.least)){const names=[active[pair.a].name,active[pair.b].name].join(' × ');if(!paintCycles.has(names))console.log(`paint cycle t=${t.toFixed(3)} ${names}`);paintCycles.add(names);}
      overlaps.pairs.push(...pose.pairs.map(pair=>({...pair,a:active[pair.a].index,b:active[pair.b].index,state})));overlaps.states.push(state);depthFrames++;
      for(const p of items)priorDepth.set(p.name,p.signature);
    }
    frames++;if(frame%15===0)console.log(`motion progress ${t.toFixed(2)}/30 s; ${problems.size} intersecting pairs`);
  }
  console.log(`Motion: ${frames} model frames at 60 Hz; ${problems.size} intersecting pairs`);
  for(const [pair,p] of problems)console.log(`  t=${p.t.toFixed(3)} ${pair}: ${p.clearance.toFixed(3)} deep`);
  const solved=A.orderKeys(depthItems,overlaps);depthItems.forEach((item,i)=>item.key=solved.keys[i]);
  const result=A.depthOrder(depthItems,P,{overlaps,solved});
  console.log(`Motion depth: ${depthFrames} poses; ${result.problems.length} incorrect pairs`);
  for(const p of result.problems)console.log(`  ${p.label} ${p.front} × ${p.back}: area ${p.area.toFixed(2)}, cycle=${p.cycle}`);
  return {ok:problems.size===0&&result.problems.length===0,keys:Object.fromEntries(depthItems.map(p=>[p.name,p.key]))};
}
