import * as k from './iso/iso-kit';
import * as G from './iso/lathe.mjs';
import { P, at, front, path3 } from './view';
import { ease, type ClockModel } from './model';
import { carriageAt, coinAt, bellShift, keeperAt, expiryAt } from './mechanics';
export const INITIAL_TIME = 0;
export function cardOffset(m:ClockModel):k.Point3 {
  const c=carriageAt(m);
  if(m.t<10)c[2]+=24*(1-ease(.1,1,m.drop));
  if(m.t>=20){c[1]+=8*ease(22,22.5,m.t)+3.35*ease(22.5,23,m.t);c[2]=Math.max(100,c[2]);}
  if(m.t>=23){c[0]=-90;c[1]=99.35;c[2]=100;}
  return G.sub3(c,[10,88,131]);
}
export function offsets(m:ClockModel):Record<string,k.Point3>{
  return {dog:[keeperAt(m).dog-10,-5.35*m.punch,0],'punch-cam':[(4*5.35/12)*m.punch,0,0],carriage:G.sub3(carriageAt(m),[110,88,166]),card:cardOffset(m),ram:[0,-5.35*m.punch,0],expired:[0,0,30*(1-Math.max(0,(m.expiry-.011667)/.988333))],trip:[bellShift(m),0,0],tape:[0,0,0],'expiry-gate':[0,expiryAt(m).shift,0]};
}
export function needleAt(m:ClockModel){
  const a=m.shift*Math.PI*2;
  return path3([[8-Math.sin(a)*7,37.55,172-Math.cos(a)*7],[8+Math.sin(a)*40,37.55,172+Math.cos(a)*40]]);
}
export function keyPaths(m:ClockModel){
  const a=m.arm*Math.PI/2;
  const point=(x:number,z:number):k.Flat=>[40+(x-40)*Math.cos(a)-(z-19)*Math.sin(a),19+(x-40)*Math.sin(a)+(z-19)*Math.cos(a)];
  const c=point(40,13);
  return {bow:G.ringBand(0,1.6,3.8,6,front(c[0],55,c[1]),P),bit:G.prismOf(front(0,51,0),[[39,16],[43,16],[43,18],[39,18]].map(([x,z])=>point(x,z)),0,4,P)};
}
export function coinPaths(m:ClockModel,i:number){
  const coin=coinAt(m,i),F=front(...coin.p);
  return {paths:G.disc(-.65,.65,5.3,F,P),detail:k.lineSvg(G.circleOf(F,.65,3.9,P),{tone:'lo'}),F};
}
export function holeAt(m:ClockModel){
  const d=cardOffset(m);return G.circleOf(front(10+d[0],88.68+d[1],148+d[2]),0,1.6,P);
}
export const screenOffset=(p:k.Point3)=>{const o=at([0,0,0]),a=at(p);return [a[0]-o[0],a[1]-o[1]];};
export { latchRoutes, barrelLatchPoints, holdPawlPoints, tripPoints, tripRadius, tripGaps, latchGaps } from './mechanics';
