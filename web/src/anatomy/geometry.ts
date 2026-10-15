import * as k from './iso/iso-kit';
import * as G from './iso/lathe.mjs';
import { BASE, P, at, front, upright, rect, path3 } from './view';
import { springAt } from './spring';
import * as T from './iso/tube.mjs';
import { CLOCK, ERA_HOURS, DIAL_TICKS } from './model';
export interface Shape { kind: 'slab'|'prism'|'disc'|'ring'|'solid'|'ball'|'slide'|'tube'; args: unknown[]; meta?: Record<string,unknown> }
export interface Part { name:string; paths:k.SolidPaths; shape:Shape; at:k.Point3; tone:k.Tone; detail:string; lit?:boolean; motion?:string; clip?:string; raw?:string; physical?:string }
const line = (d:string,tone:k.LineTone='lo',free?:boolean) => k.lineSvg(d,{tone,free});
const dots = (points:k.Point3[],size=.5) => k.dotsSvg(points.map(at),{size,tone:'mid'});
const ring = (f:G.Frame,s:number,r:number,tone:k.LineTone='lo') => line(G.circleOf(f,s,r,P),tone);

/** Concave face prism: teeth and folded sheet profiles retain their real outline. */
function prismPaths(F:G.Frame, poly:k.Flat[], s0:number,s1:number):k.SolidPaths {
  const area=poly.reduce((n,[x,y],i)=>{const b=poly[(i+1)%poly.length];return n+x*b[1]-b[0]*y;},0);
  const q=area>0?poly:[...poly].reverse(), V=G.viewOf(P), n=q.length;
  const point=(s:number,[x,y]:k.Flat)=>G.add3(G.add3(G.add3(F.o,G.mul3(F.a,s)),G.mul3(F.u,x)),G.mul3(F.v,y));
  const low=q.map(p=>at(point(s0,p))),high=q.map(p=>at(point(s1,p)));
  const near=G.dot3(F.a,V)>0?high:low,far=near===high?low:high;
  const buckets=Array.from({length:5},()=>[] as string[]),outline:string[]=[],creases:string[]=[];
  const seen=q.map(([x,y],i)=>{const b=q[(i+1)%n];return G.dot3(G.unit3(G.add3(G.mul3(F.u,b[1]-y),G.mul3(F.v,x-b[0]))),V)>0;});
  const fill=[k.pathOf(near,true)];
  buckets[G.toneOf(near===high?F.a:G.mul3(F.a,-1),P)].push(k.pathOf(near,true));
  for(let i=0;i<n;i++){
    const j=(i+1)%n,b=q[j],a=q[i];
    const face=k.pathOf([near[i],near[j],far[j],far[i]],true);
    if(seen[i]){fill.push(face);buckets[G.toneOf(G.unit3(G.add3(G.mul3(F.u,b[1]-a[1]),G.mul3(F.v,a[0]-b[0]))),P)].push(face);creases.push(k.pathOf([near[i],near[j]]));}
    outline.push(k.pathOf(seen[i]?[far[i],far[j]]:[near[i],near[j]]));
    if(seen[i]!==seen[(i+n-1)%n])outline.push(k.pathOf([near[i],far[i]]));
  }
  return {fill:fill.join(''),outline:outline.join(''),crease:creases.join(''),top:buckets[4].join(''),shades:buckets.slice(0,4).map(a=>a.join('')) as [string,string,string,string]};
}

export function makeGeometry() {
  const parts:Part[]=[];
  const add=(name:string,paths:k.SolidPaths,shape:Shape,at:k.Point3,tone:k.Tone='mid',detail='',motion?:string,lit=false)=>{const p:Part={name,paths,shape,at,tone,detail,motion,lit};parts.push(p);return p;};
  const slab=(name:string,plan:k.Plan,z:number,h:number,tone:k.Tone='mid',detail='',motion?:string)=>add(name,k.slabOf(plan,z,h,P,6,Math.min(.8,h/3)),{kind:'slab',args:[plan,z,h]},[plan.x+plan.w/2,plan.y+plan.d/2,z+h/2],tone,detail,motion);
  const box=(name:string,x:number,y:number,z:number,w:number,d:number,h:number,tone:k.Tone='mid',detail='',motion?:string)=>slab(name,{x,y,w,d,r:Math.min(.7,w/5,d/5)},z,h,tone,detail,motion);
  const prism=(name:string,F:G.Frame,poly:k.Flat[],s0:number,s1:number,tone:k.Tone='mid',detail='',motion?:string)=>add(name,prismPaths(F,poly,s0,s1),{kind:'prism',args:[F,poly,s0,s1]},G.add3(F.o,G.mul3(F.a,(s0+s1)/2)),tone,detail,motion);
  const disc=(name:string,F:G.Frame,s0:number,s1:number,r:number,tone:k.Tone='mid',detail='',motion?:string)=>add(name,G.disc(s0,s1,r,F,P,{bevel:Math.min(.4,(s1-s0)/3)}),{kind:'disc',args:[F,s0,s1,r]},G.add3(F.o,G.mul3(F.a,(s0+s1)/2)),tone,detail,motion);
  const annulus=(name:string,F:G.Frame,s0:number,s1:number,ri:number,ro:number,tone:k.Tone='mid',detail='',motion?:string)=>add(name,G.ringBand(s0,s1,ri,ro,F,P),{kind:'ring',args:[F,s0,s1,ri,ro]},G.add3(F.o,G.mul3(F.a,(s0+s1)/2)),tone,detail,motion);
  const screws=(plan:k.Plan,z:number)=>line(k.corners(plan,5).map(([x,y])=>k.ring(x,y,1.7,z,P,20)).join(''),'lo')+dots(k.corners(plan,5).map(([x,y])=>[x,y,z]));
  const faceRules=(x:number,y:number,z:number,w:number,rows=4)=>line(Array.from({length:rows},(_,i)=>path3([[x,y,z-i*4],[x+w-(i%2)*7,y,z-i*4]])).join(''),'lo',true);

  // Plinth and fitted casting. The two missing walls are the permanent cutaway.
  for(const [i,[x,y]] of k.corners(BASE,24).entries()){
    disc(`stand.foot.${i}`,upright(x,y,-18),0,3,8,'lo');
    disc(`stand.collar.${i}`,upright(x,y,-15),0,3,6,'lo');
  }
  slab('stand.plinth',BASE,-12,10,'lo',line(k.sideSeam(BASE,-6,P,6),'faint')+screws(BASE,-2));
  const deck=k.insetPlan(BASE,3);
  slab('stand.deck',deck,-2,2,'lo',line(k.planOutline(k.insetPlan(deck,5),0,P),'faint'));
  const arch:k.Flat[]=[[-93,0],[57,0],[57,188],...Array.from({length:49},(_,i):k.Flat=>[-18+75*Math.cos(i/48*Math.PI),188+75*Math.sin(i/48*Math.PI)])];
  prism('case.back',front(0,-30,0),arch,0,5,'mid',dots([[-86,-25,14],[50,-25,14],[-86,-25,184],[50,-25,184]]));
  box('case.cheek',-93,-25,0,6,61,141,'mid',line(path3([[-87,-25,8],[-87,36,8]]),'faint'));
  box('case.cheek-upper',-93,-25,162.2,6,61,25.8,'mid');
  box('case.port-back',-93,-25,141,6,15,21.2,'mid');
  box('case.port-front',-93,25,141,6,11,21.2,'mid');
  box('case.cut-sill',51,-25,0,6,61,32,'mid',dots([[57,8,26],[57,28,26]]));
  box('case.front-sill',-87,30,0,138,6,30,'mid',faceRules(-79,36,21,28,2));
  box('case.bed',-87,-25,30,138,54,4,'lo',screws({x:-87,y:-25,w:138,d:54,r:0},34));
  box('case.front-bead',-93,36,0,6,3,188,'lo');
  disc('case.hinge.lower',upright(-90,41,38),0,14,2,'mid');
  disc('case.hinge.upper',upright(-90,41,148),0,14,2,'mid');
  box('case.latch',51,36,18,6,5,9,'mid',ring(front(54,41,22.5),0,1.6));
  const nameplate={x:-137,y:100,w:36,d:15,r:1.5};
  slab('case.maker-plate',nameplate,0,.7,'lo',line(k.planOutline(k.insetPlan(nameplate,1.7),.7,P),'faint')+k.faceTextSvg(k.topMatrix([-119,109],.7,P),'PORTALNODE',{size:2.7,anchor:'middle',tone:'lo'})+dots([[-134,107.5,.7],[-104,107.5,.7]]));

  // Shift dial: a twelve-hour face, with six longer session divisions.
  const D=front(-18,-25,190);
  disc('clock.drum',D,0,55,69,'mid',line(G.arcOf(D,5,69,P),'faint')+line(G.arcOf(D,51,69,P),'lo'));
  annulus('clock.bezel',D,55,61,54,69,'hi',line(G.ribsOf(D,56,60,69,100,P,{seams:true}),'lo'));
  disc('clock.face',D,61,62.5,54.5,'hi',ring(D,62.5,50,'mid')+ring(D,62.5,43,'faint'));
  const ticks:string[]=[],major:string[]=[],sessions:string[]=[];
  for(let i=0;i<DIAL_TICKS;i++){
    const a=i/DIAL_TICKS*Math.PI*2;const isHour=i%5===0,isSession=i%(DIAL_TICKS/CLOCK.sessionsPerEra)===0;
    const r0=isSession?43:isHour?45:47.6;
    const point=(r:number):k.Point3=>[-18+Math.sin(a)*r,37.5,190+Math.cos(a)*r];
    (isSession?sessions:isHour?major:ticks).push(path3([point(r0),point(50)]));
  }
  parts.at(-1)!.detail+=line(ticks.join(''),'lo')+line(major.join(''),'mid')+line(sessions.join(''),'hi');
  disc('clock.hub',D,62.5,64.9,3.2,'hi',ring(D,64.9,1.1));
  const crown=G.frameAlong([-93,6,184],[-1,0,0]);
  disc('clock.crown-stem',crown,0,3,3,'mid');
  disc('clock.crown',crown,3,9,5,'mid',line(G.ribsOf(crown,3,9,5,24,P,{seams:true}),'lo'));

  // Visible power train: bearings actually mount on the rear casting.
  const gears=[{x:-44,z:95,r:21,n:24},{x:-8,z:98,r:14,n:18},{x:17,z:83,r:12,n:16}];
  for(const [i,g] of gears.entries()){
    const f=front(g.x,-25,g.z);
    disc(`gear.${i}.bearing`,f,0,4,6,'lo',ring(f,4,4));
    disc(`gear.${i}.shaft`,f,4,42,2.2,'mid');
    const tooth:k.Flat[]=Array.from({length:g.n*4},(_,j)=>{const a=j/(g.n*4)*Math.PI*2;const r=j%4===1||j%4===2?g.r:g.r-2;return [Math.cos(a)*r,Math.sin(a)*r];});
    const F=front(g.x,17,g.z);
    prism(`gear.${i}.wheel`,F,tooth,0,3,'hi',ring(F,3,g.r-5,'lo')+Array.from({length:5},(_,j)=>{const a=j/5*Math.PI*2;return ring(front(g.x+Math.cos(a)*(g.r-9),20,g.z+Math.sin(a)*(g.r-9)),0,2,'faint');}).join(''));
    disc(`gear.${i}.cap`,F,3,5,3.8,'mid',ring(F,5,1.2));
  }

  // Side port, tape and rollers: the tape runs between two contacting rolls.
  box('tape.port.lower',-106,-10,141,13,35,3,'mid',dots([[-103,-5,144],[-103,20,144]]));
  box('tape.port.upper',-106,-10,159.2,13,35,3,'mid');
  for(const y of [-10,22])box(`tape.bracket.${y}`,-100,y,144,5,3,15.2,'mid');
  const roll=G.frameAlong([-97,-7,148],[0,1,0]);
  disc('tape.feed-roll',roll,0,29,4,'mid',line(G.ribsOf(roll,0,29,4,18,P,{seams:true}),'lo'));
  disc('tape.pressure-roll',G.frameAlong([-97,-7,155.8],[0,1,0]),0,29,3.4,'mid');
  slab('tape.paper',{x:-140,y:-4,w:47,d:23,r:.3},152,.3,'hi',line(k.planOutline({x:-138,y:-1,w:43,d:17,r:0},152.3,P),'faint'),'tape');
  const spool=front(-140,-6,141);
  box('tape.spool-anchor',-144,-25,122,51,19,4,'lo');
  box('tape.spool-bracket',-144,-25,126,7,19,8,'lo');
  box('tape.spool-upright',-144,-9,134,7,3,7,'lo');
  disc('tape.spool.core',spool,0,28,11,'mid',ring(spool,28,4));
  disc('tape.spool.flange',spool,28,29.3,13,'mid',ring(spool,29.3,10,'lo')+ring(spool,29.3,2,'mid'));

  // Rack: folded pockets and real cards; the open bottom is the expiry path.
  box('rack.foot.left',86,21,0,10,27,8,'lo');
  box('rack.foot.right',127,21,0,10,27,8,'lo');
  box('rack.back',86,24,8,51,4,190,'mid',line(path3([[90,28,8],[90,28,198]])+path3([[133,28,8],[133,28,198]]),'faint')+dots([[91,28,193],[132,28,193],[91,28,14],[132,28,14]]));
  box('rack.stile.left',86,28,8,3,18,190,'mid');
  box('rack.stile.right',134,28,8,3,18,190,'mid');
  for(let i=0;i<5;i++){
    const z=25+i*35;
    box(`rack.pocket.${i}`,89,28,z,45,14,2,'mid',line(path3([[89,42,z+2],[134,42,z+2]]),'lo'));
    if(i<4)box(`rack.card.${i}`,94,30,z+2,30,.7,30,'hi',faceRules(98,30.7,z+27,22,4));
  }
  box('rack.top-guide',89,28,190,45,7,2,'mid');
  box('rack.expiry-lip',89,28,8,45,16.2,2,'lo');
  box('rack.expired-card',94,42.2,10,30,.7,30,'lo',faceRules(98,42.9,36,22,3),'expired');

  // Front-mounted C-frame leaves a paper path down into the receipt drawer.
  box('punch.mount.left',-16,30,30,8,25,4,'lo');
  box('punch.mount.right',30,30,30,8,25,4,'lo');
  box('punch.left-foot',-16,49,34,8,46,4,'lo');
  box('punch.right-foot',30,49,34,8,46,4,'lo');
  box('punch.standard.left',-16,49,38,6,46,89,'mid',dots([[-10,91,44],[-10,91,121]]));
  box('punch.standard.right',32,87,38,6,8,89,'mid');
  box('punch.bridge',-10,87,121,42,8,6,'mid',screws({x:-10,y:87,w:42,d:8,r:0},127));
  box('punch.die-post',-8,50,34,36,4,87,'mid');
  box('punch.die',-8,54,84,36,4,36,'hi',ring(front(10,58,103),0,2.8));
  box('punch.card-stop',-8,58,82,36,4,2,'mid');
  box('punch.guide.left',-8,58,84,2,4,33,'mid');
  box('punch.guide.right',26,58,84,2,4,33,'mid');
  const sleeve=G.frameAlong([10,90,103],[0,-1,0]);
  disc('punch.sleeve',sleeve,0,12,6,'mid',line(G.ribsOf(sleeve,1,11,6,20,P,{seams:true}),'lo'));
  annulus('punch.gland',sleeve,12,14,1.6,6.8,'hi');
  box('punch.sleeve-mount',4,87,109,12,8,12,'mid');
  const rod=G.rodOut(sleeve,14,25,1.6,P,{stroke:5.35});
  add('punch.rod',rod.paths,{kind:'slide',args:[sleeve,14,25,1.6]},[10,70.5,103],'hi','','ram').clip=rod.clip;
  disc('punch.shoe',sleeve,25,26,3.8,'hi',ring(sleeve,26,2),'ram');
  // Separate washers show the spring seats; the live coil is drawn between them.
  annulus('punch.spring-seat',sleeve,14,14.8,1.6,3.8,'mid');
  annulus('punch.return-seat',sleeve,24.2,25,1.6,3.8,'mid','', 'ram');

  box('punch.card',-5,58,84,30,.65,36,'hi',faceRules(0,58.65,115,20,4),'card').lit=true;
  box('punch.carrier',28,49,80,106,5,4,'mid',line(k.sideSeam({x:28,y:49,w:106,d:5,r:.7},82,P,6),'faint'));
  box('punch.carrier-stop',130,49,84,4,7,5,'mid');

  // The keeper's small key is separate from the external stash hook.
  const lock=front(40,36,19);
  disc('keeper.boss',lock,0,7,9,'mid',ring(lock,7,6.5));
  disc('keeper.lock',lock,7,9,6.5,'hi',ring(lock,9,4.8));
  disc('keeper.key-shaft',lock,9,19,1.4,'hi');
  annulus('keeper.key-bow',front(40,55,13),0,1.6,3.8,6,'hi','', 'key');
  box('keeper.key-bit',39,51,16,4,4,2,'hi','', 'key');

  // Two real gravity chutes, both fed by one punch-driven splitter.
  disc('splitter.foot',upright(10,105,0),0,3,8,'lo');
  disc('splitter.post',upright(10,105,3),0,64,3,'mid');
  prism('splitter.head',front(10,100,0),[[-5,67],[5,67],[0,77]],0,10,'hi');
  for(const [i,endX] of [-66,79].entries()){
    const start:k.Point3=[i===0?3:17,105,69],end:k.Point3=[endX,113,13];
    const v=G.unit3(G.sub3(end,start)),u=G.unit3([v[1],-v[0],0]),a=G.unit3(G.cross3(u,v));
    const f=G.frameOf(start,a,u,v),len=Math.hypot(...G.sub3(end,start));
    prism(`chute.${i}.floor`,f,rect(-7,0,7,len),-1.2,0,'mid');
    prism(`chute.${i}.back-rail`,f,rect(-8,0,-7,len),-1.2,4,'mid');
    prism(`chute.${i}.front-rail`,f,rect(7,0,8,len),-1.2,2,'hi');
    const tray={x:endX-24,y:87,w:48,d:40,r:3};
    slab(`tray.${i}.floor`,tray,0,2,'lo',line(k.planOutline(k.insetPlan(tray,3),2,P),'faint'));
    box(`tray.${i}.back`,tray.x,87,2,48,2,9,'mid');
    box(`tray.${i}.left`,tray.x,89,2,2,36,9,'mid');
    box(`tray.${i}.right`,tray.x+46,89,2,2,36,9,'mid');
    box(`tray.${i}.front`,tray.x,125,2,48,2,9,'mid',dots([[tray.x+5,127,7],[tray.x+43,127,7]]));
    const support=G.add3(end,G.mul3(u,-7*Math.sign(u[1])));
    box(`chute.${i}.bracket`,support[0]-2,support[1]-1.5,2,4,3,10,'lo');
    disc(`coin.${i}`,upright(endX,119.5,2),0,1.3,5.3,'hi',line(k.ring(endX,119.5,3.9,3.3,P),'lo'),'coin'+i);
  }

  // A genuine open receipt drawer, with a pull and punched paper.
  box('receipt.floor',-8,61,0,36,23,4,'lo');
  box('receipt.back',-8,61,4,36,2,24,'mid');
  box('receipt.left',-8,63,4,2,19,24,'mid');
  box('receipt.right',26,63,4,2,19,24,'mid');
  box('receipt.front',-8,82,4,36,2,24,'mid',line(k.sideSeam({x:-8,y:82,w:36,d:2,r:.4},8,P,6),'faint'));
  box('receipt.pull.left',2,84,15,2,4,3,'mid');
  box('receipt.pull.right',16,84,15,2,4,3,'mid');
  box('receipt.pull',2,88,15,16,2,3,'hi');
  box('receipt.stack',-4,65,4,28,4,27,'lo',faceRules(0,69,27,20,3));

  // Bell: an analytic dome avoids stepped tone bands on its curved shoulder.
  disc('bell.stem',upright(-18,0,259),0,8,2,'mid');
  const bf=upright(-18,0,267),radius=(s:number)=>12*Math.sqrt(Math.max(0,1-(s/10)**2));
  const profile=Array.from({length:31},(_,i)=>[i/3,radius(i/3),1]);
  add('bell.dome',G.solidOf(profile,bf,P,{smooth:{radius,slope:(s:number)=>-1.2*(s/10)/Math.sqrt(Math.max(1e-8,1-(s/10)**2))}}),{kind:'solid',args:[bf,profile],meta:{radius}},[-18,0,272],'hi',ring(bf,0,12));
  box('bell.striker-arm',-16,-1,264,12.5,2,2,'mid');
  add('bell.striker',G.sphereOf([-3.5,0,268],2,P),{kind:'ball',args:[[-3.5,0,268],2]},[-3.5,0,268],'hi','', 'bell');

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
  annulus('stash.key-bow',front(-110,31,72.4),0,2,4.3,7,'hi');
  box('stash.key-shank',-112,31,40.4,4,2,25,'hi');
  prism('stash.key-bit',front(0,31,0),[[-108,40.4],[-100,40.4],[-100,44.4],[-103,44.4],[-103,47.4],[-100,47.4],[-100,50.4],[-108,50.4]],0,2,'hi');
  return parts;
}
export const PARTS = makeGeometry();
export const HALO = k.haloOf(BASE,-18,12,P);
export const geometrySvg = (p:Part) => p.raw ?? (p.clip?`<clipPath id="rod"><path data-hold d="${p.clip}"/></clipPath><g clip-path="url(#rod)">${k.solidSvg(p.paths,{tone:p.tone,inner:p.detail})}</g>`:k.solidSvg(p.paths,{tone:p.tone,lit:p.lit,inner:p.detail}));
export {springAt};
