import * as T from './iso/tube.mjs';
import type {Point3} from './iso/iso-kit';
import {P} from './view';
/** A tension spring: both straight leads land on the two annular seats. */
export function springAt(stroke=0){
  const points:Point3[]=[[13.2,105.2,150],[13.2,104.4,150]];
  for(let i=1;i<=192;i++){
    const a=i/192*Math.PI*12;
    points.push([10+3.2*Math.cos(a),104.4-(7.8+stroke)*i/192,150+3.2*Math.sin(a)]);
  }
  points.push([13.2,95.8-stroke,150]);
  let length=0;const breaks:number[]=[];
  for(let i=1;i<points.length;i++){length+=Math.hypot(...points[i].map((v,j)=>v-points[i-1][j]));if(i===1||i%4===1)breaks.push(length);}
  return {points,pieces:T.tubePieces(points,.34,P,{maxLength:400,spacing:.45,breaks})};
}
