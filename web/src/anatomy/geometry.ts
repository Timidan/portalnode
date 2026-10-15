import * as k from './iso/iso-kit';
import * as G from './iso/lathe.mjs';
import { BASE, P, at, front, upright, rect, path3 } from './view';
import { springAt } from './spring';
import { offsets } from './frame';
import * as T from './iso/tube.mjs';
import { ShapeUtils, Vector2 } from 'three';
import { CLOCK, DIAL_TICKS, modelAt, type ClockModel } from './model';
import { TRAIN, gearAngle, turnFrame, toothed, bored, dialFrame, carriageAt, carriageStation, leverAt, railStart, railEnd, railU, railN, railLength, LEVER, LEVER_LENGTH, PAYOUT, floorProfile, floorAt, coinAt, serviceAngle, camOutline, camSectors, annularSectors, camLaws, powerSpring, resetAt, cutLoops, band, bellShift, tripPoints, tripRadius, tripRamp, capsule, keeperAt, rockerAt, rackGateAt, coinGateAt, expiryAt, latchRoutes, coinLatchAt, rotateBetween, barrelCatchAt, barrelLatchPoints, holdPawlPoints, holdPawlTip, circle } from './mechanics';
declare module './iso/lathe.mjs' {
  export function lathe(profile:number[][],F:Frame,P:k.Projection,options?:object):k.SolidPaths;
  export function outlineOf(profile:number[][],F:Frame,P:k.Projection,options?:object):{fill:string;outline:string};
  export function bandsOf(profile:number[][],cuts:number[],F:Frame,P:k.Projection,options?:object):{bands:{s0:number;s1:number;paths:k.SolidPaths}[];sidesOf:(from:number,to:number,options?:object)=>{d:string}};
}
declare module './iso/tube.mjs' { export function tubePieces(points:k.Point3[],radius:(t:number)=>number,P:k.Projection,options?:object):TubePiece[]; }
export interface Shape { kind: 'slab'|'prism'|'disc'|'ring'|'solid'|'ball'|'slide'|'tube'; args: unknown[]; meta?: Record<string,unknown> }
export interface Part { name:string; paths:k.SolidPaths; shape:Shape; at:k.Point3; tone:k.Tone; detail:string; lit?:boolean; motion?:string; clip?:string; raw?:string; physical?:string; pose?:(m:ClockModel)=>Part; layout?:k.Point3 }
const line = (d:string,tone:k.LineTone='lo',free?:boolean) => k.lineSvg(d,{tone,free});
const dots = (points:k.Point3[],size=.5) => k.dotsSvg(points.map(at),{size,tone:'mid'});
const ring = (f:G.Frame,s:number,r:number,tone:k.LineTone='lo') => line(G.circleOf(f,s,r,P),tone);

// Closed meridians paint the bore walls without an opaque hull across the opening.
function ringPaths(s0:number,s1:number,ri:number,ro:number,F:G.Frame) {
  const meridian=[[s0,ri],[s0,ro],[s1,ro],[s1,ri],[s0,ri]];
  return {...G.lathe(meridian,F,P,{fill:'faces'}),outline:G.outlineOf(meridian,F,P,{hole:[G.dot3(F.a,G.viewOf(P))>0?s1:s0,ri]}).outline};
}

/** Concave face prism: teeth and folded sheet profiles retain their real outline. */
function prismPaths(F:G.Frame, poly:k.Flat[], s0:number,s1:number):k.SolidPaths {
  const area=poly.reduce((n,[x,y],i)=>{const b=poly[(i+1)%poly.length];return n+x*b[1]-b[0]*y;},0);
  const q=area>0?poly:[...poly].reverse(), V=G.viewOf(P), n=q.length;
  const point=(s:number,[x,y]:k.Flat)=>G.add3(G.add3(G.add3(F.o,G.mul3(F.a,s)),G.mul3(F.u,x)),G.mul3(F.v,y));
  const low=q.map(p=>at(point(s0,p))),high=q.map(p=>at(point(s1,p)));
  const near=G.dot3(F.a,V)>0?high:low,far=near===high?low:high;
  const buckets=Array.from({length:5},()=>[] as string[]),outline:string[]=[],creases:string[]=[];
  const edge=(a:k.Flat,b:k.Flat)=>`${a[0]},${a[1]}|${b[0]},${b[1]}`,edges=new Set(q.map((a,i)=>edge(a,q[(i+1)%n])));
  const internal=new Set((poly as k.Flat[] & {interior?:number[]}).interior??[]);
  const real=q.map((a,i)=>!edges.has(edge(q[(i+1)%n],a))&&!internal.has(i));
  const seen=q.map(([x,y],i)=>{const b=q[(i+1)%n];return real[i]&&G.dot3(G.unit3(G.add3(G.mul3(F.u,b[1]-y),G.mul3(F.v,x-b[0]))),V)>0;});
  const fill=[k.pathOf(near,true)];
  buckets[G.toneOf(near===high?F.a:G.mul3(F.a,-1),P)].push(k.pathOf(near,true));
  for(let i=0;i<n;i++){
    if(!real[i])continue;
    const j=(i+1)%n,b=q[j],a=q[i];
    const face=k.pathOf([near[i],near[j],far[j],far[i]],true);
    if(seen[i]){fill.push(face);buckets[G.toneOf(G.unit3(G.add3(G.mul3(F.u,b[1]-a[1]),G.mul3(F.v,a[0]-b[0]))),P)].push(face);creases.push(k.pathOf([near[i],near[j]]));}
    outline.push(k.pathOf(seen[i]?[far[i],far[j]]:[near[i],near[j]]));
    if(seen[i]!==seen[(i+n-1)%n])outline.push(k.pathOf([near[i],far[i]]));
  }
  return {fill:fill.join(''),outline:outline.join(''),crease:creases.join(''),top:buckets[4].join(''),shades:buckets.slice(0,4).map(a=>a.join('')) as [string,string,string,string]};
}

function prismShape(F:G.Frame,poly:k.Flat[],s0:number,s1:number):Shape {
  const cut=poly as k.Flat[] & {outline?:k.Flat[];voids?:k.Flat[][]};
  const holes=cut.voids?.map(hole=>({kind:'prism',F,poly:hole,s0:s0-1,s1:s1+1}));
  return {kind:'prism',args:[F,cut.outline??poly,s0,s1],...(holes?.length?{meta:cut.outline?{cut:holes}:{contact:{kind:'prism',args:[poly,s0,s1],cut:holes}}}:{})};
}

/** Small sectors leave both sides of a bored joint independently sortable. */
function jointPaint(part:Part):Part[] {
  const ring=part.shape.kind==='ring',args=part.shape.args as [G.Frame,k.Flat[]|number,number,number,number];
  const F=args[0],s0=ring?Number(args[1]):args[2],s1=ring?args[2]:args[3];
  const outer=ring?circle(args[4]):args[1] as k.Flat[],holes=ring?[circle(args[3])]:((part.shape.meta?.cut??[]) as {poly:k.Flat[]}[]).map(c=>c.poly);
  const loops=[outer,...holes].map(loop=>loop.map(([x,y])=>new Vector2(x,y))),faces=ShapeUtils.triangulateShape(loops[0],loops.slice(1)),points=loops.flat().map(p=>[p.x,p.y] as k.Flat);
  const boundary=new Set(loops.flatMap(loop=>loop.map((p,i)=>{const q=loop[(i+1)%loop.length];return `${p.x},${p.y}|${q.x},${q.y}`;})));
  const turnLimit=holes.some(h=>h.length>4)&&!part.name.startsWith('train.plate.')?Math.PI/4:0;
  const smallTurn=(ids:number[])=>ids.reduce((sum,n,i)=>{const a=points[n],b=points[ids[(i+1)%ids.length]],c=points[ids[(i+2)%ids.length]],u=[b[0]-a[0],b[1]-a[1]],v=[c[0]-b[0],c[1]-b[1]];return sum+Math.min(0,Math.atan2(u[0]*v[1]-u[1]*v[0],u[0]*v[0]+u[1]*v[1]));},0)>=-turnLimit-1e-8;
  for(let changed=true;changed;){changed=false;
    merge:for(let i=0;i<faces.length;i++)for(let j=i+1;j<faces.length;j++){
      const a=faces[i],b=faces[j];
      for(let u=0;u<a.length;u++){const v=b.findIndex((n,k)=>n===a[(u+1)%a.length]&&b[(k+1)%b.length]===a[u]);if(v<0)continue;
        const ar=[...a.slice(u+1),...a.slice(0,u+1)],br=[...b.slice(v+1),...b.slice(0,v+1)],merged=[...ar,...br.slice(1,-1)];
        if(smallTurn(merged)){faces[i]=merged;faces.splice(j,1);changed=true;break merge;}
      }
    }
  }
  const area=(poly:k.Flat[])=>Math.abs(poly.reduce((n,p,i)=>{const q=poly[(i+1)%poly.length];return n+p[0]*q[1]-q[0]*p[1];},0))/2;
  if(Math.abs(faces.reduce((n,f)=>n+area(f.map(i=>points[i])),0)-area(outer)+holes.reduce((n,h)=>n+area(h),0))>1e-6)throw new Error(`Paint split changed ${part.name}`);
  let lastTime=-1,lastPose=part;
  const source=(m:ClockModel)=>{if(m.t!==lastTime){lastTime=m.t;lastPose=part.pose!(m);}return lastPose;};
  return faces.map((ids,index)=>{
    const poly=ids.map(i=>points[i]),name=index?`${part.name}.face.${index}`:part.name;
    Object.assign(poly,{interior:poly.flatMap((a,i)=>{const b=poly[(i+1)%poly.length],edge=`${a[0]},${a[1]}|${b[0]},${b[1]}`,back=`${b[0]},${b[1]}|${a[0]},${a[1]}`;return boundary.has(edge)||boundary.has(back)?[]:[i];})});
    const pose=(p:Part,m?:ClockModel):Part=>{
      const a=p.shape.args as typeof args,frame=a[0],lo=ring?Number(a[1]):a[2],hi=ring?a[2]:a[3],off=m&&part.pose&&part.motion?offsets(m)[part.motion]:undefined,drawFrame=off?{...frame,o:G.sub3(frame.o,off)}:frame,paths=prismPaths(drawFrame,poly,lo,hi),centre=poly.reduce((v,p)=>[v[0]+p[0]/poly.length,v[1]+p[1]/poly.length],[0,0]);
      const clip=`surface-${name}`,detail=p.detail?`<clipPath id="${clip}"><path d="${paths.fill}"/></clipPath><g clip-path="url(#${clip})">${p.detail}</g>`:'';
      const meta={contact:{kind:p.shape.kind,args:p.shape.args.slice(1),cut:p.shape.meta?.cut}};
      return {...p,name,paths,detail,physical:part.physical??part.name,shape:{kind:'prism',args:[frame,poly,lo,hi],meta},at:G.add3(G.add3(frame.o,G.mul3(frame.a,(lo+hi)/2)),G.add3(G.mul3(frame.u,centre[0]),G.mul3(frame.v,centre[1])))};
    };
    const result=pose(part);if(part.pose)result.pose=m=>pose(source(m),m);return result;
  });
}

export function makeGeometry() {
  const parts:Part[]=[];
  const add=(name:string,paths:k.SolidPaths,shape:Shape,at:k.Point3,tone:k.Tone='mid',detail='',motion?:string,lit=false)=>{const p:Part={name,paths,shape,at,tone,detail,motion,lit};parts.push(p);return p;};
  const slab=(name:string,plan:k.Plan,z:number,h:number,tone:k.Tone='mid',detail='',motion?:string)=>add(name,k.slabOf(plan,z,h,P,6,Math.min(.8,h/3)),{kind:'slab',args:[plan,z,h]},[plan.x+plan.w/2,plan.y+plan.d/2,z+h/2],tone,detail,motion);
  const box=(name:string,x:number,y:number,z:number,w:number,d:number,h:number,tone:k.Tone='mid',detail='',motion?:string)=>slab(name,{x,y,w,d,r:Math.min(.7,w/5,d/5)},z,h,tone,detail,motion);
  const prism=(name:string,F:G.Frame,poly:k.Flat[],s0:number,s1:number,tone:k.Tone='mid',detail='',motion?:string)=>add(name,prismPaths(F,poly,s0,s1),prismShape(F,poly,s0,s1),G.add3(F.o,G.mul3(F.a,(s0+s1)/2)),tone,detail,motion);
  const disc=(name:string,F:G.Frame,s0:number,s1:number,r:number,tone:k.Tone='mid',detail='',motion?:string)=>add(name,G.disc(s0,s1,r,F,P,{bevel:Math.min(.4,(s1-s0)/3)}),{kind:'disc',args:[F,s0,s1,r]},G.add3(F.o,G.mul3(F.a,(s0+s1)/2)),tone,detail,motion);
  const annulus=(name:string,F:G.Frame,s0:number,s1:number,ri:number,ro:number,tone:k.Tone='mid',detail='',motion?:string)=>add(name,ringPaths(s0,s1,ri,ro,F),{kind:'ring',args:[F,s0,s1,ri,ro]},G.add3(F.o,G.mul3(F.a,(s0+s1)/2)),tone,detail,motion);
  const shaft=(name:string,F:G.Frame,length:number,r:number,cuts:number[],tone:k.Tone='mid',motion?:string,physical=name)=>{
    const bands=G.bandsOf([[0,r],[length,r]],cuts,F,P),near=G.dot3(F.a,G.viewOf(P))>0?length:0;
    bands.bands.forEach(({s0,s1,paths},i)=>{
      paths.outline=bands.sidesOf(s0,s1).d+(s0===near||s1===near?G.circleOf(F,near,r,P):'');
      add(i?`${name}.section.${i}`:name,paths,{kind:'disc',args:[F,s0,s1,r]},G.add3(F.o,G.mul3(F.a,(s0+s1)/2)),tone,'',motion).physical=physical;
    });
  };
  const turnedRing=(name:string,F:G.Frame,s0:number,s1:number,ri:number,ro:number,angle:(m:ClockModel)=>number,ribs=false)=>{
    const hole=circle(ri),polys=annularSectors(hole,circle(ro));
    for(const [i,poly] of polys.entries()){
      Object.assign(poly,{voids:[hole]});
      const pose=(m:ClockModel)=>{
        const frame=turnFrame(...F.o,angle(m)),a=(i+.5)*Math.PI/4,radial=G.add3(G.mul3(frame.u,Math.cos(a)),G.mul3(frame.v,Math.sin(a)));
        const point=(s:number,r:number)=>G.add3(G.add3(F.o,G.mul3(F.a,s)),G.mul3(radial,r));
        const detail=ribs?(G.dot3(radial,G.viewOf(P))>0?line(path3([point(s0,ro),point(s1,ro)]),'lo'):''):dots([point(s1,ro*.65)]);
        return {paths:prismPaths(frame,poly,s0,s1),shape:prismShape(frame,poly,s0,s1),at:G.add3(F.o,G.mul3(F.a,(s0+s1)/2)),detail};
      };
      const initial=pose(modelAt(0)),part=add(i?`${name}.sector.${i}`:name,initial.paths,initial.shape,initial.at,'mid',initial.detail,'gear');part.physical=name;part.pose=m=>({...part,...pose(m)});
    }
  };
  const screws=(plan:k.Plan,z:number)=>line(k.corners(plan,5).map(([x,y])=>k.ring(x,y,1.7,z,P,20)).join(''),'lo')+dots(k.corners(plan,5).map(([x,y])=>[x,y,z]));
  const faceRules=(x:number,y:number,z:number,w:number,rows=4)=>line(Array.from({length:rows},(_,i)=>path3([[x,y,z-i*4],[x+w-(i%2)*7,y,z-i*4]])).join(''),'lo',true);

  // Plinth and fitted casting. The two missing walls are the permanent cutaway.
  for(const [i,[x,y]] of k.corners(BASE,24).entries()){
    const F=upright(x,y,-18),profile=[[0,8],[3,8],[3,6],[6,6]];
    add(`stand.foot.${i}`,G.solidOf(profile,F,P),{kind:'solid',args:[F,profile]},[x,y,-15],'lo');
  }
  slab('stand.plinth',BASE,-12,10,'lo',line(k.sideSeam(BASE,-6,P,6),'faint')+screws(BASE,-2));
  const deck=k.insetPlan(BASE,3);
  slab('stand.deck',deck,-2,2,'lo',line(k.planOutline(k.insetPlan(deck,5),0,P),'faint'));
  const arch:k.Flat[]=[[-93,0],[83,0],[83,172],...Array.from({length:65},(_,i):k.Flat=>[-5+88*Math.cos(i/64*Math.PI),172+88*Math.sin(i/64*Math.PI)])];
  prism('case.back',front(0,-30,0),arch,0,5,'mid',dots([[-86,-25,14],[50,-25,14],[-86,-25,184],[50,-25,184]]));
  const cheekFrame=G.frameOf([-93,0,0],[1,0,0],[0,1,0],[0,0,1]),ys=[-109,-94,-59,-56,39],zs=[0,137,151.3,154.3,188];
  const cheekOutline:k.Flat[]=[[-109,0],[39,0],[39,137],[-56,137],[-56,154.3],[-94,154.3],[-94,188],[-109,188]];
  const cheekCell=(a:number,b:number)=>a>=0&&a<4&&b>=0&&b<4&&(a===0||b===0||(a===2&&b<=2)||(a===1&&b===2));
  for(let y=0;y<4;y++)for(let z=0;z<4;z++){
    if(!cheekCell(y,z))continue;
    const poly=rect(ys[y],zs[z],ys[y+1],zs[z+1]);
    Object.assign(poly,{interior:[[y,z-1],[y+1,z],[y,z+1],[y-1,z]].flatMap(([a,b],i)=>cheekCell(a,b)?[i]:[])});
    const p=prism(y||z?`case.cheek.panel.${y}.${z}`:'case.cheek',cheekFrame,poly,0,6,'mid');p.physical='case.cheek';
    p.shape.meta={contact:{kind:'prism',args:[cheekOutline,0,6],cut:[{kind:'prism',F:cheekFrame,poly:rect(-94,137,-59,151.3),s0:-1,s1:7}]}};
  }
  box('case.cut-sill',51,-109,0,6,145,32,'mid',dots([[57,8,26],[57,28,26]]));
  box('case.front-sill',-87,30,0,138,6,30,'mid',faceRules(-79,36,21,28,2));
  box('case.bed',-87,-109,30,138,139,4,'lo',screws({x:-87,y:-109,w:138,d:139,r:0},34));
  const nameplate={x:-137,y:100,w:36,d:15,r:1.5};
  slab('case.maker-plate',nameplate,0,.7,'lo',line(k.planOutline(k.insetPlan(nameplate,1.7),.7,P),'faint')+k.faceTextSvg(k.topMatrix([-119,109],.7,P),'PORTALNODE',{size:2.7,anchor:'middle',tone:'lo'})+dots([[-134,107.5,.7],[-104,107.5,.7]]));

  // The dial has a real open centre; the lower train remains in the cutaway.
  const D=dialFrame;
  disc('clock.standoff.left',front(-36,-25,220),0,8,4,'lo');
  disc('clock.standoff.right',front(52,-25,220),0,8,4,'lo');
  const halfRing=(inner:number,outer:number):k.Flat[]=>[...Array.from({length:97},(_,i):k.Flat=>[outer*Math.cos(i/96*Math.PI),outer*Math.sin(i/96*Math.PI)]),...Array.from({length:97},(_,i):k.Flat=>[inner*Math.cos((96-i)/96*Math.PI),inner*Math.sin((96-i)/96*Math.PI)])];
  prism('clock.drum',D,halfRing(64,69),0,47,'mid');
  prism('clock.bezel',D,halfRing(54,69),47,53,'hi');
  annulus('clock.face',D,53,54.5,50,54.5,'hi',ring(D,54.5,54,'mid')+ring(D,54.5,50,'faint'));
  const ticks:string[]=[],major:string[]=[],sessions:string[]=[];
  for(let i=0;i<DIAL_TICKS;i++){
    const a=i/DIAL_TICKS*Math.PI*2,isHour=i%5===0,isSession=i%(DIAL_TICKS/CLOCK.sessionsPerEra)===0;
    const r0=isSession?50:isHour?51:52.5;
    const point=(r:number):k.Point3=>[8+Math.sin(a)*r,37.5,172+Math.cos(a)*r];
    (isSession?sessions:isHour?major:ticks).push(path3([point(r0),point(54)]));
  }
  parts.at(-1)!.detail+=line(ticks.join(''),'lo')+line(major.join(''),'mid')+line(sessions.join(''),'hi');
  annulus('clock.hub',D,54.5,56.9,2.2,3.2,'hi');
  const handPoly=bored([[-.6,-7],[.6,-7],[.6,-3.14],...Array.from({length:33},(_,i):k.Flat=>{const a=(-79.2+i/32*158.4)*Math.PI/180;return [3.2*Math.cos(a),3.2*Math.sin(a)];}),[.6,39],[0,40],[-.6,39],[-.6,3.14],...Array.from({length:33},(_,i):k.Flat=>{const a=(100.8+i/32*158.4)*Math.PI/180;return [3.2*Math.cos(a),3.2*Math.sin(a)];})],[{x:0,z:0,r:2.2}]);
  const handPose=(m:ClockModel)=>{const F=turnFrame(8,39.9,172,m.shift*Math.PI*2);return {paths:prismPaths(F,handPoly,0,.6),shape:prismShape(F,handPoly,0,.6),at:[8,40.2,172] as k.Point3};};
  const h0=handPose(modelAt(0)),hand=add('clock.hand',h0.paths,h0.shape,h0.at,'hi','','hand');hand.pose=m=>({...hand,...handPose(m)});


  // Paired skeletal plates expose the three contacts between the teeth.
  const plate:k.Flat[]=[[-72,34],[16,34],[16,180],[10.2,180],[10.2,169.8],[5.8,169.8],[5.8,180],[3,180],[3,167],[13,167],[13,141],[10.2,141],[10.2,133.8],[5.8,133.8],[5.8,141],[3,141],[3,131],[13,131],[13,116],[-23,116],[-23,142],[-25.8,142],[-25.8,133.8],[-30.2,133.8],[-30.2,142],[-33,142],[-33,116],[-59,116],[-59,151],[-61.8,151],[-61.8,133.8],[-66.2,133.8],[-66.2,151],[-69,151],[-69,116],[-72,116]];
  // Open fork seats expose the shaft; the flanged bearings supply the closed journals.
  for(const [side,y] of [['rear',-20],['front',25]] as const){
    prism(`train.plate.${side}`,front(0,y,0),plate,0,3,'lo');
  }
  for(const [label,x,z] of [['upper',-68,109],['lower',-68,40]] as const)annulus(`train.spacer.${label}`,front(x,-17,z),0,42,1.2,2.5,'lo');
  for(const [i,g] of TRAIN.entries()){
    const id=i===0?'tape':`gear.${i-1}`;
    annulus(`${id}.bearing`,front(g.x,-23,g.z),0,3,2.2,i===0?4.1:4.5,'mid');
    annulus(`${id}.front-bearing`,front(g.x,28,g.z),0,3,2.2,4.5,'mid');
    shaft(`${id}.shaft`,front(g.x,-23,g.z),i===3?182:56,2.2,[3,7,10,39,40,41,44,48,51,54,56,...(i===3?[60.5,62.9,63.5,164,166,172,173.2,175.2,176.2,176.7,177.2,180.2]:[])]);
    const outline=toothed(),root=annularSectors(circle(2.2,48),outline.filter((_,n)=>n%12===0||n%12===11));
    for(const poly of root)Object.assign(poly,{voids:[circle(2.2,48)]});
    const pieces=[...root,...Array.from({length:24},(_,n)=>Object.assign(outline.slice(n*12,(n+1)*12),{interior:[11]}))];
    for(const [piece,poly] of pieces.entries()){
      const shape=(m:ClockModel)=>{const F=turnFrame(g.x,-16,g.z,gearAngle(i,m));return {paths:prismPaths(F,poly,0,3),shape:prismShape(F,poly,0,3),at:[g.x,-14.5,g.z] as k.Point3};};
      const initial=shape(modelAt(0)),wheel=add(piece?`${g.name}.piece.${piece}`:g.name,initial.paths,initial.shape,initial.at,'hi','','gear');
      wheel.physical=g.name;wheel.pose=m=>({...wheel,...shape(m)});
    }
    annulus(`${id}.cap`,front(g.x,31,g.z),0,2,2.2,3.8,'mid',ring(front(g.x,33,g.z),0,1.2));
  }

  // The stopped train leaves a wound spring to drive the service cycle.
  annulus('cycle.barrel',front(8,68.2,172),0,1,2.2,6.3,'mid');
  annulus('cycle.barrel.rim',front(8,69.2,172),0,4,5.8,6.3,'mid').physical='cycle.barrel';
  annulus('cycle.cam.back',front(8,65,172),0,1.2,6.2,21,'lo').physical='cycle.cam';
  for(const [i,poly] of camSectors.entries()){
    const camPose=(m:ClockModel)=>{const F=turnFrame(8,66.2,172,serviceAngle(m));return {paths:prismPaths(F,poly,0,2),shape:prismShape(F,poly,0,2),at:[8,67.2,172] as k.Point3};};
    const cp=camPose(modelAt(0)),cam=add(i?`cycle.cam.sector.${i}`:'cycle.cam',cp.paths,cp.shape,cp.at,'mid','','cam');cam.physical='cycle.cam';cam.pose=m=>({...cam,...camPose(m)});
  }
  const springPose=(m:ClockModel)=>{const F=front(8,69.7,172),poly=powerSpring(m);return {paths:prismPaths(F,poly,0,.5),shape:prismShape(F,poly,0,.5),at:[8,69.95,172] as k.Point3};};
  const sp=springPose(modelAt(0)),power=add('cycle.power-spring',sp.paths,sp.shape,sp.at,'hi','','cam');power.pose=m=>({...power,...springPose(m)});
  annulus('gear.2.shoulder',front(8,69.2,172),0,.5,2.2,2.8,'hi').physical='gear.2.shaft';
  for(let i=0;i<5;i++){
    const pinPose=(m:ClockModel)=>{
      const q=i===0?leverAt(m).follower:i===1?rackGateAt(m).follower:i===3?coinGateAt(m).follower:i===4?expiryAt(m).follower:[8+camLaws[i-1](m),74,172];
      const r=i===0?.55:.2,y=66.4,end=i===0?73:i===3?107:76,F=front(q[0],y,q[2]);
      return {paths:G.disc(0,end-y,r,F,P),shape:{kind:'disc' as const,args:[F,0,end-y,r]},at:[q[0],(y+end)/2,q[2]] as k.Point3};
    };
    const fp=pinPose(modelAt(0)),follower=add(`cycle.follower.${i}`,fp.paths,fp.shape,fp.at,'hi','','cam');follower.pose=m=>({...follower,...pinPose(m)});
    if(i===0)follower.physical='carriage.lever';
  }

  // Continuous tape passes through the nip and bends into the inside well.
  box('tape.port.lower',-106,-10,137,19,35,3,'mid');
  box('tape.port.upper',-106,-10,148.3,19,35,3,'mid');
  const roll=front(-64,-7,136),pressure=front(-64,-7,144.3);
  for(const [name,F,sign] of [['tape.feed-roll',roll,-1],['tape.pressure-roll',pressure,1]] as const){
    turnedRing(name,F,0,23,2.2,4,m=>sign*m.shift*2*Math.PI,true);
  }
  shaft('tape.pressure-shaft',front(-64,-12,144.3),29,2.2,[3,5,28]);
  prism('tape.bracket.-10',front(0,-12,0),bored(rect(-71,140,-59,150),[{x:-64,z:144.3,r:2.2}]),0,3,'mid');
  box('tape.bracket.-10.arm',-70.2,-9,143,2,25,3,'lo').physical='tape.bracket.-10';
  prism('tape.bracket.22',front(0,16,0),bored([[-87,130],[-59,130],[-59,150],[-69,150],[-69,132],[-87,132]],[{x:-64,z:136,r:2.2},{x:-64,z:144.3,r:2.2}]),0,1,'mid');
  const paperPieces=[
    Object.assign(rect(-140,140,-40,140.3),{interior:[1]}),
    Object.assign([...Array.from({length:17},(_,i):k.Flat=>{const a=(1-i/16)*Math.PI/2;return [-40+3*Math.cos(a),137+3*Math.sin(a)];}),...Array.from({length:17},(_,i):k.Flat=>{const a=i/16*Math.PI/2;return [-40+3.3*Math.cos(a),137+3.3*Math.sin(a)];})],{interior:[16,33]}),
    Object.assign(rect(-37,35.3,-36.7,137),{interior:[0,2]}),
    Object.assign([[-37,35],[-30,35],[-30,35.3],[-36.7,35.3],[-37,35.3]] as k.Flat[],{interior:[3]}),
  ];
  for(const [i,poly] of paperPieces.entries())prism(i?`tape.paper.${i}`:'tape.paper',front(0,-6,0),poly,0,22,'hi','','tape').physical='tape.paper';
  prism('tape.inner-guide',front(0,-6,0),[[-60,139.5],...Array.from({length:17},(_,i):k.Flat=>{const a=(1-i/16)*Math.PI/2;return [-40+2.5*Math.cos(a),137+2.5*Math.sin(a)];}),[-37.5,35],[-37,35],...Array.from({length:17},(_,i):k.Flat=>{const a=i/16*Math.PI/2;return [-40+3*Math.cos(a),137+3*Math.sin(a)];}),[-60,140]],0,22,'lo');
  box('tape.well',-38,-8,34,12,26,1,'lo');
  const spool=front(-140,-6,129);
  box('tape.spool-anchor',-149,-18,0,16,30,4,'lo');
  box('tape.spool-bracket',-143,-10,4,6,38,109,'lo');
  for(const [i,y] of [-10,24].entries()){
    const fork=prism(i?'tape.spool-upright.front':'tape.spool-upright',front(-140,y,129),bored(rect(-7,-14,7,7),[{x:0,z:0,r:2}]),0,4,'lo');fork.physical='tape.spool-upright';
  }
  box('tape.spool-upright.base',-147,-10,113,14,38,2,'lo').physical='tape.spool-upright';
  shaft('tape.spool-shaft',front(-140,-10,129),38,2,[4,32,33.3,34]);
  for(const [name,s0,s1,r] of [['tape.spool.core',0,28,11],['tape.spool.flange',28,29.3,13]] as const){
    turnedRing(name,spool,s0,s1,2,r,m=>-m.shift*2*Math.PI*4/11);
  }

  // Rack: folded pockets and real cards; the open bottom is the expiry path.
  box('rack.foot.left',86,21,0,10,27,8,'lo');
  box('rack.foot.right',127,21,0,10,27,8,'lo');
  box('rack.back',86,24,8,51,4,190,'mid',line(path3([[90,28,8],[90,28,198]])+path3([[133,28,8],[133,28,198]]),'faint')+dots([[91,28,193],[132,28,193],[91,28,14],[132,28,14]]));
  box('rack.stile.left',86,28,8,3,18,190,'mid');
  box('rack.stile.right',134,28,8,3,18,190,'mid');
  for(let i=0;i<5;i++){
    const z=i===4?164:25+i*35;
    if(i===4)prism('rack.pocket.4',upright(0,0,z),[[89,28],[134,28],[134,88],[126,88],[126,74],[89,74]],0,2,'mid');
    else box(`rack.pocket.${i}`,89,28,z,45,13.5,2,'mid',line(path3([[89,41.5,z+2],[134,41.5,z+2]]),'lo'));
    if(i<4)box(`rack.card.${i}`,94,30,z+2,30,.7,30,'hi',faceRules(98,30.7,z+27,22,4));
  }
  box('rack.pocket.4.pivot-pad',89,72,166,3,15,1,'mid').physical='rack.pocket.4';
  prism('rack.top-guide',front(0,87.3,0),[[93,166],[127,166],[127,226],[93,226],[93,190.2],[126,190.2],[126,187.8],[93,187.8]],0,.7,'mid');
  box('rack.rail-pad',86,46,140,10,35.9,3,'lo').physical='rack.stile.left';
  prism('rack.rail-cradle',front(0,78.1,0),[[86,143],[96,143],[96,96+.33*186-4/railN[2]],[86,96+.33*176-4/railN[2]]],0,3.8,'lo').physical='rack.stile.left';
  for(const x of [93,125])box(`rack.top-guide.side.${x}`,x,88,202,2,2,24,'mid').physical='rack.top-guide';
  disc('rack.release-pivot',upright(90,86,167),0,23,1,'mid');
  const gatePoly=bored([[-1.8,-1.8],[-1,-1.8],[-1,-3.8],[1,-3.8],[1,-1.8],[2,-1.8],[6,2],[6,2.65],[5,2.65],[-1.8,1.8]],[{x:0,z:0,r:1}]);
  const releasePose=(m:ClockModel,poly=gatePoly)=>{
    const a=rackGateAt(m).a,F=G.frameOf([90,86,188],[0,0,1],[Math.cos(a),Math.sin(a),0],[-Math.sin(a),Math.cos(a),0]);
    return {paths:prismPaths(F,poly,0,2),shape:prismShape(F,poly,0,2),at:[90,86,189] as k.Point3};
  };
  const rp=releasePose(modelAt(0)),release=add('rack.release-lever',rp.paths,rp.shape,rp.at,'hi','','release');release.pose=m=>({...release,...releasePose(m)});
  for(let i=0;i<4;i++){
    const poly=Object.assign(rect(6+i*7.25,2,6+(i+1)*7.25,2.65),{interior:i===3?[3]:[1,3]}),pose=(m:ClockModel)=>releasePose(m,poly),initial=pose(modelAt(0));
    const p=add(`rack.release-lever.bar.${i}`,initial.paths,initial.shape,initial.at,'hi','','release');p.physical='rack.release-lever';p.pose=m=>({...p,...pose(m)});
  }
  box('rack.expiry-guide',92,41.5,10,34,.7,60,'lo');
  for(const x of [92,124])box(`rack.expiry-guide.side.${x}`,x,42.2,10,2,4,60,'mid').physical='rack.expiry-guide';
  box('rack.expiry-gate',94,42.2,38,30,.7,2,'hi','','expiry-gate');
  box('rack.expiry-lip',89,28,8,45,18.2,2,'lo');
  box('rack.expired-card',94,42.2,10,30,.7,30,'lo',faceRules(98,42.9,36,22,3),'expired');

  // The die pad stays behind the card and above the uninterrupted rail.
  box('punch.mount.left',-16,30,30,8,20,4,'lo');
  prism('punch.mount.right',upright(0,0,30),[[30,30],[42,30],[42,98],[30,98],[30,88],[38,88],[38,84],[30,84]],0,4,'lo');
  box('punch.left-foot',-16,46,34,8,4,4,'lo');
  box('punch.right-foot',30,90,34,8,8,4,'lo');
  box('punch.standard.left',-16,46,38,6,4,160,'mid');
  prism('punch.standard.right',G.frameOf([32,0,0],[1,0,0],[0,1,0],[0,0,1]),[[90,38],[98,38],[98,198],[90,198],[90,150],[97,150],[97,134],[90,134]],0,6,'mid');
  prism('punch.bridge',upright(0,0,198),cutLoops(rect(-10,46,32,125),[rect(-6,50,28,78).reverse(),rect(-6,82,28,117).reverse()]),0,6,'mid');
  prism('punch.die-post',front(0,78,0),[[2,142],[18,142],[18,158],[-3,158],[-3,198],[-6,198],[-6,156],[2,156]],0,4,'mid');
  annulus('punch.die',front(10,82,150),0,6,1.6,8,'hi');
  const sleeve=G.frameAlong([10,120,150],[0,-1,0]);
  annulus('punch.sleeve',sleeve,0,12,1.6,6,'mid',line(G.ribsOf(sleeve,1,11,6,20,P,{seams:true}),'lo'));
  annulus('punch.gland',sleeve,12,14,1.6,6.8,'hi');
  prism('punch.sleeve-mount',front(0,117,0),[...Array.from({length:33},(_,i):k.Flat=>{const x=4+12*i/32;return [x,150+Math.sqrt(Math.max(0,36-(x-10)**2))];}),[16,160],[27,160],[27,198],[24.6,198],[24.6,163],[4,163]],0,3,'mid');
  const rod=G.rodOut(sleeve,14,25,1.6,P,{stroke:5.35});
  add('punch.rod',rod.paths,{kind:'slide',args:[sleeve,14,25,1.6]},[10,100.5,150],'hi','','ram').clip=rod.clip;
  disc('punch.shoe',sleeve,25,26,3.8,'hi',ring(sleeve,26,2),'ram');
  annulus('punch.spring-seat',sleeve,14,14.8,1.6,3.8,'mid');
  annulus('punch.return-seat',sleeve,24.2,25,1.6,3.8,'mid','','ram');
  box('punch.card',-5,88,131,30,.65,36,'hi',faceRules(0,88.65,162,20,4),'card').lit=true;

  // One captured rail and a yoke link carry the card through all three stations.
  const railOrigin=G.add3(railStart,[0,-8,-4]);
  const RF=G.frameOf(railOrigin,[0,1,0],railU,railN);
  prism('punch.carrier',RF,rect(-10,-4,railLength+10,0),-4,4,'mid');
  prism('punch.carrier-stop',RF,rect(railLength+8,0,railLength+10,5),-4,4,'mid');
  const translatePart=(part:Part,offset:k.Point3)=>{
    const shape={...part.shape,args:[...part.shape.args],meta:part.shape.meta?{...part.shape.meta}:undefined};
    if(shape.meta?.cut)shape.meta.cut=(shape.meta.cut as {F:G.Frame}[]).map(cut=>({...cut,F:{...cut.F,o:G.add3(cut.F.o,offset)}}));
    if(shape.kind==='prism'||shape.kind==='disc'||shape.kind==='ring'||shape.kind==='solid'||shape.kind==='slide'){
      const F=shape.args[0] as G.Frame;shape.args[0]={...F,o:G.add3(F.o,offset)};
    }else if(shape.kind==='slab'){
      const plan=shape.args[0] as k.Plan;shape.args[0]={...plan,x:plan.x+offset[0],y:plan.y+offset[1]};shape.args[1]=(shape.args[1] as number)+offset[2];
    }
    if(shape.kind==='ball')shape.args[0]=G.add3(shape.args[0] as k.Point3,offset);
    if(shape.kind==='tube')shape.args[0]=(shape.args[0] as k.Point3[]).map(p=>G.add3(p,offset));
    const paths=part.paths;
    return {...part,shape,paths,at:G.add3(part.at,offset)};
  };
  const carriagePart=(p:Part)=>{p.physical='carriage.shoe';p.motion='carriage';p.pose=m=>translatePart(p,G.sub3(carriageAt(m),carriageAt(modelAt(0))));};
  const home=carriageAt(modelAt(0)),shoe=G.add3(home,[0,-8,-4]);
  carriagePart(prism('carriage.shoe',G.frameOf(shoe,railU,[0,1,0],railN),[[-5,-5],[-2,-5],[-2,-4.03],[-4.03,-4.03],[-4.03,.03],[4.03,.03],[4.03,-4.03],[2,-4.03],[2,-5],[5,-5],[5,2],[-5,2]],-8,8,'hi'));
  const lower0=G.add3(G.mul3(railU,-8),G.mul3(railN,2)),lower1=G.add3(G.mul3(railU,8),G.mul3(railN,2));
  carriagePart(prism('carriage.seat',front(home[0],85,home[2]),[[lower0[0],lower0[2]-4],[lower1[0],lower1[2]-4],[16,0],[-16,0]],0,3,'hi'));
  for(const [i,x] of [-16,14].entries())carriagePart(prism(`carriage.seat-tab.${i}`,front(home[0],88,home[2]),rect(x,-1,x+2,0),0,8.65,'hi'));
  carriagePart(prism('carriage.bell-ramp',front(home[0],88,home[2]),tripRamp,0,1,'hi'));
  carriagePart(prism('carriage.yoke',G.frameOf(home,[0,1,0],railU,railN),cutLoops(rect(-3,-103,3,2-4*railN[2]),[rect(-1.3,-101,1.3,-3).reverse()]),-3,-1,'mid'));
  box('train.plate.front.lug',16,25,160,38,3,4,'lo').physical='train.plate.front';
  // The offset root clears the dial hand before returning to the lever axis.
  shaft('carriage.pivot',front(52,-56,162),15,2,[],'hi');
  prism('carriage.pivot.offset',front(0,-41,0),rect(27,160,54,164),0,3,'hi').physical='carriage.pivot';
  shaft('carriage.pivot.extension',front(29,-38,162),109,2,[103,106.2],'hi',undefined,'carriage.pivot');
  const fulcrumBase:k.Flat[]=[...Array.from({length:17},(_,i):k.Flat=>{const x=28.6+.8*i/16;return [x,162+Math.sqrt(4-(x-29)**2)];}),[29.4,164.2],[28.6,164.2]];
  prism('cycle.fulcrum.base',front(0,53.6,0),fulcrumBase,0,1.3,'mid').physical='cycle.fulcrum';
  annulus('cycle.fulcrum',G.frameAlong([28.6,54.25,164.85],[1,0,0]),0,.8,.28,.65,'mid');
  prism('carriage.pivot.arm',front(0,71,0),[[8,160],[31,160],[31,164],[14,164],[14,162],[8,162]],0,2,'mid').physical='carriage.pivot';
  disc('carriage.pivot.journal',front(8,73,162),0,2,2,'hi').physical='carriage.pivot';
  disc('carriage.pivot.cap',front(8,75,162),0,.8,3,'hi').physical='carriage.pivot';
  const leverPose=(m:ClockModel)=>{
    const F=turnFrame(LEVER[0],73,LEVER[2],leverAt(m).a),poly=bored(rect(-4,-2,LEVER_LENGTH+1,2),[{x:0,z:0,r:2}]);
    return {paths:prismPaths(F,poly,0,2),shape:prismShape(F,poly,0,2),at:[LEVER[0],74,LEVER[2]] as k.Point3};
  };
  const lp=leverPose(modelAt(0)),lever=add('carriage.lever',lp.paths,lp.shape,lp.at,'hi','','lever');lever.pose=m=>({...lever,...leverPose(m)});
  const pinPose=(m:ClockModel)=>{const p=leverAt(m).pin,F=front(p[0],75,p[2]);return {paths:G.disc(0,12,1,F,P),shape:{kind:'disc' as const,args:[F,0,12,1]},at:[p[0],81,p[2]] as k.Point3};};
  const pp=pinPose(modelAt(0)),pin=add('carriage.pin',pp.paths,pp.shape,pp.at,'hi','','lever');pin.physical='carriage.lever';pin.pose=m=>({...pin,...pinPose(m)});

  // The key turns a pinned crank/link; its sliding dog closes the punch's drive gap.
  const lock=front(35,98,142);
  annulus('keeper.boss',lock,0,7,1.4,5,'mid');
  annulus('keeper.lock',lock,7,9,1.4,3.5,'hi');
  shaft('keeper.key-shaft',lock,19,1.4,[7,9,11,13],'hi');
  const bowPose=(m:ClockModel)=>{const F=front(...keeperAt(m).bow);return {paths:ringPaths(0,1.6,3.8,6,F),shape:{kind:'ring' as const,args:[F,0,1.6,3.8,6]},at:G.add3(F.o,[0,.8,0])};};
  const bp=bowPose(modelAt(0)),bow=add('keeper.key-bow',bp.paths,bp.shape,bp.at,'hi','','keeper');bow.pose=m=>({...bow,...bowPose(m)});
  const bitPose=(m:ClockModel)=>{const F=turnFrame(35,113,142,keeperAt(m).a),poly=rect(1.4,-.7,3.4,.7);return {paths:prismPaths(F,poly,0,4),shape:prismShape(F,poly,0,4),at:[35,115,142] as k.Point3};};
  const kb=bitPose(modelAt(0)),bit=add('keeper.key-bit',kb.paths,kb.shape,kb.at,'hi','','keeper');bit.pose=m=>({...bit,...bitPose(m)});
  const crankPoly=bored(capsule(0,8,0,2.2),[{x:0,z:0,r:1.4}]);
  const crankPose=(m:ClockModel)=>{const F=turnFrame(35,109,142,keeperAt(m).a);return {paths:prismPaths(F,crankPoly,0,2),shape:prismShape(F,crankPoly,0,2),at:[35,110,142] as k.Point3};};
  const cr=crankPose(modelAt(0)),crank=add('keeper.crank',cr.paths,cr.shape,cr.at,'hi','','keeper');crank.pose=m=>({...crank,...crankPose(m)});
  const crankPinPose=(m:ClockModel)=>{const p=keeperAt(m).crank,F=front(p[0],111,p[2]);return {paths:G.disc(0,1.03,.8,F,P),shape:{kind:'disc' as const,args:[F,0,1.03,.8]},at:[p[0],111.515,p[2]] as k.Point3};};
  const kp=crankPinPose(modelAt(0)),crankPin=add('keeper.crank.pin',kp.paths,kp.shape,kp.at,'hi','','keeper');crankPin.physical='keeper.crank';crankPin.pose=m=>({...crankPin,...crankPinPose(m)});
  const linkPoly=bored(capsule(0,17,0,1.8),[{x:0,z:0,r:.8},{x:17,z:0,r:.8}]);
  const linkPose=(m:ClockModel)=>{const {crank:c,pin:d}=keeperAt(m),F=turnFrame(c[0],111,c[2],Math.atan2(d[2]-c[2],d[0]-c[0]));return {paths:prismPaths(F,linkPoly,0,1),shape:prismShape(F,linkPoly,0,1),at:[(c[0]+d[0])/2,111.5,(c[2]+d[2])/2] as k.Point3};};
  const kl=linkPose(modelAt(0)),link=add('keeper.link',kl.paths,kl.shape,kl.at,'hi','','keeper');link.pose=m=>({...link,...linkPose(m)});
  box('keeper.dog',8,126,148,4,8,4,'hi','','dog');
  box('keeper.dog.wing',12,126,149,7,2,2,'hi','','dog').physical='keeper.dog';
  shaft('keeper.dog.pin',front(18,110,150),16,.8,[1,2,10,12,14],'hi','dog','keeper.dog');
  box('punch.sleeve.guide.lower',6,120,145.97,24,15,2,'mid').physical='punch.sleeve';
  box('punch.sleeve.guide.upper',6,120,152.03,24,7,2,'mid').physical='punch.sleeve';
  disc('punch.rod.inner',front(10,106,150),0,14,1.6,'hi').physical='punch.rod';
  const rear=G.rodOut(front(10,120,150),0,6,1.6,P,{stroke:-5.35});
  const rearPart=add('punch.rod.rear',rear.paths,{kind:'slide',args:[front(10,120,150),0,6,1.6]},[10,123,150],'hi','','ram');rearPart.clip=rear.clip;rearPart.physical='punch.rod';

  // A short arm and a captured slot convert the face-cam stroke into the axial ram stroke.
  box('punch.rocker-pivot.bracket',20,125,198,4,12,4,'mid').physical='punch.rocker-pivot';
  shaft('punch.rocker-pivot',upright(22,135,169),29,2,[1,3]);
  annulus('punch.rocker-pivot.cap',upright(22,135,169),0,1,2,3,'hi').physical='punch.rocker-pivot';
  const rockerPoly=bored([[-13,-1.2],[-2.75,-1.2],[-1.2,-2.75],[-1.2,-4.8],[1.2,-4.8],[1.2,-2.75],[2.75,-1.2],[3,0],[2.75,1.2],[1.2,2.75],[0,3],[-1.2,2.75],[-2.75,1.2],[-13,1.2]],[{x:0,z:0,r:2}]);
  const rockerPose=(m:ClockModel)=>{const a=rockerAt(m).a,F=G.frameOf([22,135,170],[0,0,1],[Math.cos(a),Math.sin(a),0],[-Math.sin(a),Math.cos(a),0]);return {paths:prismPaths(F,rockerPoly,0,2),shape:prismShape(F,rockerPoly,0,2),at:[22,135,171] as k.Point3};};
  const rk=rockerPose(modelAt(0)),rocker=add('punch.rocker',rk.paths,rk.shape,rk.at,'hi','','rocker');rocker.pose=m=>({...rocker,...rockerPose(m)});
  for(const which of ['nose','pin'] as const){
    const pose=(m:ClockModel)=>{const p=rockerAt(m)[which],F=upright(...p),r=which==='nose'?1:.7,h=which==='nose'?22:2;return {paths:G.disc(0,h,r,F,P),shape:{kind:'disc' as const,args:[F,0,h,r]},at:G.add3(p,[0,0,h/2])};};
    const initial=pose(modelAt(0)),part=add(`punch.rocker.${which}`,initial.paths,initial.shape,initial.at,'hi','','rocker');part.physical='punch.rocker';part.pose=m=>({...part,...pose(m)});
  }
  prism('punch.cam-link.root',front(22,74,172),bored(rect(-.6,-.5,.6,14),[{x:0,z:0,r:.2}]),0,1,'hi','','punch-cam').physical='punch.cam-link';
  shaft('punch.cam-link',front(22,75,185.5),53,.4,[8,16,24,32,40,48],'hi','punch-cam');
  disc('punch.cam-link.return',upright(22,128,173.5),0,12,.4,'hi','','punch-cam').physical='punch.cam-link';
  prism('punch.cam-link.yoke',upright(0,0,173),cutLoops(rect(20.8,128,23.2,132.9),[rect(21.27,130,22.73,132.5).reverse()]),0,1,'hi','','punch-cam').physical='punch.cam-link';

  // A wide common channel divides into two open, continuously seated branches.
  const channel=(name:string,profile:readonly number[],y:number,width:number)=>{
    prism(`${name}.floor`,front(0,y,0),floorProfile(profile),0,width,'mid');
    const top=floorProfile(profile,0).slice(0,33);
    const wall=(h:number,trim=false)=>{const edge=trim?[[51.8,floorAt(profile,51.8).z] as k.Flat,...top.filter(([x])=>x>51.8)]:top;return [...edge,...[...edge].reverse().map(([x,z]):k.Flat=>[x,z+h])];};
    prism(`${name}.far-wall`,front(0,y-1,0),wall(4,name==='chute.1'),0,1,'mid');
    prism(`${name}.near-wall`,front(0,y+width,0),wall(2,name==='chute.0'),0,1,'hi');
  };
  prism('punch.coin-magazine',front(0,99,0),floorProfile(PAYOUT.magazine),0,34,'mid');
  const mountTop=Array.from({length:29},(_,i):k.Flat=>{const x=18+i/2;return [x,floorAt(x<=22?PAYOUT.magazine:PAYOUT.hopper,x).z-1.2];});
  prism('punch.coin-magazine.mount',front(0,90,0),[...mountTop,...[...mountTop].reverse().map(([x,z]):k.Flat=>[x,z-3])],0,9,'lo').physical='punch.coin-magazine';
  prism('punch.coin-magazine.cradle',front(0,99,0),[[18,67.8],[22,63.8],[22,66.8],[18,70.8]],0,8,'lo').physical='punch.coin-magazine';
  for(const y of [98,133]){const p=prism(`punch.coin-magazine.cheek.${y}`,front(0,y,0),[[10,80],[22,68],[22,82],[10,82]],0,1,'mid');p.physical='punch.coin-magazine';}

  prism('punch.coin-magazine.pivot-seat',front(25,97,77),bored([[-2.3,-2],[7,-2],[7,2.3],[-2.3,2.3]],[{x:0,z:0,r:1.2},{x:-1.5,z:1.5,r:.5}]),0,1,'lo').physical='punch.coin-magazine';
  disc('punch.coin-gate.pivot',front(25,96,77),0,2,1.2,'mid').physical='punch.coin-magazine';
  const gateAngle=Math.atan2(83.748-77,19.548-25);
  const gateBore={x:-1.5*Math.cos(gateAngle)+1.5*Math.sin(gateAngle),z:1.5*Math.sin(gateAngle)+1.5*Math.cos(gateAngle),r:.28};
  const gateOutline=bored(capsule(0,Math.hypot(19.548-25,83.748-77),0,2),[{x:0,z:0,r:1.2},gateBore]);
  const gatePose=(m:ClockModel)=>{const a=Math.atan2(83.748-77,19.548-25)-coinGateAt(m).a,F=turnFrame(25,96,77,a);return {paths:prismPaths(F,gateOutline,0,1),shape:prismShape(F,gateOutline,0,1),at:[25,96.5,77] as k.Point3};};
  const cg=gatePose(modelAt(0)),cgPart=add('punch.coin-gate',cg.paths,cg.shape,cg.at,'hi','','coin-gate');cgPart.pose=m=>({...cgPart,...gatePose(m)});
  const gatePlugPose=(m:ClockModel)=>{const a=gateAngle-coinGateAt(m).a,F=front(25+gateBore.x*Math.cos(a)-gateBore.z*Math.sin(a),96,77+gateBore.x*Math.sin(a)+gateBore.z*Math.cos(a));return {paths:G.disc(0,.6,.28,F,P),shape:{kind:'disc' as const,args:[F,0,.6,.28]},at:G.add3(F.o,[0,.3,0])};};
  const gp=gatePlugPose(modelAt(0)),gatePlug=add('punch.coin-gate.socket-bottom',gp.paths,gp.shape,gp.at,'mid','','coin-gate');gatePlug.physical='punch.coin-gate';gatePlug.pose=m=>({...gatePlug,...gatePlugPose(m)});
  const stopPose=(m:ClockModel)=>{const p=coinGateAt(m).bar,F=front(p[0],97,p[2]);return {paths:G.disc(0,36,.5,F,P),shape:{kind:'disc' as const,args:[F,0,36,.5]},at:[p[0],115,p[2]] as k.Point3};};
  const cs=stopPose(modelAt(0)),stop=add('punch.coin-gate.stop',cs.paths,cs.shape,cs.at,'hi','','coin-gate');stop.physical='punch.coin-gate';stop.pose=m=>({...stop,...stopPose(m)});
  const links=[
    {name:'rack.release-link',ends:(m:ClockModel)=>{const g=rackGateAt(m);return [g.follower,g.pin];},axes:[[0,1,0],[0,0,1]],radii:[.2,.6],outer:[.9,1.2]},
    {name:'punch.coin-gate.link',ends:(m:ClockModel)=>{const g=coinGateAt(m);return [g.follower,g.pin];},axes:[[0,1,0],[0,1,0]],radii:[.2,.3],outer:[.9,.8]},
    {name:'rack.expiry-link',ends:(m:ClockModel)=>{const g=expiryAt(m);return [g.follower,g.pin];},axes:[[0,1,0],[0,1,0]],radii:[.2,.5],outer:[.9,1]},
  ];
  for(const spec of links){
    const ends0=spec.ends(modelAt(0)),initialDirection=G.sub3(ends0[1],ends0[0]);
    for(let piece=0;piece<3;piece++){
      const pose=(m:ClockModel)=>{
        const ends=spec.ends(m),direction=G.sub3(ends[1],ends[0]),unit=G.unit3(direction);
        if(piece<2){const F=G.frameAlong(ends[piece],rotateBetween(initialDirection,direction,spec.axes[piece] as k.Point3));return {paths:ringPaths(-.5,.5,spec.radii[piece]+.03,spec.outer[piece],F),shape:{kind:'ring' as const,args:[F,-.5,.5,spec.radii[piece]+.03,spec.outer[piece]]},at:ends[piece]};}
        const F=G.frameAlong(ends[0],unit),from=spec.outer[0]*.8,to=Math.hypot(...direction)-spec.outer[1]*.8;
        return {paths:G.disc(from,to,.3,F,P),shape:{kind:'disc' as const,args:[F,from,to,.3]},at:G.add3(F.o,G.mul3(F.a,(from+to)/2))};
      };
      const initial=pose(modelAt(0)),part=add(piece===2?spec.name:`${spec.name}.eye.${piece}`,initial.paths,initial.shape,initial.at,'hi','','control-link');part.physical=spec.name;part.pose=m=>({...part,...pose(m)});
    }
  }
  const rackPinPose=(m:ClockModel)=>{const p=rackGateAt(m).pin,F=upright(p[0],p[1],190);return {paths:G.disc(0,2,.6,F,P),shape:{kind:'disc' as const,args:[F,0,2,.6]},at:p};};
  const ri=rackPinPose(modelAt(0)),rip=add('rack.release-lever.pin',ri.paths,ri.shape,ri.at,'hi','','release');rip.physical='rack.release-lever';rip.pose=m=>({...rip,...rackPinPose(m)});
  const coinPinPose=(m:ClockModel)=>{const p=coinGateAt(m).pin,F=front(p[0],94,p[2]);return {paths:G.disc(0,3,.3,F,P),shape:{kind:'disc' as const,args:[F,0,3,.3]},at:[p[0],95.5,p[2]] as k.Point3};};
  const ci=coinPinPose(modelAt(0)),cip=add('punch.coin-gate.pin',ci.paths,ci.shape,ci.at,'hi','','coin-gate');cip.physical='punch.coin-gate';cip.pose=m=>({...cip,...coinPinPose(m)});
  disc('rack.expiry-gate.pin',front(109,42.9,39),0,18.1,.5,'hi','','expiry-gate').physical='rack.expiry-gate';

  const movingWire=(name:string,physical:string,radius:number,pointsAt:(m:ClockModel)=>k.Point3[],keyAt:(m:ClockModel)=>string)=>{
    let last='',pieces:ReturnType<typeof T.tubePieces>=[];
    const wireAt=(m:ClockModel)=>{
      const key=keyAt(m);if(key===last)return pieces;last=key;
      const points=pointsAt(m);let length=0;
      for(let i=1;i<points.length;i++)length+=Math.hypot(...G.sub3(points[i],points[i-1]));
      const breaks=Array.from({length:7},(_,i)=>length*(i+1)/8);
      pieces=T.tubePieces(points,radius,P,{maxLength:1000,spacing:.5,breaks});return pieces;
    };
    wireAt(modelAt(0)).forEach((piece,i)=>{
      const p=add(`${name}.${i}`,{fill:'',top:'',outline:'',crease:'',shades:['','','','']},{kind:'tube',args:[piece.points,piece.radii]},piece.mid,'hi','','flexure');
      p.raw=T.tubeSvg(piece,{tone:'hi'});p.physical=physical;
      p.pose=m=>{const q=wireAt(m)[i];if(!q)throw new Error(`${name} paint segments changed`);return {...p,shape:{kind:'tube',args:[q.points,q.radii]},at:q.mid,raw:T.tubeSvg(q,{tone:'hi'})};};
    });
  };
  movingWire('punch.coin-latch.upper','punch.coin-latch',.25,m=>latchRoutes(m)[0],m=>String(m.punch));
  movingWire('punch.coin-latch.lower','punch.coin-latch',.25,m=>latchRoutes(m)[1],m=>String(coinLatchAt(m)));
  movingWire('cycle.latch','cycle.latch',.25,barrelLatchPoints,m=>`${m.shift}:${barrelCatchAt(m)}`);
  movingWire('cycle.hold-pawl','cycle.hold-pawl',.25,holdPawlPoints,m=>String(m.shift));
  const pawlTipPose=(m:ClockModel)=>{const p:k.Point3=[holdPawlTip(m),-98.5,172];return {paths:G.sphereOf(p,.25,P),shape:{kind:'ball' as const,args:[p,.25]},at:p};};
  const pt=pawlTipPose(modelAt(0)),pawlTip=add('cycle.hold-pawl.tip',pt.paths,pt.shape,pt.at,'hi','','flexure');pawlTip.physical='cycle.hold-pawl';pawlTip.pose=m=>({...pawlTip,...pawlTipPose(m)});
  for(const [i,poly] of annularSectors(circle(2.2),circle(5).map(([x,z]):k.Flat=>[x+1.2,z])).entries()){
    Object.assign(poly,{voids:[circle(2.2)]});
    const releaseCamPose=(m:ClockModel)=>{const F=turnFrame(8,57,172,m.shift*Math.PI*2);return {paths:prismPaths(F,poly,0,2),shape:prismShape(F,poly,0,2),at:[8,58,172] as k.Point3};};
    const rc=releaseCamPose(modelAt(0)),cam=add(i?`cycle.release-cam.sector.${i}`:'cycle.release-cam',rc.paths,rc.shape,rc.at,'hi','','release-cam');cam.physical='cycle.release-cam';cam.pose=m=>({...cam,...releaseCamPose(m)});
  }

  channel('hopper',PAYOUT.hopper,99,34);
  channel('trough.common',PAYOUT.common,99,34);
  prism('splitter.vane',G.frameOf([38,115,57],G.unit3([.5,0,1]),G.unit3([1,0,-.5]),[0,1,0]),[[0,0],[Math.hypot(12,6),-2],[Math.hypot(12,6),2]],0,4,'hi');
  // The bridge is fixed to the punch standard, not an isolated post in front of the drawer.
  prism('splitter.yoke',front(0,117,0),[[38,44],[50,44],[50,49.8],[38,55.8]],0,8,'lo');
  box('splitter.yoke.arm',32,98,44,18,19,3,'lo').physical='splitter.yoke';
  for(let i=0;i<2;i++){
    const s=PAYOUT.branches[i],y=i===0?99:117,end=s[1],far=i===0?124:170;
    channel(`chute.${i}`,s,y,14);
    const cradle=Array.from({length:17},(_,n):k.Flat=>{const x=end-4+n/4;return [x,floorAt(s,x).z-1.2];});
    prism(`chute.${i}.bracket`,front(0,y,0),[[end-4,0],[end,0],...[...cradle].reverse()],0,14,'lo');
    box(`tray.${i}.floor`,end,y-2,0,far-end,18,2,'lo');
    box(`tray.${i}.back`,far-2,y,2,2,14,9,'mid');
    box(`tray.${i}.left`,end,y-2,2,far-end,2,9,'mid');
    box(`tray.${i}.right`,end,y+14,2,far-end,2,3,'mid');
    const initial=coinAt(modelAt(0),i),F=front(...initial.p);
    disc(`coin.${i}`,F,-.65,.65,5.3,'hi',ring(F,.65,3.9,'lo'),'coin'+i);
  }

  // A raised drawer meets the rail; the card clears the empty returning seat.
  prism('receipt.foot.left',G.frameOf([-100,0,0],[1,0,0],[0,1,0],[0,0,1]),[[74,0],[107,0],[107,96],[98,96],[98,4],[84,4],[84,87],[74,87]],0,12,'lo');
  prism('receipt.rail-cradle',front(0,78.1,0),[[-100,87],[-88,87],[-88,96+.33*2-4/railN[2]],[-100,96-.33*10-4/railN[2]]],0,3.8,'lo').physical='receipt.foot.left';
  box('receipt.foot.right',-68,98,0,6,9,96,'lo');
  box('receipt.floor',-116,96.65,96,54,10.35,4,'lo');
  prism('receipt.back',front(0,96.65,0),[[-116,100],[-114,100],[-114,136],[-64,136],[-64,100],[-62,100],[-62,138],[-116,138]],0,1,'mid');
  box('receipt.left',-116,97.65,100,2,7.35,36,'mid');
  box('receipt.right',-64,97.65,100,2,7.35,36,'mid');
  box('receipt.front',-116,105,100,54,2,24,'mid');
  box('receipt.pull.left',-101,107,111,2,4,3,'mid');
  box('receipt.pull.right',-83,107,111,2,4,3,'mid');
  box('receipt.pull',-101,111,111,20,2,3,'hi');
  box('receipt.stack',-112,100,100,28,4,27,'lo',faceRules(-108,104,123,20,3));

  // The saddle follows the drum crown; a guided trip rod pushes the spring leaf.
  const saddle:k.Flat[]=[...Array.from({length:33},(_,i):k.Flat=>{const x=i/2;return [x,172+Math.sqrt(69**2-(x-8)**2)];}),[16,244],[0,244]];
  prism('bell.saddle',front(0,-5,0),saddle,0,10,'mid');
  disc('bell.stem',upright(8,0,244),0,8,2,'mid');
  const bf=upright(8,0,252),radius=(s:number)=>12*Math.sqrt(Math.max(0,1-(s/10)**2));
  const profile=Array.from({length:31},(_,i)=>[i/3,radius(i/3),1]);
  add('bell.dome',G.solidOf(profile,bf,P,{smooth:{radius,slope:(s:number)=>-1.2*(s/10)/Math.sqrt(Math.max(1e-8,1-(s/10)**2))}}),{kind:'solid',args:[bf,profile],meta:{radius}},[8,0,257],'hi',ring(bf,0,12));
  const leafPose=(m:ClockModel)=>{
    const end=22.8+bellShift(m),top=Array.from({length:25},(_,i):k.Flat=>{const q=i/24;return [9.98+(end-9.98)*q,248+2*q*q];}),poly=[...top,...[...top].reverse().map(([x,z]):k.Flat=>[x,z-.5])],F=front(0,-.3,0);
    return {paths:prismPaths(F,poly,0,.6),shape:prismShape(F,poly,0,.6),at:[16,0,249] as k.Point3};
  };
  const leaf0=leafPose(modelAt(0)),leaf=add('bell.striker-arm',leaf0.paths,leaf0.shape,leaf0.at,'mid','','bell-leaf');leaf.pose=m=>({...leaf,...leafPose(m)});
  const headPose=(m:ClockModel)=>{const p:k.Point3=[22.8+bellShift(m),0,252];return {paths:G.sphereOf(p,2,P),shape:{kind:'ball' as const,args:[p,2]},at:p};};
  const hp=headPose(modelAt(0)),head=add('bell.striker',hp.paths,hp.shape,hp.at,'hi','','bell-head');head.pose=m=>({...head,...headPose(m)});
  T.tubePieces(tripPoints,tripRadius,P,{maxLength:35,spacing:.5}).forEach((piece,i)=>{
    const p=add(`bell.trip-link.${i}`,{fill:'',top:'',outline:'',crease:'',shades:['','','','']},{kind:'tube',args:[piece.points,piece.radii]},piece.mid,'mid','','trip');
    p.raw=T.tubeSvg(piece,{tone:'mid'});p.physical='bell.trip-link';
  });
  annulus('bell.trip-link.pin',front(-108,87.5,102),0,2,.4,.6,'hi','','trip').physical='bell.trip-link';
  disc('bell.trip-link.pin.end',front(-108,88,102),0,1.5,.4,'mid','','trip').physical='bell.trip-link';
  prism('bell.trip-guide.upper',upright(0,0,174),cutLoops(rect(-110,-16,-93,-12),[capsule(-108.8,-108,-14,.43).reverse()]),0,4,'lo').physical='case.cheek';
  prism('bell.trip-guide.lower',front(0,88.5,0),cutLoops(rect(-114,100,-106,104),[capsule(-108.8,-108,102,.63).reverse()]),0,9.15,'lo').physical='receipt.back';

  const coil=springAt();
  coil.pieces.forEach((piece,i)=>{
    const p=add(`spring.${i}`,{fill:'',top:'',outline:'',crease:'',shades:['','','','']},{kind:'tube',args:[piece.points,piece.radii]},piece.mid,'mid');
    p.raw=T.tubeSvg(piece,{tone:'mid'});p.physical='return-spring';
  });

  // Outside means outside: this key is never included in any motion group.
  disc('stash.foot',upright(-128,22,0),0,4,9,'lo');
  box('stash.post',-131,19,4,6,6,75,'mid',line(path3([[-125,19,10],[-125,25,10]]),'faint'));
  box('stash.arm',-125,19,75,20,6,4,'mid');
  disc('stash.hook',front(-110,25,75),0,8,1.7,'mid');
  prism('stash.hook.tip',front(-110,33,75),capsule(0,3,0,1.7).map(([x,z]):k.Flat=>[z,x]),0,1,'mid').physical='stash.hook';
  annulus('stash.key-bow',front(-110,31,72.4),0,2,4.3,7,'hi');
  box('stash.key-shank',-112,31,40.4,4,2,25,'hi');
  prism('stash.key-bit',front(0,31,0),[[-108,40.4],[-100,40.4],[-100,44.4],[-103,44.4],[-103,47.4],[-100,47.4],[-100,50.4],[-108,50.4]],0,2,'hi');
  // Visible heads clamp the named seating faces; buried threads end at those faces.
  const fasteners:{name:string,F:G.Frame,r:number}[]=[
    ...[-134,-104].map((x,i)=>({name:`maker.${i}`,F:upright(x,107.5,.7),r:1.6})),
    ...[91,132].map((x,i)=>({name:`rack.${i}`,F:upright(x,35,10),r:1.7})),
    ...[-5,railLength+5].map((q,i)=>({name:`rail.${i}`,F:front(...G.add3(G.add3(railOrigin,G.mul3(railU,q)),G.add3([0,4,0],G.mul3(railN,-2)))),r:1.3})),
    ...[-36,52].map((x,i)=>({name:`drum.${i}`,F:G.frameAlong([x,-30,220],[0,-1,0]),r:3})),
    ...[109,40].map((z,i)=>({name:`plate.${i}`,F:front(-68,28,z),r:2.7})),
    ...[-146,-136].map((x,i)=>({name:`tape.${i}`,F:upright(x,-15,4),r:1.5})),
    {name:'punch.0',F:upright(-12,40,34),r:1.7},{name:'punch.1',F:upright(34,80,34),r:1.7},
    {name:'bell',F:upright(8,3.6,244),r:1.2},{name:'stash',F:upright(-134,22,4),r:1.3},
    {name:'receipt.0',F:upright(-96,75.6,87),r:1.2},{name:'receipt.1',F:upright(-66,99.4,100),r:1.4},
  ];
  for(const {name,F,r} of fasteners)disc(`fix.${name}`,F,0,.7,r,'hi',line(path3([G.add3(G.add3(F.o,G.mul3(F.a,.7)),G.mul3(F.u,-r)),G.add3(G.add3(F.o,G.mul3(F.a,.7)),G.mul3(F.u,r))]),'lo'));
  const split=new Set(['tape.bracket.-10','punch.standard.right','tape.paper.1','punch.mount.right','train.plate.rear','train.plate.front','tape.inner-guide','tape.spool-upright','tape.spool-upright.front','tape.bracket.22','rack.top-guide','rack.release-lever','punch.sleeve-mount','punch.carrier','carriage.shoe','carriage.yoke','carriage.lever','punch.rocker','punch.cam-link.yoke','receipt.foot.left','receipt.rail-cradle','bell.trip-guide.upper','keeper.crank','keeper.link']);
  const painted=parts.flatMap(p=>(p.shape.kind==='ring'&&p.name!=='clock.face')||split.has(p.name)?jointPaint(p):[p]);parts.splice(0,parts.length,...painted);
  const centre=(p:Part)=>{
    if(p.shape.kind!=='prism')return p.at;
    const [F,poly,s0,s1]=p.shape.args as [G.Frame,k.Flat[],number,number],q=poly.reduce((a,p)=>[a[0]+p[0]/poly.length,a[1]+p[1]/poly.length],[0,0]);
    return G.add3(G.add3(F.o,G.mul3(F.a,(s0+s1)/2)),G.add3(G.mul3(F.u,q[0]),G.mul3(F.v,q[1])));
  };
  for(const part of parts){part.at=centre(part);if(part.pose){const pose=part.pose;part.pose=m=>{const q=pose(m);return {...q,at:centre(q)};};}}
  const rearward:k.Point3=[0,-84,0];
  for(const part of parts){
    const name=part.name,move=name==='case.back'||name.startsWith('clock.')||name.startsWith('train.')||name.startsWith('tape.')||(name.startsWith('gear.')&&!name.startsWith('gear.2.shoulder'))||['bell.saddle','bell.stem','bell.dome','bell.striker-arm','bell.striker','bell.trip-guide.upper'].some(id=>name===id||name.startsWith(id+'.face.'))||name.startsWith('fix.tape.')||name.startsWith('fix.drum.')||name.startsWith('fix.plate.')||name==='fix.bell';
    if(!move)continue;
    const pose=part.pose,originalAt=part.at;Object.assign(part,translatePart(part,rearward));part.layout=rearward;
    if(pose)part.pose=m=>{const q=pose(m);return {...translatePart({...q,at:q.at===part.at?originalAt:q.at},rearward),layout:rearward};};
  }
  for(const part of parts){
    if(!part.pose)continue;
    const pose=part.pose;let previous='',value:Part|undefined;
    part.pose=m=>{
      const motion=part.motion,name=part.name;
      let key:string|number=m.t;
      if(['gear','hand','release-cam'].includes(motion!))key=m.shift;
      else if(motion==='keeper')key=m.arm;
      else if(motion==='rocker')key=m.punch;
      else if(motion==='carriage')key=carriageStation(m);
      else if(motion==='lever'||name==='cycle.follower.0')key=leverAt(m).a;
      else if(motion==='release'||name==='cycle.follower.1'||name.startsWith('rack.release-link'))key=rackGateAt(m).a;
      else if(motion==='coin-gate'||name==='cycle.follower.3'||name.startsWith('punch.coin-gate.link'))key=coinGateAt(m).a;
      else if(name==='cycle.follower.4'||name.startsWith('rack.expiry-link'))key=expiryAt(m).shift;
      else if(name==='cycle.follower.2'||name.startsWith('punch.coin-latch.upper'))key=m.punch;
      else if(name.startsWith('punch.coin-latch.lower'))key=coinLatchAt(m);
      else if(name.startsWith('cycle.hold-pawl'))key=m.shift;
      else if(name.startsWith('cycle.latch'))key=`${m.shift}:${barrelCatchAt(m)}`;
      else if(name==='cycle.power-spring')key=`${m.shift}:${serviceAngle(m)}`;
      else if(name.startsWith('cycle.cam'))key=serviceAngle(m);
      else if(motion==='bell-leaf'||motion==='bell-head')key=bellShift(m);
      const next=String(key);if(value&&next===previous)return value;previous=next;return value=pose(m);
    };
  }
  return parts;
}
export const PARTS = makeGeometry();
export const HALO = k.haloOf(BASE,-18,12,P);
const unshiftedSvg = (p:Part) => p.raw ?? (p.clip?`<clipPath id="rod"><path data-hold d="${p.clip}"/></clipPath><g clip-path="url(#rod)">${k.solidSvg(p.paths,{tone:p.tone,inner:p.detail})}</g>`:k.solidSvg(p.paths,{tone:p.tone,lit:p.lit,inner:p.detail}));
export const geometrySvg=(p:Part)=>p.layout?`<g transform="${k.translateAlong(P,p.layout)}">${unshiftedSvg(p)}</g>`:unshiftedSvg(p);
export {springAt};

/** Named finite surfaces, measured against the recorded solids by contacts-check.mjs. */
export const MOUNTS = [
  ...[
    ['stand.deck','stand.plinth','bottom','top'],
    ...[0,1,2,3].map(i=>[`stand.foot.${i}`,'stand.plinth','top','bottom']),
    ...['case.back','case.cheek','case.cut-sill','case.front-sill','case.maker-plate','tape.spool-anchor','rack.foot.left','rack.foot.right','tray.0.floor','tray.1.floor','receipt.foot.left','receipt.foot.right','stash.foot'].map(p=>[p,'stand.deck','bottom','top']),
    ['case.bed','case.front-sill','bottom','top'],
    ['clock.standoff.left','case.back','start','front'],['clock.standoff.right','case.back','start','front'],
    ['clock.drum','clock.standoff.left','start','end'],['clock.drum','clock.standoff.right','start','end'],
    ['clock.bezel','clock.drum','start','end'],['clock.face','clock.bezel','start','end'],
    ['clock.hub','gear.2.shaft','bore','outer'],['clock.hand','clock.hub','start','end'],
    ['train.plate.rear','case.bed','bottom','top'],['train.plate.front','case.bed','bottom','top'],
    ['train.spacer.upper','train.plate.rear','start','end'],['train.spacer.lower','train.plate.rear','start','end'],
    ['train.plate.front','train.spacer.upper','start','end'],['train.plate.front','train.spacer.lower','start','end'],
    ...['tape','gear.0','gear.1','gear.2'].flatMap(id=>[[`${id}.bearing`,'train.plate.rear','end','start'],[`${id}.front-bearing`,'train.plate.front','start','end'],[`${id}.cap`,`${id}.front-bearing`,'start','end']]),
    ['cycle.barrel','gear.2.shaft','bore','outer'],['cycle.cam','cycle.barrel','cycle.cam@end','start'],
    ['tape.port.lower','case.cheek','bottom','hole'],['tape.port.upper','case.cheek','top','hole'],
    ['tape.feed-roll','tape.shaft','bore','outer'],['tape.pressure-roll','tape.pressure-shaft','bore','outer'],
    ['tape.bracket.-10','tape.bracket.22','tape.bracket.-10.arm@front','back'],['tape.bracket.22','case.cheek','left','right'],
    ['tape.inner-guide','tape.well','bottom','top'],['tape.well','case.bed','bottom','top'],
    ['tape.spool-bracket','tape.spool-anchor','bottom','top'],['tape.spool-upright','tape.spool-bracket','tape.spool-upright.base@bottom','top'],
    ['tape.spool.core','tape.spool-shaft','bore','outer'],['tape.spool.flange','tape.spool.core','start','end'],
    ['rack.back','rack.foot.left','bottom','top'],['rack.back','rack.foot.right','bottom','top'],
    ['rack.stile.left','rack.back','back','front'],['rack.stile.right','rack.back','back','front'],
    ...[0,1,2,3,4].map(i=>[`rack.pocket.${i}`,'rack.back','back','front']),
    ...[0,1,2,3].map(i=>[`rack.card.${i}`,`rack.pocket.${i}`,'bottom','top']),
    ['rack.top-guide','rack.pocket.4','bottom','top'],['rack.release-pivot','rack.pocket.4','start','rack.pocket.4.pivot-pad@top'],
    ['rack.expiry-guide','rack.pocket.0','back','front'],['rack.expiry-lip','rack.back','back','front'],
    ['punch.mount.left','case.bed','back','front'],['punch.mount.right','case.bed','back','front'],
    ['punch.left-foot','punch.mount.left','bottom','top'],['punch.right-foot','punch.mount.right','bottom','top'],
    ['punch.standard.left','punch.left-foot','bottom','top'],['punch.standard.right','punch.right-foot','bottom','top'],
    ['punch.bridge','punch.standard.left','left','right'],['punch.bridge','punch.standard.right','right','left'],
    ['punch.die-post','punch.bridge','top','bottom'],['punch.die','punch.die-post','start','front'],
    ['punch.sleeve-mount','punch.bridge','top','bottom'],['punch.sleeve','punch.sleeve-mount','outer','lower-profile'],['punch.gland','punch.sleeve','start','end'],
    ['punch.shoe','punch.rod','start','punch.rod@end'],['punch.spring-seat','punch.gland','start','end'],['punch.return-seat','punch.shoe','end','start'],
    ['punch.carrier','rack.stile.left','edge:0','rack.rail-cradle@edge:2'],['punch.carrier','receipt.foot.left','edge:0','receipt.rail-cradle@edge:2'],['punch.carrier-stop','punch.carrier','edge:0','edge:2'],
    ['carriage.pivot','train.plate.front','start','train.plate.front.lug@end'],
    ['keeper.boss','punch.standard.right','start','front'],['keeper.lock','keeper.boss','start','end'],
    ['keeper.key-bow','keeper.key-shaft','outer','end'],['keeper.key-bit','keeper.key-shaft','edge:3','outer'],
    ['keeper.crank','keeper.key-shaft','bore','outer'],['keeper.dog','punch.sleeve','bottom','punch.sleeve.guide.lower@top'],
    ['punch.rocker-pivot','punch.bridge','punch.rocker-pivot.bracket@back','front'],
    ['punch.cam-link','cycle.follower.2','punch.cam-link.root@hole','outer'],
    ['punch.coin-magazine','punch.standard.right','punch.coin-magazine.mount@right','left'],
    ['hopper.floor','punch.coin-magazine','left','right'],['trough.common.floor','hopper.floor','left','right'],
    ...['hopper','trough.common','chute.0','chute.1'].flatMap(id=>[[`${id}.far-wall`,`${id}.floor`,'front','back'],[`${id}.near-wall`,`${id}.floor`,'back','front']]),
    ['splitter.yoke','punch.standard.right','splitter.yoke.arm@back','front'],['splitter.vane','trough.common.floor','start','upper-profile'],
    ...[0,1].flatMap(i=>[[`chute.${i}.floor`,'trough.common.floor','left','right'],[`chute.${i}.bracket`,'stand.deck','bottom','top'],[`chute.${i}.floor`,`chute.${i}.bracket`,'lower-profile','upper-profile'],[`tray.${i}.back`,`tray.${i}.floor`,'bottom','top'],[`tray.${i}.left`,`tray.${i}.floor`,'bottom','top'],[`tray.${i}.right`,`tray.${i}.floor`,'bottom','top']]),
    ['receipt.floor','receipt.foot.left','bottom','top'],['receipt.floor','receipt.foot.right','bottom','top'],
    ...['receipt.back','receipt.left','receipt.right','receipt.front','receipt.stack'].map(p=>[p,'receipt.floor','bottom','top']),
    ['receipt.pull.left','receipt.front','back','front'],['receipt.pull.right','receipt.front','back','front'],['receipt.pull','receipt.pull.left','back','front'],['receipt.pull','receipt.pull.right','back','front'],
    ['bell.saddle','clock.drum','bottom','outer'],['bell.stem','bell.saddle','start','top'],['bell.dome','bell.stem','start','end'],['bell.striker-arm','bell.stem','left','outer'],['bell.striker','bell.striker-arm','outer','top'],
    ['stash.post','stash.foot','bottom','end'],['stash.arm','stash.post','left','right'],['stash.hook','stash.arm','start','front'],['stash.key-shank','stash.key-bow','top','outer'],['stash.key-bit','stash.key-shank','left','right'],
    ...[['maker.0','case.maker-plate'],['maker.1','case.maker-plate'],['rack.0','rack.expiry-lip'],['rack.1','rack.expiry-lip'],['tape.0','tape.spool-anchor'],['tape.1','tape.spool-anchor'],['punch.0','punch.mount.left'],['punch.1','punch.mount.right'],['bell','bell.saddle'],['stash','stash.foot'],['receipt.1','receipt.floor']].map(([id,host])=>[`fix.${id}`,host,'start','top']),
    ['fix.receipt.0','receipt.foot.left','start','edge:6'],
    ...[0,1].flatMap(i=>[[`fix.rail.${i}`,'punch.carrier','start','front'],[`fix.drum.${i}`,'case.back','start','back'],[`fix.plate.${i}`,'train.plate.front','start','front']]),
  ].map(([part,host,partFace,hostFace])=>({part,host,partFace,hostFace,kind:'fixed',active:[0,30]})),
  ...[
    ...['tape','gear.0','gear.1','gear.2'].flatMap(id=>[[`${id}.shaft`,`${id}.bearing`,'outer','bore'],[`${id}.shaft`,`${id}.front-bearing`,'outer','bore'],[id==='tape'?'tape.pinion':`${id}.wheel`,`${id}.shaft`,'bore','outer']]),
    ['tape.pressure-shaft','tape.bracket.-10','outer','bore'],['tape.pressure-shaft','tape.bracket.22','outer','hole'],
    ['tape.spool-shaft','tape.spool-upright','outer','hole'],['tape.spool-shaft','tape.spool-upright','outer','tape.spool-upright.front@hole'],
    ['rack.release-lever','rack.release-pivot','hole','outer'],['carriage.lever','carriage.pivot','hole','carriage.pivot.journal@outer'],
    ['keeper.key-shaft','keeper.boss','outer','bore'],['keeper.link','keeper.crank','hole','keeper.crank.pin@outer'],['keeper.link','keeper.dog','hole','keeper.dog.pin@outer'],
    ['punch.rod','punch.sleeve','punch.rod.inner@outer','bore'],['punch.rocker','punch.rocker-pivot','hole','outer'],
    ['punch.coin-gate','punch.coin-magazine','hole','punch.coin-gate.pivot@outer'],
    ['rack.release-link','cycle.follower.1','rack.release-link.eye.0@bore','outer'],['rack.release-link','rack.release-lever','rack.release-link.eye.1@bore','rack.release-lever.pin@outer'],
    ['punch.coin-gate.link','cycle.follower.3','punch.coin-gate.link.eye.0@bore','outer'],['punch.coin-gate.link','punch.coin-gate','punch.coin-gate.link.eye.1@bore','punch.coin-gate.pin@outer'],
    ['rack.expiry-link','cycle.follower.4','rack.expiry-link.eye.0@bore','outer'],['rack.expiry-link','rack.expiry-gate','rack.expiry-link.eye.1@bore','rack.expiry-gate.pin@outer'],
  ].map(([part,host,partFace,hostFace])=>({part,host,partFace,hostFace,kind:'journal',active:[0,30]})),
  ...[
    ['tape.paper','tape.feed-roll','edge:0','outer','tangent',0,30],['tape.paper','tape.pressure-roll','upper-profile','outer','tangent',0,30],
    ['carriage.shoe','punch.carrier','carriage.shoe@profile','profile','slide',0,30],['carriage.shoe','carriage.lever','carriage.yoke@hole','carriage.pin@outer','slide',0,30],
    ['punch.cam-link','punch.rocker','punch.cam-link.yoke@hole','punch.rocker.pin@outer','slide',0,30],
    ...[1,2,3,4].map(i=>[`cycle.follower.${i}`,'cycle.cam','outer','groove','cam',0,30]),['carriage.lever','cycle.cam','cycle.follower.0@outer','groove','cam',0,30],
    ['cycle.power-spring','gear.2.shaft','edge:481','outer','spring',0,30],['cycle.power-spring','cycle.barrel','edge:240','cycle.barrel.rim@bore','spring',0,30],
    ['cycle.release-cam','gear.2.shaft','hole','outer','journal',0,30],
    ['cycle.latch','cycle.release-cam','lead:start','outer','spring',0,30],['cycle.latch','cycle.fulcrum','profile','bore','spring',0,30],['cycle.fulcrum','carriage.pivot','cycle.fulcrum.base@lower-profile','outer','spring',0,30],
    ['cycle.hold-pawl','train.plate.front','lead:start','end','spring',0,30],['cycle.hold-pawl','gear.2.wheel','cycle.hold-pawl.tip@outer','profile','spring',0,30],
    ['punch.coin-latch','punch.standard.right','lead:start','front','spring',0,30],['punch.coin-latch','punch.return-seat','punch.coin-latch.upper@lead:end','start','spring',0,30],
    ['return-spring','punch.spring-seat','lead:start','end','spring',0,30],['return-spring','punch.return-seat','lead:end','start','spring',0,30],
    ['bell.trip-link','receipt.back','bell.trip-link.pin@outer','bell.trip-guide.lower@hole','slide',0,30],['bell.trip-link','case.cheek','profile','bell.trip-guide.upper@hole','slide',0,30],['bell.trip-link','bell.striker-arm','lead:end','back','spring',0,30],
    ['tape.paper','tape.spool.core','edge:0','outer','tangent',0,30],
    ['keeper.dog','punch.rod','back','punch.rod.rear@end','coupling',14.5,20],['keeper.dog','punch.rocker','front','punch.rocker.nose@outer','coupling',14.5,20],
    ['bell.trip-link','carriage.shoe','bell.trip-link.pin@outer','carriage.bell-ramp@profile','ramp',0,30],
    ['punch.coin-latch','punch.standard.right','punch.coin-latch.lower@lead:start','front','spring',0,30],
    ['punch.coin-latch','punch.coin-gate','punch.coin-latch.lower@lead:end','hole','spring',0,15.95],['punch.coin-latch','punch.coin-gate','punch.coin-latch.lower@lead:end','hole','spring',30,30],
    ['cycle.latch','cycle.cam','lead:end','profile','spring',0,7],['cycle.latch','cycle.cam','lead:end','profile','spring',30,30],
    ...[0,1].map(i=>[`coin.${i}`,'punch.coin-gate','outer','punch.coin-gate.stop@outer','tangent',0,17.5]),
    ['stash.key-bow','stash.hook','bore','outer','tangent',0,30],
    ['rack.expiry-gate','rack.expiry-guide','back','front','guided',0,25],['rack.expiry-gate','rack.expiry-link','rack.expiry-gate.pin@outer','rack.expiry-link.eye.1@bore','journal',25,30],
    ['punch.card','rack.top-guide','back','front','guided',0,9.5],['punch.card','carriage.shoe','bottom','carriage.seat-tab.0@top','guided',9.5,22.5],['punch.card','receipt.floor','bottom','top','guided',22.5,30],['punch.card','receipt.stack','front','back','guided',23,30],
    ['rack.expired-card','rack.expiry-guide','back','front','guided',0,29.3],
    ...[0,1].flatMap(i=>['punch.coin-magazine','hopper.floor','trough.common.floor',`chute.${i}.floor`,`tray.${i}.floor`].map(host=>[`coin.${i}`,host,'outer','profile','coin',0,30])),
  ].map(([part,host,partFace,hostFace,kind,from,to])=>({part:String(part),host:String(host),partFace:String(partFace),hostFace:String(hostFace),kind:String(kind),active:[Number(from),Number(to)]})),
];
const sources:Record<string,[string,string]>={
  'tape.paper':['external:tape','input'], 'tape.feed-roll':['tape.paper','nip'], 'tape.pressure-roll':['tape.paper','nip'], 'tape.pressure-shaft':['tape.pressure-roll','keyed'], 'tape.spool.core':['tape.paper','unwind'], 'tape.spool.flange':['tape.spool.core','keyed'], 'tape.spool-shaft':['tape.spool.core','keyed'],
  'tape.shaft':['tape.feed-roll','keyed'],'tape.pinion':['tape.shaft','keyed'],'gear.0.wheel':['tape.pinion','mesh -1:1'],'gear.1.wheel':['gear.0.wheel','mesh -1:1'],'gear.2.wheel':['gear.1.wheel','mesh -1:1'],
  'gear.0.shaft':['gear.0.wheel','keyed'],'gear.1.shaft':['gear.1.wheel','keyed'],'gear.2.shaft':['gear.2.wheel','keyed'],'clock.hub':['gear.2.shaft','keyed'],'clock.hand':['clock.hub','keyed'],
  'cycle.power-spring':['gear.2.shaft','elastic winding'],'cycle.barrel':['cycle.power-spring','elastic return'],'cycle.cam':['cycle.barrel','keyed'],'cycle.release-cam':['gear.2.shaft','keyed'],'cycle.latch':['cycle.release-cam','trip and catch'],'cycle.hold-pawl':['gear.2.wheel','elastic ratchet'],
  'carriage.lever':['cycle.cam','captured groove'],'carriage.shoe':['carriage.lever','pin in yoke'],'punch.card':['carriage.shoe','guided handoffs'],
  'rack.release-link':['cycle.follower.1','pinned link'],'rack.release-lever':['rack.release-link','pivoted gate'],'rack.expiry-link':['cycle.follower.4','pinned link'],'rack.expiry-gate':['rack.expiry-link','sliding gate'],'rack.expired-card':['rack.expiry-gate','gravity in guide'],
  'keeper.key-shaft':['external:key','input'],'keeper.key-bow':['keeper.key-shaft','keyed'],'keeper.key-bit':['keeper.key-shaft','keyed'],'keeper.crank':['keeper.key-shaft','keyed'],'keeper.link':['keeper.crank','pinned link'],'keeper.dog':['keeper.link','sliding dog'],
  'punch.cam-link':['cycle.follower.2','captured slot'],'punch.rocker':['punch.cam-link','4:12 rocker'],'punch.rod':['punch.rocker','engaged dog'],'punch.shoe':['punch.rod','keyed'],'punch.return-seat':['punch.rod','keyed'],'return-spring':['punch.return-seat','elastic return'],
  'punch.coin-latch':['punch.return-seat','trip and catch'],'punch.coin-gate.link':['cycle.follower.3','pinned link'],'punch.coin-gate':['punch.coin-gate.link','latched gate'],'coin.0':['punch.coin-gate','gravity on floors'],'coin.1':['punch.coin-gate','gravity on floors'],
  'bell.trip-link':['carriage.shoe','ramp'],'bell.striker-arm':['bell.trip-link','elastic release'],'bell.striker':['bell.striker-arm','strike'],
};
for(let i=1;i<5;i++)sources[`cycle.follower.${i}`]=['cycle.cam','captured groove'];
export const DRIVES=[...new Set(PARTS.map(p=>p.physical??p.name))].map(part=>({part,source:sources[part]?.[0]??null,relation:sources[part]?.[1]??'static'}));
