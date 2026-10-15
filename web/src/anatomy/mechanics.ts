import * as k from './iso/iso-kit';
import * as G from './iso/lathe.mjs';
import { ease, modelAt, type ClockModel } from './model';
import { front } from './view';
declare module './iso/lathe.mjs' { export function fillet(points:k.Point3[],radius:number):k.Point3[]; }
export const TRAIN=[{name:'tape.pinion',x:-64,z:136,sign:-1,phase:0},{name:'gear.0.wheel',x:-28,z:136,sign:1,phase:Math.PI/24},{name:'gear.1.wheel',x:8,z:136,sign:-1,phase:0},{name:'gear.2.wheel',x:8,z:172,sign:1,phase:Math.PI/24}];
export const TEETH=24, PITCH=18, TAPE_PITCH=2*Math.PI*4/720;
export const gearAngle=(i:number,m:ClockModel)=>TRAIN[i].phase+TRAIN[i].sign*m.shift*Math.PI*2;
export const turnFrame=(x:number,y:number,z:number,a:number)=>G.frameOf([x,y,z],[0,1,0],[Math.cos(a),0,Math.sin(a)],[-Math.sin(a),0,Math.cos(a)]);
export function toothed():k.Flat[]{
 const base=PITCH*Math.cos(Math.PI/9),root=PITCH-1.875,tip=PITCH+1.5;
 const inv=(r:number)=>{const a=Math.acos(Math.min(1,base/r));return Math.tan(a)-a;};
 const half=Math.PI/(2*TEETH),pitchInv=inv(PITCH),points:k.Flat[]=[];
 for(let i=0;i<TEETH;i++){
  const centre=i*Math.PI*2/TEETH;
  for(const [r,sign] of [[root,-1],[base,-1],[17.5,-1],[18,-1],[18.75,-1],[tip,-1],[tip,1],[18.75,1],[18,1],[17.5,1],[base,1],[root,1]]){
   const a=centre+sign*(half+pitchInv-inv(Math.max(base,r)));points.push([r*Math.cos(a),r*Math.sin(a)]);
  }
 }
 return points;
}
/** Opposite winding makes an actual bore in both the rendered and recorded polygon. */
export function bored(outline:k.Flat[],holes:{x:number,z:number,r:number}[]):k.Flat[]{
 const result=[...outline];
 for(const h of holes){const bridge=result.at(-1)!;const rim=Array.from({length:49},(_,i):k.Flat=>[h.x+h.r*Math.cos(-i/48*2*Math.PI),h.z+h.r*Math.sin(-i/48*2*Math.PI)]);result.push(...rim,bridge);}
 return Object.assign(result,{outline,voids:holes.map(h=>Array.from({length:48},(_,i):k.Flat=>[h.x+h.r*Math.cos(i/48*2*Math.PI),h.z+h.r*Math.sin(i/48*2*Math.PI)]))});
}
export const railStart:k.Point3=[-90,88,100],railEnd:k.Point3=[110,88,166];
export const railU=G.unit3(G.sub3(railEnd,railStart)),railN:k.Point3=[-railU[2],0,railU[0]],railLength=Math.hypot(...G.sub3(railEnd,railStart));
export const LEVER:k.Point3=[8,74,162],LEVER_LENGTH=128;
export function carriageStation(m:ClockModel){return (1-.5*m.draw-.5*ease(20,22.5,m.t))*(1-ease(28,30,m.t))+ease(28,30,m.t);}
export function carriageAt(m:ClockModel){return G.add3(railStart,G.mul3(G.sub3(railEnd,railStart),carriageStation(m)));}
export function leverAt(m:ClockModel){
 const c=carriageAt(m),q=G.dot3(G.sub3(c,LEVER),railU)+.3-.6*ease(7,7.3,m.t)+.6*ease(27.7,28,m.t),h=Math.sqrt(LEVER_LENGTH**2-q*q);
 const pin=G.add3(LEVER,G.add3(G.mul3(railU,q),G.mul3(railN,-h)));
 const a=Math.atan2(pin[2]-LEVER[2],pin[0]-LEVER[0]);
 return {pin,a,slot:G.dot3(G.sub3(pin,c),railN),follower:G.add3(LEVER,[-3*Math.cos(a),0,-3*Math.sin(a)])};
}
export const serviceAngle=(m:ClockModel)=>{const t=Math.max(0,Math.min(23,m.t-7)),travel=t<.25?2*t*t:t>22.75?22.75-2*(23-t)**2:t-.125;return 2*Math.PI*travel/22.75;};
export const camFrame=(m:ClockModel)=>turnFrame(8,66.2,172,serviceAngle(m));
export const railFrame=G.frameOf(railStart,[0,1,0],railU,railN);
export const dialFrame=front(8,-17,172);

// Coins roll on edge. Every piece shares its endpoint height and tangent.
export const PAYOUT={magazine:[10,22,80,68,-1,-1],hopper:[22,36,68,58,-1,-.5],common:[36,50,58,51,-.5,-.5],branches:[[50,100,51,2,-.5,0],[50,148,51,2,-.5,0]]} as const;
export function floorAt(segment:readonly number[],x:number){
 const [a,b,z0,z1,d0,d1]=segment,h=b-a,t=Math.max(0,Math.min(1,(x-a)/h));
 const z=(2*t**3-3*t*t+1)*z0+(t**3-2*t*t+t)*h*d0+(-2*t**3+3*t*t)*z1+(t**3-t*t)*h*d1;
 const slope=((6*t*t-6*t)*z0+(3*t*t-4*t+1)*h*d0+(-6*t*t+6*t)*z1+(3*t*t-2*t)*h*d1)/h;
 return {z,slope};
}
export const floorProfile=(s:readonly number[],thickness=1.2):k.Flat[]=>{
 const top=Array.from({length:33},(_,i):k.Flat=>{const x=s[0]+(s[1]-s[0])*i/32;return [x,floorAt(s,x).z];});
 return [...top,...[...top].reverse().map(([x,z]):k.Flat=>[x,z-thickness])];
};
export function coinRoute(i:number){
 const segments=[PAYOUT.magazine,PAYOUT.hopper,PAYOUT.common,PAYOUT.branches[i]];
 return [...segments.flatMap((s,j)=>Array.from({length:33},(_,n)=>{const x=s[0]+(s[1]-s[0])*n/32,{z,slope}=floorAt(s,x),r=5.3/Math.hypot(1,slope);return {p:[x-r*slope,i===0?112.35:117.65,z+r] as k.Point3,host:j===0?'punch.coin-magazine':j===1?'hopper.floor':j===2?'trough.common.floor':`chute.${i}.floor`};})),{p:[i===0?116.7:162.7,i===0?112.35:117.65,7.3] as k.Point3,host:`tray.${i}.floor`}];
}
const COIN_ROUTES=[coinRoute(0),coinRoute(1)];
export function coinAt(m:ClockModel,i:number){
 const q=Math.max(0,Math.min(1,(m.coin-(i===0?.03:.1))/(i===0?.97:.9))),route=COIN_ROUTES[i];
 const lengths=route.slice(1).map((p,j)=>Math.hypot(...G.sub3(p.p,route[j].p))),total=lengths.reduce((a,b)=>a+b,0);let remaining=q*total;
 for(let j=0;j<lengths.length;j++){if(remaining<=lengths[j]||j===lengths.length-1){const f=lengths[j]?remaining/lengths[j]:0;return {p:G.add3(route[j].p,G.mul3(G.sub3(route[j+1].p,route[j].p),f)),host:route[j+1].host,angle:q*total/5.3};}remaining-=lengths[j];}
 return {p:route[0].p,host:route[0].host,angle:0};
}
export function band(points:k.Flat[],radius:number,closed=false):k.Flat[]{
 const sides=[-1,1].map(sign=>points.map(([x,z],i):k.Flat=>{
   const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)];
   const prev=closed?points[(i+points.length-1)%points.length]:a,next=closed?points[(i+1)%points.length]:b;
   const dx=next[0]-prev[0],dz=next[1]-prev[1],length=Math.hypot(dx,dz)||1;
   return [x-sign*radius*dz/length,z+sign*radius*dx/length];
 }));
 return [...sides[0],...(closed?[sides[0][0],sides[1][0]]:[]),...sides[1].reverse()];
}
export function cutLoops(outline:k.Flat[],holes:k.Flat[][]){
 const result=[...outline];
 for(const hole of holes){const bridge=result.at(-1)!;result.push(...hole,hole[0],bridge);}
 return Object.assign(result,{outline,voids:holes});
}
export const circle=(r:number,n=96):k.Flat[]=>Array.from({length:n},(_,i):k.Flat=>[r*Math.cos(i/n*2*Math.PI),r*Math.sin(i/n*2*Math.PI)]);
export const resetAt=(m:ClockModel)=>1-ease(28,30,m.t);
export const camLaws=[(m:ClockModel)=>rackGateAt(m).follower[0]-8,(m:ClockModel)=>14+(4*5.35/12)*m.punch,(m:ClockModel)=>8-coinGateAt(m).follower[0],(m:ClockModel)=>expiryAt(m).follower[0]-8];
export const camGrooves=[
 Array.from({length:460},(_,i):k.Flat=>{const m=modelAt(7+23*i/460),p=leverAt(m).follower,a=-serviceAngle(m),x=p[0]-8,z=p[2]-172;return [x*Math.cos(a)-z*Math.sin(a),x*Math.sin(a)+z*Math.cos(a)];}),
 ...camLaws.map((law,j)=>Array.from({length:144},(_,i):k.Flat=>{const m=modelAt(7+23*i/144),a=-serviceAngle(m)+(j===2?Math.PI:0),r=law(m);return [r*Math.cos(a),r*Math.sin(a)];}))
];
const notchAngle=Math.asin(.4/21);
const camRim:k.Flat[]=[...Array.from({length:129},(_,i):k.Flat=>{const a=notchAngle+(2*Math.PI-2*notchAngle)*i/128;return [21*Math.cos(a),21*Math.sin(a)];}),[20.4,-.4],[20.4,.4]];
export const camOutline=cutLoops(camRim,[circle(6.2).reverse(),...camGrooves.map((p,i)=>band(p,i===0?.58:.23,true).reverse())]);
camOutline.voids=[circle(6.2),...camGrooves.flatMap((p,i)=>{const r=i===0?.58:.23,mid=p.length/2;return [band(p.slice(0,mid+2),r),band([...p.slice(mid-1),...p.slice(0,2)],r)];})];
export function powerSpring(m:ClockModel){
 const phi=serviceAngle(m),turns=6*Math.PI+m.shift*2*Math.PI-phi;
 return band(Array.from({length:241},(_,i):k.Flat=>{const q=i/240,r=2.45+q*3.1,a=phi+(1-q)*turns;return [r*Math.cos(a),r*Math.sin(a)];}),.25);
}
export function bellShift(m:ClockModel){
 if(m.t<22.5)return -.8*ease(0,1,Math.max(0,Math.min(1,(-87-carriageAt(m)[0])/3)));
 return -.8*(1-ease(24,24.8,m.t))+.6*Math.abs(m.bell);
}
export const tripPoints=G.fillet([[-108,88,102],[-108,-98,102],[-108,-98,246],[21.8,-98,246],[21.8,-98,249.43],[21.8,-84.3,249.43]],1.2) as k.Point3[];
export const tripRadius=(t:number)=>.4-.2*Math.max(0,(t-.98)/.02);
export const tripRamp=(()=>{
 const q=Array.from({length:41},(_,i):k.Flat=>{const u=i/40;return [-21+3*u-.8*ease(0,1,u),1.01+.99*u];});
 return [[-16,0] as k.Flat,...band(q,.6).slice(0,q.length),[-14,0] as k.Flat];
})();
export function capsule(x0:number,x1:number,y:number,r:number):k.Flat[]{
 return [...Array.from({length:25},(_,i):k.Flat=>[x1+r*Math.cos(-Math.PI/2+i/24*Math.PI),y+r*Math.sin(-Math.PI/2+i/24*Math.PI)]),...Array.from({length:25},(_,i):k.Flat=>[x0+r*Math.cos(Math.PI/2+i/24*Math.PI),y+r*Math.sin(Math.PI/2+i/24*Math.PI)])];
}
export const keeperAngle=(m:ClockModel)=>m.arm*Math.PI/2;
export function keeperAt(m:ClockModel){
 const a=keeperAngle(m),crank:k.Point3=[35+8*Math.cos(a),111,142+8*Math.sin(a)],pin:k.Point3=[crank[0]-Math.sqrt(17**2-(150-crank[2])**2),111,150];
 return {a,crank,pin,dog:pin[0]-8,bow:[35+6*Math.sin(a),117,142-6*Math.cos(a)] as k.Point3};
}
export const rockerAngle=(m:ClockModel)=>Math.asin(5.35*m.punch/12);
export function rockerAt(m:ClockModel){const a=rockerAngle(m);return {a,nose:[22-12*Math.cos(a),135-12*Math.sin(a),148] as k.Point3,pin:[22+4*Math.sin(a),135-4*Math.cos(a),172] as k.Point3};}
export function rackGateAt(m:ClockModel){
 const a=-.16*ease(0,.1,m.drop)*resetAt(m),pin:k.Point3=[90+3*Math.sin(a),86-3*Math.cos(a),191];
 return {a,pin,follower:[pin[0]-Math.sqrt(70.5**2+8.5**2-(pin[1]-74.5)**2),74.5,172] as k.Point3};
}
export function coinGateAt(m:ClockModel){
 const a=.4*Math.min(1,m.coin/.03)*resetAt(m),pin:k.Point3=[25-1.5*Math.sin(a),95,77-1.5*Math.cos(a)];
 const follower:k.Point3=[pin[0]-Math.sqrt(34**2+96.5**2-(172-pin[2])**2),105,172];
 const x=19.548-25,z=83.748-77;
 return {a,pin,follower,bar:[25+x*Math.cos(a)+z*Math.sin(a),99,77-x*Math.sin(a)+z*Math.cos(a)] as k.Point3};
}
export function expiryAt(m:ClockModel){
 const shift=3*Math.min(1,m.expiry*20)*resetAt(m),pin:k.Point3=[109,60+shift,39];
 return {shift,pin,follower:[109-Math.sqrt(81**2+14.5**2-(pin[1]-74.5)**2),74.5,172] as k.Point3};
}
export const coinLatchAt=(m:ClockModel)=>ease(15.95,16,m.t)*(1-ease(29.9,30,m.t));
export function latchRoutes(m:ClockModel):k.Point3[][]{
 const stroke=5.35*m.punch;
 return [G.fillet([[35,98,80],[35,100,80],[26,100,100],[18,100,135],[18,100,156],[10,96.8-stroke,156],[10,96.8-stroke,153.2],[10,95.8-stroke,153.2]],.8),G.fillet([[35,98,78],[35,100,78],[26,100,78],[23.5,101,78.5],[23.5,96.6+1.4*coinLatchAt(m),78.5]],.8)] as k.Point3[][];
}
export function rotateBetween(from:k.Point3,to:k.Point3,p:k.Point3):k.Point3{
 const a=G.unit3(from),b=G.unit3(to),v=G.cross3(a,b),c=G.dot3(a,b);
 return G.add3(G.add3(p,G.cross3(v,p)),G.mul3(G.cross3(v,G.cross3(v,p)),1/(1+c)));
}
export const barrelCatchAt=(m:ClockModel)=>ease(7,7.08,m.t)*(1-ease(29.92,30,m.t));
export const releaseCamFollower=(m:ClockModel)=>{const a=m.shift*2*Math.PI,cx=1.2*Math.cos(a),z=1.2*Math.sin(a);return 8+cx+Math.sqrt(5**2-z*z);};
export function barrelLatchPoints(m:ClockModel):k.Point3[]{
 const x=releaseCamFollower(m),tip=28.4+1.1*barrelCatchAt(m);
 return G.fillet([[x,58,172],[x+2,58,172],[x+2,60.5,172],[21,54.25,166],[28,54.25,164.85],[31.5,54.25,164.85],[31.5,60,168],[31,69,172],[31,67.2,172],[tip,67.2,172]],.8);
}
function routeInterval(points:k.Point3[],ends:k.Point3[]):number[]{
 return ends.map(end=>{let walked=0,best=Infinity,at=0;for(let i=1;i<points.length;i++){const a=points[i-1],v=G.sub3(points[i],a),length=Math.hypot(...v),q=Math.max(0,Math.min(1,G.dot3(G.sub3(end,a),v)/(length*length))),gap=Math.hypot(...G.sub3(end,G.add3(a,G.mul3(v,q))));if(gap<best){best=gap;at=walked+q*length;}walked+=length;}if(best>1e-6)throw new Error('Guide does not lie on its wire');return at;});
}
export const latchGaps=(m:ClockModel)=>[routeInterval(barrelLatchPoints(m),[[28.3,54.25,164.85],[29.7,54.25,164.85]])];
export const tripGaps=[routeInterval(tripPoints,[[-108,-98,173.4],[-108,-98,178.6]])];
const gearProfile=toothed();
export function holdPawlTip(m:ClockModel){
 const a=gearAngle(3,m),poly=gearProfile.map(([x,z])=>[x*Math.cos(a)-z*Math.sin(a),x*Math.sin(a)+z*Math.cos(a)]);
 const distance=(x:number,z=0)=>{let d=Infinity,inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){
   const [ax,az]=poly[j],[bx,bz]=poly[i],dx=bx-ax,dz=bz-az,q=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz)));
   d=Math.min(d,Math.hypot(x-ax-q*dx,z-az-q*dz));if((az>z)!==(bz>z)&&x<ax+(z-az)*dx/dz)inside=!inside;
 }return inside?-d:d;};
 let lo=14,hi=21;for(let i=0;i<26;i++){const x=(lo+hi)/2;if(distance(x)<.25)lo=x;else hi=x;}
 return (lo+hi)/2+8;
}
export const holdPawlPoints=(m:ClockModel):k.Point3[]=>{const x=holdPawlTip(m);return G.fillet([[15,-56,179],[15,-54,179],[30,-54,176],[30,-96,172],[30,-98.5,172],[x,-98.5,172]],.8);};

// Split the exact annular islands at radial seams so their faces stay cheap to draw and audit.
const polarAngle=([x,z]:k.Flat)=>(Math.atan2(z,x)+2*Math.PI)%(2*Math.PI);
function radialPoint(poly:k.Flat[],angle:number):k.Flat{
 const x=Math.cos(angle),z=Math.sin(angle);
 for(let i=0;i<poly.length;i++){
  const a=poly[i],b=poly[(i+1)%poly.length],dx=b[0]-a[0],dz=b[1]-a[1],den=x*dz-z*dx;
  if(Math.abs(den)<1e-10)continue;
  const r=(a[0]*dz-a[1]*dx)/den,t=(a[0]*z-a[1]*x)/den;
  if(r>0&&t>=-1e-8&&t<=1+1e-8)return [r*x,r*z];
 }
 throw new Error('Cam boundary is not star shaped');
}
const grooveEdges=camGrooves.flatMap((p,i)=>{const outline=band(p,i===0?.58:.23,true),a=outline.slice(0,p.length),b=outline.slice(-p.length).reverse();return [a,b].sort((a,b)=>a.reduce((n,p)=>n+Math.hypot(...p),0)/a.length-b.reduce((n,p)=>n+Math.hypot(...p),0)/b.length);});
const camEdges=[circle(6.2),...grooveEdges,camRim];
export const annularSectors=(inner:k.Flat[],outer:k.Flat[],count=8)=>Array.from({length:count},(_,sector)=>{
 const start=(sector+.5)*2*Math.PI/count,end=start+2*Math.PI/count;
 const angles=[start,...[...inner,...outer].map(polarAngle).map(a=>a<start?a+2*Math.PI:a).filter(a=>a>start+1e-8&&a<end-1e-8),end].sort((a,b)=>a-b).filter((a,i,all)=>!i||a-all[i-1]>1e-8);
 const points=[...angles.map(a=>radialPoint(outer,a)),...[...angles].reverse().map(a=>radialPoint(inner,a))];
 return Object.assign(points,{interior:[angles.length-1,points.length-1]});
});
export const camSectors=Array.from({length:6},(_,ring)=>annularSectors(camEdges[2*ring],camEdges[2*ring+1],32)).flat();
