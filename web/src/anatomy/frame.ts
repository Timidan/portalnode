import * as k from './iso/iso-kit';
import * as G from './iso/lathe.mjs';
import { P, at, front, path3 } from './view';
import { ease, type ClockModel } from './model';
export const INITIAL_TIME = 12.8;
export function cardOffset(m:ClockModel):k.Point3 {
  if(m.t<10)return [98,-14,104-24*m.drop];
  if(m.t<20)return [98*(1-ease(10.7,11.6,m.t)),-14*(1-ease(10,10.7,m.t)),80*(1-ease(11.6,12.5,m.t))];
  return [0,5*ease(20,20.7,m.t),-80*ease(20.7,23,m.t)];
}
export function offsets(m:ClockModel):Record<string,k.Point3>{
  return {card:cardOffset(m),ram:[0,-5.35*m.punch,0],expired:[40*ease(25.5,26,m.t),5*ease(25,25.5,m.t)+100*ease(26,26.8,m.t),-30*ease(26.8,27.5,m.t)],bell:[m.bell*.6,0,0],tape:[0,0,0]};
}
export function needleAt(m:ClockModel){
  const a=m.shift*Math.PI*2;
  return path3([[-18-Math.sin(a)*7,37.55,190-Math.cos(a)*7],[-18+Math.sin(a)*40,37.55,190+Math.cos(a)*40]]);
}
export function keyPaths(m:ClockModel){
  const a=m.arm*Math.PI/2;
  const point=(x:number,z:number):k.Flat=>[40+(x-40)*Math.cos(a)-(z-19)*Math.sin(a),19+(x-40)*Math.sin(a)+(z-19)*Math.cos(a)];
  const c=point(40,13);
  return {bow:G.ringBand(0,1.6,3.8,6,front(c[0],55,c[1]),P),bit:G.prismOf(front(0,51,0),[[39,16],[43,16],[43,18],[39,18]].map(([x,z])=>point(x,z)),0,4,P)};
}
export function coinPaths(m:ClockModel,i:number){
  const endX=i===0?-66:79,start:k.Point3=[i===0?3:17,105,69],end:k.Point3=[endX,113,13];
  const t=ease(i===0?17.5:18.1,i===0?20.2:20.8,m.t);
  const v=G.unit3(G.sub3(end,start)),u=G.unit3([v[1],-v[0],0]),normal=G.unit3(G.cross3(u,v));
  const q=Math.min(1.08,t/.85*1.08),fall=ease(.85,1,t);
  const p=G.add3(G.add3(start,G.mul3(G.sub3(end,start),q)),G.mul3(normal,.05));
  p[0]+=(endX-p[0])*fall;p[1]+=(119.5-p[1])*fall;p[2]+=(2-p[2])*fall;
  const axis=G.unit3([normal[0]*(1-fall),normal[1]*(1-fall),normal[2]+(1-normal[2])*fall]);
  const F=G.frameAlong(p,axis);
  return {paths:G.disc(0,1.3,5.3,F,P),detail:k.lineSvg(G.circleOf(F,1.3,3.9,P),{tone:'lo'}),F};
}
export function holeAt(m:ClockModel){
  const d=cardOffset(m);return G.circleOf(front(10+d[0],58.68+d[1],103+d[2]),0,1.6,P);
}
export const screenOffset=(p:k.Point3)=>{const o=at([0,0,0]),a=at(p);return [a[0]-o[0],a[1]-o[1]];};
