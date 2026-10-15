import * as A from './iso/audit.mjs';
import * as G from './iso/lathe.mjs';
import assert from 'node:assert/strict';

/** Checks the actual model path, including reverse scrubs, using the kit's shapes. */
export async function checkMotion(parts,P,R){
  const {modelAt,offsets,coinPaths,springAt,CLOCK,ERA_HOURS}=await import('./.build/live-model.mjs');
  assert.equal(ERA_HOURS,CLOCK.sessionsPerEra*CLOCK.sessionHours);
  assert.deepEqual([0,9,14,17,23,27].map(t=>modelAt(t).state),['open','unpunched','armed','punched','filed','expired']);
  assert.equal(modelAt(15.99).claimMarked,false);assert.equal(modelAt(16).claimMarked,true);
  assert.equal(modelAt(27).oldCardAge,CLOCK.historyDepth+1);
  const base=parts.filter(p=>p.shape.kind!=='tube').map(p=>{
    const {kind,args,meta={}}=p.shape;return {...A[kind](...args,{name:p.name,...meta}),part:p};
  });
  const keys=Object.fromEntries(R.items.map(p=>[p.name,p.key])),V=A.cameraBasis(P).V;
  const depthItems=parts.map(p=>({name:p.name,key:keys[p.name],move:V,ride:p.name}));
  const overlaps={...R.settled.overlaps,pairs:[...R.settled.overlaps.pairs],states:[0]};
  const problems=new Map();let frames=0,depthFrames=0;
  for(let frame=0;frame<=1800;frame++){
    const t=frame/60,m=modelAt(t),off=offsets(m);
    const solids=base.filter(s=>!s.name.startsWith('coin.')||t>=17.3+Number(s.name.at(-1))*.6).filter(s=>s.name!=='punch.card'||t>=7.1).map(s=>{
      let shape=s,move=s.part.motion&&off[s.part.motion]||[0,0,0];
      if(s.name.startsWith('coin.')){
        const i=Number(s.name.at(-1)),coin=coinPaths(m,i),origin=s.F.o;
        shape=A.disc({...coin.F,o:origin},0,1.3,5.3,{name:s.name});move=G.sub3(coin.F.o,origin);
      }
      if(s.name==='keeper.key-bow'){
        const a=m.arm*Math.PI/2,c=[40+6*Math.sin(a),55,19-6*Math.cos(a)];move=G.sub3(c,s.F.o);
      }
      if(s.name==='keeper.key-bit'){
        const a=m.arm*Math.PI/2,centre=[40+Math.cos(a)+2*Math.sin(a),51,19+Math.sin(a)-2*Math.cos(a)];
        shape=A.prism(G.frameOf([41,51,17],[0,1,0],[Math.cos(a),0,Math.sin(a)],[-Math.sin(a),0,Math.cos(a)]),[[-2,-1],[2,-1],[2,1],[-2,1]],0,4,{name:s.name});move=G.sub3(centre,[41,51,17]);
      }
      return {...shape,move,piece:'pose'};
    });
    for(const issue of A.solidClearances(solids,{state:1})){
      const key=[issue.tube,issue.other].sort().join(' × ');
      if(!problems.has(key)||issue.clearance<problems.get(key).clearance)problems.set(key,{...issue,t});
    }
    if(t>=15&&t<=18&&frame%4===0){
      const coilState=springAt(5.35*m.punch);
      const coil=A.tube(coilState.points,.34,{name:'return-spring',tips:[coilState.points[0],coilState.points.at(-1)],tipAxes:[G.unit3(G.sub3(coilState.points[1],coilState.points[0])),G.unit3(G.sub3(coilState.points.at(-1),coilState.points.at(-2)))],tipRims:[.34,.34]});
      for(const issue of A.clearances([coil],solids.map(s=>A.moved(s,s.move)),{only:'through'})){
        const key=['return-spring',issue.other].join(' × ');
        if(!problems.has(key))problems.set(key,{...issue,t});
      }
    }
    if(frame%4===0){
      const byName=new Map(solids.map(s=>[s.name,{name:s.name,key:keys[s.name]+G.dot3(s.move,V),shapes:[A.moved(s,s.move)],dynamic:Boolean(parts.find(p=>p.name===s.name).motion)}]));
      for(const i of [0,1]){const item=byName.get(`coin.${i}`);if(item){const coin=coinPaths(m,i),p=parts.find(p=>p.name===item.name);item.key=keys[item.name]+G.dot3(G.sub3(G.add3(coin.F.o,G.mul3(coin.F.a,.65)),p.at),V);}}
      springAt(5.35*m.punch).pieces.forEach((p,i)=>{const base=parts.find(part=>part.name===`spring.${i}`);byName.set(`spring.${i}`,{name:`spring.${i}`,key:keys[`spring.${i}`]+G.dot3(G.sub3(p.mid,base.at),V),shapes:[A.tube(p.points,p.radii)],dynamic:true});});
      const items=parts.map(p=>byName.get(p.name)??{name:p.name,key:keys[p.name],shapes:[],dynamic:true});
      const state={label:`t=${t.toFixed(3)}`,shares:Object.fromEntries(items.map(p=>[p.name,p.key-keys[p.name]]))};
      const pose=A.overlapsOf(items,P,{skip:(a,b)=>!a.dynamic&&!b.dynamic});
      overlaps.pairs.push(...pose.pairs.map(pair=>({...pair,state})));overlaps.states.push(state);
      depthFrames++;
    }
    frames++;
  }
  console.log(`Motion: ${frames} model frames at 60 Hz; ${problems.size} intersecting pairs`);
  for(const [pair,p] of problems)console.log(`  t=${p.t.toFixed(3)} ${pair}: ${p.clearance.toFixed(3)} deep`);
  const solved=A.orderKeys(depthItems,overlaps);
  depthItems.forEach((item,i)=>item.key=solved.keys[i]);
  const result=A.depthOrder(depthItems,P,{overlaps,solved});
  console.log(`Motion depth: ${depthFrames} poses; ${result.problems.length} incorrect pairs`);
  for(const p of result.problems.slice(0,40))console.log(`  ${p.label} ${p.front} × ${p.back}: area ${p.area.toFixed(2)}, cycle=${p.cycle}`);
  return {ok:problems.size===0&&result.problems.length===0,keys:Object.fromEntries(depthItems.map(p=>[p.name,p.key]))};
}
