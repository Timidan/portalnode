import type { Point3, Projection } from './iso-kit';
export interface TubePiece { mid:Point3; points:Point3[]; radii:number[]; body:string; shine:string; shade:string; edges:string; wide:boolean }
export function tubePieces(points:Point3[],radius:number,P:Projection,options?:object):TubePiece[];
export function tubeSvg(piece:TubePiece,options?:object):string;
