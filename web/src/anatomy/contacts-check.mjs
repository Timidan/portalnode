import { build } from 'esbuild';
import * as A from './iso/audit.mjs';
import * as G from './iso/lathe.mjs';
import { posedParts } from './motion-check.mjs';
import { dirname,join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here=dirname(fileURLToPath(import.meta.url));
await build({entryPoints:[join(here,'geometry.ts')],outfile:join(here,'.build/contacts-geometry.mjs'),bundle:true,platform:'node',format:'esm'});
await build({stdin:{contents:"export * from './model';export * from './frame';export * from './spring';export * from './mechanics';",resolveDir:here,loader:'ts'},outfile:join(here,'.build/contacts-model.mjs'),bundle:true,platform:'node',format:'esm'});
const {PARTS,MOUNTS,DRIVES}=await import('./.build/contacts-geometry.mjs'),H=await import('./.build/contacts-model.mjs');
const physical=p=>p.physical??p.name,ids=new Set(PARTS.map(physical)),problems=new Set(),fail=s=>{problems.add(s);console.log('FAIL '+s);};
if(ids.size>203)fail(`part count ${ids.size} exceeds 203`);
console.log(`${ids.size} physical parts; ${MOUNTS.length} declared mounts; ${DRIVES.length} drive entries`);
for(const row of MOUNTS)for(const id of [row.part,row.host])if(!ids.has(id))fail(`unknown mount ID ${id}`);
for(const id of ids)if(id!=='stand.plinth'&&!MOUNTS.some(r=>r.part===id))fail(`no mount for ${id}`);
for(const id of ids)if(DRIVES.filter(r=>r.part===id).length!==1)fail(`drive coverage ${id}`);
for(const row of DRIVES){
  if(row.source&&!row.source.startsWith('external:')&&!ids.has(row.source))fail(`unknown driver ${row.source}`);
  if(row.relation==='static'&&PARTS.some(p=>physical(p)===row.part&&(p.pose||p.motion)))fail(`orphan motion ${row.part}`);
  const seen=new Set();let next=row;
  while(next?.source&&!next.source.startsWith('external:')){if(seen.has(next.part)){if(![...seen].some(id=>DRIVES.find(r=>r.part===id)?.relation.includes('elastic')))fail(`drive cycle ${row.part}`);break;}seen.add(next.part);next=DRIVES.find(r=>r.part===next.source);}
}
const axes={left:[0,-1],right:[0,1],back:[1,-1],front:[1,1],bottom:[2,-1],top:[2,1]};
const dot=G.dot3,sub=G.sub3,add=G.add3,mul=G.mul3;
const contactShapes=new WeakMap();
function gradient(shape,p){const h=.001;return G.unit3([0,1,2].map(i=>{const a=[...p],b=[...p];a[i]+=h;b[i]-=h;return A.sdf(shape,a)-A.sdf(shape,b);}));}
function selected(shape,face,p,tol=.06){
  if(shape.contact){if(!contactShapes.has(shape)){const {kind,args,cut}=shape.contact;contactShapes.set(shape,A[kind](shape.F,...args,{cut:cut?.map(c=>({...c,F:shape.F}))}));}shape=contactShapes.get(shape);if(Math.abs(A.sdf(shape,p))>tol)return false;}
  if(face==='bore'&&shape.kind==='prism')face='hole';
  if(face==='upper-profile'||face==='lower-profile')return gradient(shape,p)[2]*(face==='upper-profile'?1:-1)>.4;
  if(face.startsWith('edge:')&&shape.kind==='prism'){const i=Number(face.split(':')[1]),a=shape.poly[i],b=shape.poly[(i+1)%shape.poly.length],q=sub(p,shape.F.o),x=dot(q,shape.F.u),y=dot(q,shape.F.v),dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy)));return Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy)<=tol;}
  const bounds=A.boundsOf(shape);
  if(axes[face]){const [i,s]=axes[face];return Math.abs(p[i]-(s<0?bounds.min[i]:bounds.max[i]))<=tol;}
  if((face==='start'||face==='end')&&shape.F){const ss=shape.kind==='prism'?[shape.s0,shape.s1]:shape.poly.map(p=>p[0]);return Math.abs(dot(sub(p,shape.F.o),shape.F.a)-(face==='start'?Math.min(...ss):Math.max(...ss)))<=tol;}
  if((face==='bore'||face==='outer')&&shape.kind==='body'){const q=sub(p,shape.F.o),r=Math.hypot(dot(q,shape.F.u),dot(q,shape.F.v)),rs=shape.poly.map(p=>p[1]);return Math.abs(r-(face==='outer'?Math.max(...rs):Math.min(...rs)))<=tol;}
  if(face==='hole'){const cuts=[shape.cut??[]].flat();return cuts.some(c=>Math.abs(A.sdf(c,p))<=tol);}
  return face==='profile'||face==='groove'||face==='outer'||face.startsWith('lead:');
}
function samples(shape,face,clip){
  const out=[],put=p=>{if(p.some((v,i)=>v<clip.min[i]-.1||v>clip.max[i]+.1))return;if(Math.abs(A.sdf(shape,p))<.006&&selected(shape,face,p,.008))out.push(p);};
  const at=(F,s,x,y)=>add(add(F.o,mul(F.a,s)),add(mul(F.u,x),mul(F.v,y)));
  if(shape.kind==='prism'){
    const {F,poly,s0,s1}=shape;
    const corners=[];for(const x of [clip.min[0],clip.max[0]])for(const y of [clip.min[1],clip.max[1]])for(const z of [clip.min[2],clip.max[2]])corners.push(sub([x,y,z],F.o));
    const projected=corners.map(p=>dot(p,F.a)),low=Math.max(s0,Math.min(...projected)),high=Math.min(s1,Math.max(...projected)),rows=Math.max(1,Math.ceil((high-low)/.35)),levels=Array.from({length:rows+1},(_,i)=>low+(high-low)*i/rows);
    for(const polygon of [poly,...[shape.cut??[]].flat().filter(c=>c.kind==='prism').map(c=>c.poly)])for(let i=0;i<polygon.length;i++){
      const a=polygon[i],b=polygon[(i+1)%polygon.length],n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.35));
      for(let j=0;j<=n;j++)for(const s of levels)put(at(F,s,a[0]+(b[0]-a[0])*j/n,a[1]+(b[1]-a[1])*j/n));
    }
    if(face!=='hole'){
      const corners=[];for(const x of [clip.min[0],clip.max[0]])for(const y of [clip.min[1],clip.max[1]])for(const z of [clip.min[2],clip.max[2]])corners.push(sub([x,y,z],F.o));
      const xs=corners.map(p=>dot(p,F.u)),ys=corners.map(p=>dot(p,F.v)),loX=Math.max(Math.min(...poly.map(p=>p[0])),Math.min(...xs)),hiX=Math.min(Math.max(...poly.map(p=>p[0])),Math.max(...xs)),loY=Math.max(Math.min(...poly.map(p=>p[1])),Math.min(...ys)),hiY=Math.min(Math.max(...poly.map(p=>p[1])),Math.max(...ys));
      const nx=Math.max(1,Math.ceil((hiX-loX)/.4)),ny=Math.max(1,Math.ceil((hiY-loY)/.4));
      for(let i=0;i<=nx;i++)for(let j=0;j<=ny;j++)for(const s of [s0,s1])put(at(F,s,loX+(hiX-loX)*i/nx,loY+(hiY-loY)*j/ny));
    }
  }else if(shape.kind==='body'){
    for(let i=1;i<shape.poly.length;i++){const a=shape.poly[i-1],b=shape.poly[i],steps=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.35));for(let j=0;j<=steps;j++){const s=a[0]+(b[0]-a[0])*j/steps,r=a[1]+(b[1]-a[1])*j/steps;for(let k=0;k<120;k++)put(at(shape.F,s,r*Math.cos(k*Math.PI/60),r*Math.sin(k*Math.PI/60)));}}
  }else if(shape.kind==='ball'){
    for(let i=0;i<=72;i++){const a=i*Math.PI/72;for(let j=0;j<144;j++){const b=j*Math.PI/72;put(add(shape.o,mul([Math.sin(a)*Math.cos(b),Math.sin(a)*Math.sin(b),Math.cos(a)],shape.r)));}}
  }else if(shape.kind==='tube'){
    const indices=face==='lead:start'?[0]:face==='lead:end'?[shape.points.length-1]:shape.points.map((_,i)=>i);
    for(const i of indices){const p=shape.points[i],direction=sub(shape.points[Math.min(i+1,shape.points.length-1)],shape.points[Math.max(0,i-1)]),F=G.frameAlong(p,direction);for(let j=0;j<24;j++)put(at(F,0,shape.radii[i]*Math.cos(j*Math.PI/12),shape.radii[i]*Math.sin(j*Math.PI/12)));if(face.startsWith('lead:'))put(p);}
  }
  return out;
}
function faceShapes(posed,id,face){
  const split=face.split('@'),name=split.length===2?split[0]:null,surface=split.at(-1);
  let matches=posed.filter(p=>name?(p.base.name===name||p.base.name.startsWith(name+'.')):physical(p.base)===id);
  if(surface.startsWith('lead:'))matches=matches.filter(p=>p.shape.kind==='tube');
  if(surface==='lead:start')matches=matches.slice(0,1);if(surface==='lead:end')matches=matches.slice(-1);
  return matches.map(p=>({shape:p.shape,surface}));
}
function measure(posed,row){
  let best=null;
  for(const {shape:a,surface:af} of faceShapes(posed,row.part,row.partFace))for(const {shape:b,surface:bf} of faceShapes(posed,row.host,row.hostFace)){
    const ba=A.boundsOf(a),bb=A.boundsOf(b),clip={min:ba.min.map((v,i)=>Math.max(v,bb.min[i])-.06),max:ba.max.map((v,i)=>Math.min(v,bb.max[i])+.06)};
    if(clip.min.some((v,i)=>v>clip.max[i]))continue;
    const points=samples(a,af,clip),contacts=[];
    for(const p of points){const gap=A.sdf(b,p);if(gap<-.5||gap>.051)continue;const n=gradient(b,p),q=sub(p,mul(n,gap));if(!selected(b,bf,q)||Math.abs(A.sdf(b,q))>.01)continue;contacts.push({p,gap,n});}
    if(!contacts.length)continue;
    const first=contacts.reduce((a,b)=>Math.abs(a.gap)<Math.abs(b.gap)?a:b),span=contacts.reduce((n,c)=>Math.max(n,Math.hypot(...sub(c.p,first.p))),0);
    const result={gap:first.gap,span,alignment:dot(gradient(a,first.p),first.n),point:first.p,a,b};
    if(!best||result.span>best.span)best=result;
  }
  return best;
}
const times=[0,.5,1.5,2.5,3.5,4.5,5.5,6.5,7,7.5,9.5,10,12.5,14.5,15.5,16,17.5,18.5,20.5,22.5,23,25,27.5,30];
const handoffs=[...new Set([7.5+2*.195800106,9.5,22.5,23,25,27.5])];
// Exact floor-seam times come from the same route and model used to place the coins.
const coinSeams=[];
for(let i=0;i<2;i++)for(const [j,segment] of [H.PAYOUT.magazine,H.PAYOUT.hopper,H.PAYOUT.common,H.PAYOUT.branches[i]].entries()){
  const x=segment[1],{slope}=H.floorAt(segment,x),centre=x-5.3*slope/Math.hypot(1,slope);
  let lo=17.5,hi=20.5;for(let n=0;n<45;n++){const t=(lo+hi)/2;if(H.coinAt(H.modelAt(t),i).p[0]<centre)lo=t;else hi=t;}
  const t=(lo+hi)/2,hosts=['punch.coin-magazine','hopper.floor','trough.common.floor',`chute.${i}.floor`,`tray.${i}.floor`];
  coinSeams.push({i,t,hosts:hosts.slice(j,j+2)});handoffs.push(t);
}
const fixedMeasurements=new Map();
let tripLo=20,tripHi=22.5;for(let i=0;i<45;i++){const t=(tripLo+tripHi)/2;if(H.carriageAt(H.modelAt(t))[0]>-87)tripLo=t;else tripHi=t;}handoffs.push((tripLo+tripHi)/2);
let minEnd=Infinity,minSide=Infinity,maxAngle=-Infinity,minAngle=Infinity;
for(const t of [...new Set([...times,...handoffs])].sort((a,b)=>a-b)){
  console.log(`\nt=${t.toFixed(9)}`);const m=H.modelAt(t),posed=posedParts(PARTS,m,H),byName=new Map(posed.map(p=>[p.base.name,p.shape])),connected=new Set(['stand.plinth']),verified=[];
  for(const row of MOUNTS){
    const active=t>=row.active[0]-1e-8&&t<=row.active[1]+1e-8&&(row.kind!=='ramp'||(H.carriageAt(m)[0]<=-87+1e-8&&t<=22.5))&&(row.kind!=='coin'||H.coinAt(m,Number(row.part.at(-1))).host===row.host||coinSeams.some(s=>s.i===Number(row.part.at(-1))&&Math.abs(t-s.t)<1e-8&&s.hosts.includes(row.host)));
    if(!active){console.log(`${row.part} -> ${row.host}: inactive handoff [${row.active.join(',')}]`);continue;}
    const moving=PARTS.some(p=>(physical(p)===row.part||physical(p)===row.host)&&(p.pose||p.motion||p.name.startsWith('spring.')));
    const result=!moving&&fixedMeasurements.has(row)?fixedMeasurements.get(row):measure(posed,row);if(!moving)fixedMeasurements.set(row,result);
    if(!result){fail(`t=${t.toFixed(6)} ${row.part} ${row.partFace} -> ${row.host} ${row.hostFace}: no finite contact`);continue;}
    verified.push(row);
    if(!['tangent','spring','cam','coin'].includes(row.kind)&&result.span<.08)fail(`t=${t.toFixed(6)} ${row.part} -> ${row.host}: contact span ${result.span}`);
    let joint='';
    if(row.kind==='journal'){
      const a=result.a,b=result.b,axis=a.F.a;
      const range=s=>{const levels=s.kind==='prism'?[s.s0,s.s1]:s.poly.map(p=>p[0]),v=levels.map(x=>dot(add(s.F.o,mul(s.F.a,x)),axis));return [Math.min(...v),Math.max(...v)];};
      const ca=s=>{s=contactShapes.get(s)??s;if(s.kind!=='prism')return s.F.o;const cuts=[s.cut??[]].flat().filter(c=>c.kind==='prism').sort((a,b)=>Math.abs(A.sdf(a,result.point))-Math.abs(A.sdf(b,result.point))),c=cuts[0];if(!c)return s.F.o;const centre=c.poly.reduce((p,q)=>[p[0]+q[0]/c.poly.length,p[1]+q[1]/c.poly.length],[0,0]);return add(c.F.o,add(mul(c.F.u,centre[0]),mul(c.F.v,centre[1])));};
      const ar=range(a),br=range(b),engagement=Math.min(ar[1],br[1])-Math.max(ar[0],br[0]),middle=(Math.min(ar[1],br[1])+Math.max(ar[0],br[0]))/2,section=s=>{const c=ca(s);return add(c,mul(s.F.a,(middle-dot(c,axis))/dot(s.F.a,axis)));},alignment=Math.hypot(...sub(section(a),section(b))),skew=Math.sqrt(Math.max(0,1-dot(a.F.a,b.F.a)**2))*engagement/2;
      if(engagement<=.05||alignment+skew>.05)fail(`journal ${row.part} -> ${row.host} at ${t}: engagement=${engagement} lateral=${alignment} skew=${skew}`);
      joint=` axial=${engagement.toFixed(4)} lateral=${alignment.toFixed(5)} skew=${skew.toFixed(5)}`;
    }
    console.log(`${row.part} [${row.partFace}] -> ${row.host} [${row.hostFace}]: gap=${result.gap.toFixed(5)} span=${result.span.toFixed(3)} normalDot=${result.alignment.toFixed(3)}${joint}`);
  }
  for(let round=0;round<ids.size;round++)for(const row of verified)if(connected.has(row.host))connected.add(row.part);
  for(const id of ids)if(!(id==='rack.expired-card'&&t>=29.3)&&!connected.has(id))fail(`t=${t.toFixed(6)} active mount graph disconnected: ${id}`);
  for(let i=0;i<3;i++){
    const a=byName.get(H.TRAIN[i].name),b=byName.get(H.TRAIN[i+1].name),alpha=Math.atan2(b.F.o[2]-a.F.o[2],b.F.o[0]-a.F.o[0]);
    const angle=s=>Math.atan2(s.F.u[2],s.F.u[0]),q=(alpha-angle(a)+alpha+Math.PI-angle(b))*H.TEETH/(2*Math.PI)-.5,residual=q-Math.round(q),distance=Math.hypot(b.F.o[0]-a.F.o[0],b.F.o[2]-a.F.o[2])-2*H.PITCH,parallel=1-Math.abs(dot(a.F.a,b.F.a)),face=Math.min(a.F.o[1]+a.s1,b.F.o[1]+b.s1)-Math.max(a.F.o[1]+a.s0,b.F.o[1]+b.s0);
    if(Math.abs(distance)>.05||Math.abs(residual)>.01||parallel>1e-8||face<=0)fail(`mesh ${i} at ${t}`);
    console.log(`mesh ${i}: centreDelta=${distance.toFixed(6)} phaseResidual=${residual.toFixed(6)} parallelError=${parallel.toFixed(6)} faceOverlap=${face.toFixed(3)}`);
  }
  for(const [name,aName,bName,length] of [['keeper.link','keeper.crank.pin','keeper.dog.pin',17],['rack.release-link','rack.release-link.eye.0','rack.release-link.eye.1',Math.hypot(70.5,8.5,19)],['punch.coin-gate.link','punch.coin-gate.link.eye.0','punch.coin-gate.link.eye.1',Math.hypot(34,96.5,10)],['rack.expiry-link','rack.expiry-link.eye.0','rack.expiry-link.eye.1',Math.hypot(81,14.5,133)]]){
    const a=byName.get(aName),b=byName.get(bName),delta=sub(a.F.o,b.F.o),distance=name==='keeper.link'?Math.hypot(delta[0],delta[2]):Math.hypot(...delta),error=distance-length;
    if(Math.abs(error)>.001)fail(`link length ${name} at ${t}: ${error}`);console.log(`${name}: length=${distance.toFixed(5)} error=${error.toFixed(6)}`);
  }
  for(const [name,ratio] of [['tape.feed-roll',-1],['tape.pressure-roll',1],['tape.spool.core',-4/11],['tape.spool.flange',-4/11]]){
    const F=byName.get(name).F,angle=Math.atan2(F.u[2],F.u[0]),difference=angle-ratio*m.shift*2*Math.PI,error=Math.atan2(Math.sin(difference),Math.cos(difference));
    if(Math.abs(error)>1e-6)fail(`tape drive ${name} at ${t}`);console.log(`${name}: tape-angle residual=${error.toFixed(6)}`);
  }
  const feed=byName.get('tape.feed-roll'),pressure=byName.get('tape.pressure-roll'),radius=s=>Math.max(...s.poly.map(p=>s.kind==='prism'?Math.hypot(...p):p[1])),nip=pressure.F.o[2]-feed.F.o[2]-radius(feed)-radius(pressure);
  if(Math.abs(nip-.3)>1e-6)fail(`nip at ${t}: ${nip}`);console.log(`tape nip=${nip.toFixed(4)}; advance=${(m.tape*H.TAPE_PITCH).toFixed(4)}`);
  const yoke=byName.get('carriage.yoke'),pin=byName.get('carriage.pin'),local=sub(pin.F.o,yoke.F.o),u=dot(local,yoke.F.u),v=dot(local,yoke.F.v),r=Math.max(...pin.poly.map(p=>p[1])),slot=(yoke.contact?.cut??yoke.cut)[0].poly;
  const xs=slot.map(p=>p[0]),zs=slot.map(p=>p[1]),endGap=Math.min(v-Math.min(...zs),Math.max(...zs)-v)-r,sideGap=Math.min(u-Math.min(...xs),Math.max(...xs)-u)-r;
  minEnd=Math.min(minEnd,endGap);minSide=Math.min(minSide,sideGap);const lever=byName.get('carriage.lever'),angle=Math.atan2(lever.F.u[2],lever.F.u[0]);maxAngle=Math.max(maxAngle,angle);minAngle=Math.min(minAngle,angle);
  if(endGap<=.05||sideGap<-.001)fail(`pin outside yoke at ${t}: end=${endGap} side=${sideGap}`);
  console.log(`carriage: lever=${Math.hypot(pin.F.o[0]-lever.F.o[0],pin.F.o[2]-lever.F.o[2]).toFixed(3)} slot=${(Math.max(...zs)-Math.min(...zs)).toFixed(3)} endGap=${endGap.toFixed(4)} driveSideGap=${sideGap.toFixed(4)}`);
}
for(let i=0;i<4;i++){
  let rate=0,perFrame=0;
  for(let n=0;n<1800;n++){const a=H.gearAngle(i,H.modelAt(n/60)),b=H.gearAngle(i,H.modelAt((n+1)/60)),p=Math.abs(b-a)*H.TEETH/(2*Math.PI);rate=Math.max(rate,p*60);perFrame=Math.max(perFrame,p);}
  rate=Math.max(rate,H.TEETH*1.5/7);
  if(rate>15||perFrame>=.25)fail(`gear speed ${H.TRAIN[i].name}`);
  console.log(`${H.TRAIN[i].name}: max ${rate.toFixed(6)} teeth/s; max ${perFrame.toFixed(6)} tooth pitches/60Hz frame`);
}
console.log(`carriage lever ${H.LEVER_LENGTH}; swing ${((maxAngle-minAngle)*180/Math.PI).toFixed(3)} deg; minimum yoke end gap ${minEnd.toFixed(4)}; side gap ${minSide.toFixed(4)}`);
console.log(`contacts: ${problems.size} problems`);process.exitCode=problems.size?1:0;
