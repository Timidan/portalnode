import * as k from './iso/iso-kit';
import * as G from './iso/lathe.mjs';
export const WIDTH = 760, HEIGHT = 590;
export const BASE: k.Plan = { x: -153, y: -49, w: 324, d: 185, r: 12 };
export const P = k.fitProjection([...k.boxCorners(BASE, -18, 0), [-93,-30,265], [57,36,265], [-18,0,280], [139,24,202]], WIDTH, HEIGHT, {pad: 42, azimuth: 65, elevation: 23});
export const at = (p:k.Point3) => k.iso(p,P);
export const front = (x:number,y:number,z:number) => G.frameOf([x,y,z],[0,1,0],[1,0,0],[0,0,1]);
export const upright = (x:number,y:number,z:number) => G.frameOf([x,y,z],[0,0,1],[1,0,0],[0,1,0]);
export const rect = (x0:number,z0:number,x1:number,z1:number): k.Flat[] => [[x0,z0],[x1,z0],[x1,z1],[x0,z1]];
export const path3 = (points:k.Point3[],closed=false) => k.pathOf(points.map(at),closed);
export const faceMatrix = (o:k.Point3,u:k.Point3=[1,0,0],v:k.Point3=[0,0,-1]) => {
  const a=at(o), b=at(G.add3(o,u)), c=at(G.add3(o,v));
  return `matrix(${b[0]-a[0]} ${b[1]-a[1]} ${c[0]-a[0]} ${c[1]-a[1]} ${a[0]} ${a[1]})`;
};
