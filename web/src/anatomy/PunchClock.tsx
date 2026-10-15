import { useEffect, useRef, useId } from 'react';
import { Plate, Solid } from './iso/react/draw';
import { follow, useInView, useLoop, useReadout } from './iso/react/live';
import * as k from './iso/iso-kit';
import { PARTS, HALO, springAt } from './geometry';
import { WIDTH, HEIGHT, P, front } from './view';
import * as T from './iso/tube.mjs';
import * as G from './iso/lathe.mjs';
import { CAPTION, CLOCK, ERA_HOURS, STOPS, TOUR_SECONDS, clamp, ease, modelAt, readoutOf } from './model';
import { INITIAL_TIME, offsets, needleAt, keyPaths, coinPaths } from './frame';
import order from './order.json';
import './iso/iso.css';
import './punch-clock.css';

const keys=order as Record<string,number>;
const ART=[...PARTS].sort((a,b)=>(keys[a.name]??k.depthOf(a.at,P))-(keys[b.name]??k.depthOf(b.at,P)));
const PART_BY_NAME=new Map(PARTS.map(part=>[part.name,part]));
const INITIAL=modelAt(INITIAL_TIME);
const initialOffsets=offsets(INITIAL);
function writeSolid(node:SVGGElement,paths:k.SolidPaths){
  for(const [cls,d] of [['iso-fill',paths.fill],['iso-top',paths.top],['iso-edge',paths.outline],['iso-crease',paths.crease],['iso-bevel',paths.bevel]] as const)node.querySelector(`.${cls}`)?.setAttribute('d',d??'');
  node.querySelectorAll('.iso-shade').forEach(p=>p.setAttribute('d',paths.shades[Number(p.getAttribute('data-shade'))]));
}

export interface PunchClockProps { theme?:'dark'|'light'; className?:string }
export function PunchClock({theme='dark',className=''}:PunchClockProps){
  const uid=useId().replaceAll(':','');
  const art=useRef<SVGGElement>(null);
  const {anchor,say}=useReadout<HTMLDivElement>();
  const visible=useInView(anchor);
  const nodes=useRef(new Map<string,SVGGElement>()),needle=useRef<SVGPathElement>(null),hole=useRef<SVGPathElement>(null),tape=useRef<SVGGElement>(null),live=useRef<HTMLSpanElement>(null);
  const state=useRef({t:INITIAL_TIME,target:INITIAL_TIME,tour:false,clock:0,hover:false,focused:false,drag:false,startX:0,startT:0,lastPhase:'',frameCount:0,lastStroke:-1,lastArm:-1,lastCoinTime:-1,depths:new Map<string,number>(),order:''});
  const resume=useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const visibleRef=useRef(visible);visibleRef.current=visible;
  const paint=(t:number)=>{
    const m=modelAt(t),o=offsets(m),s=state.current,depths=s.depths;
    for(const part of PARTS){
      const node=nodes.current.get(part.name);if(!node)continue;
      if(part.motion&&o[part.motion]){
        const off=o[part.motion];node.setAttribute('transform',k.translateAlong(P,off));depths.set(part.name,k.depthOf(off,P));
        if(part.clip){const origin=k.iso([0,0,0],P),p=k.iso(off,P);k.holdStill(node,[p[0]-origin[0],p[1]-origin[1]]);}
      }
    }
    const card=nodes.current.get('punch.card');
    card?.setAttribute('opacity',String(ease(7.1,7.5,t)*(1-ease(28.7,30,t))));
    nodes.current.get('rack.expired-card')?.setAttribute('opacity',String(1-ease(28,29.3,t)));
    if(s.lastArm!==m.arm){
      const key=keyPaths(m),bow=nodes.current.get('keeper.key-bow'),bit=nodes.current.get('keeper.key-bit');
      if(bow)writeSolid(bow,key.bow);if(bit)writeSolid(bit,key.bit);
      const a=m.arm*Math.PI/2;
      depths.set('keeper.key-bow',k.depthOf([6*Math.sin(a),0,6*(1-Math.cos(a))],P));
      depths.set('keeper.key-bit',k.depthOf([Math.cos(a)+2*Math.sin(a)-1,0,Math.sin(a)-2*Math.cos(a)+2],P));s.lastArm=m.arm;
    }
    const coinTime=clamp(t,17.5,20.8);
    for(let i=0;i<2;i++){
      const node=nodes.current.get(`coin.${i}`);if(!node)continue;
      if(s.lastCoinTime!==coinTime){
        const coin=coinPaths(m,i);writeSolid(node,coin.paths);depths.set(`coin.${i}`,k.depthOf(G.sub3(G.add3(coin.F.o,G.mul3(coin.F.a,.65)),PART_BY_NAME.get(`coin.${i}`)!.at),P));node.querySelector('[data-detail]')!.innerHTML=coin.detail;
      }
      node.setAttribute('opacity',String(ease(17.3+i*.6,17.6+i*.6,t)*(1-ease(28.7,30,t))));
    }
    s.lastCoinTime=coinTime;
    if(s.lastStroke!==m.punch){
    const coil=springAt(5.35*m.punch);
    coil.pieces.forEach((p,i)=>{const name=`spring.${i}`,node=nodes.current.get(name);if(node)node.querySelector('[data-tube]')!.innerHTML=T.tubeSvg(p,{tone:'mid'});const base=PART_BY_NAME.get(name);if(base)depths.set(name,k.depthOf(G.sub3(p.mid,base.at),P));});
    s.lastStroke=m.punch;
    }
    const sorted=[...ART].sort((a,b)=>(keys[a.name]??k.depthOf(a.at,P))+(depths.get(a.name)??0)-(keys[b.name]??k.depthOf(b.at,P))-(depths.get(b.name)??0));
    const signature=sorted.map(p=>p.name).join(',');
    if(signature!==s.order&&art.current){s.order=signature;const fragment=document.createDocumentFragment();for(const p of sorted){const n=nodes.current.get(p.name);if(n)fragment.appendChild(n);}art.current.appendChild(fragment);}
    needle.current?.setAttribute('d',needleAt(m));
    hole.current?.setAttribute('opacity',m.claimMarked?'1':'0');
    tape.current?.setAttribute('transform',k.translateAlong(P,[-(m.tape%8)*1.1,0,0]));
    const readout=readoutOf(m);say(readout);
    anchor.current?.setAttribute('aria-valuenow',String(Math.round(t)));
    anchor.current?.setAttribute('aria-valuetext',readout);
    if(anchor.current){anchor.current.dataset.phase=m.state;anchor.current.dataset.time=t.toFixed(3);anchor.current.dataset.frames=String(++s.frameCount);}
    if(s.lastPhase!==m.state){s.lastPhase=m.state;if((s.focused||s.hover)&&live.current)live.current.textContent=readoutOf(m);}
  };
  const kick=useLoop((dt,calm)=>{
    const s=state.current;
    if(!visibleRef.current)return false;
    if(s.tour&&!calm){s.target=(s.target+dt)%TOUR_SECONDS;s.t=s.target;}
    else s.t=follow(s.t,s.target,dt,.28,calm);
    paint(s.t);
    return visibleRef.current&&((s.tour&&!calm)||s.t!==s.target);
  },visible);
  const schedule=()=>{
    clearTimeout(resume.current);
    resume.current=setTimeout(()=>{const s=state.current;if(!s.hover&&!s.focused){s.tour=true;s.target=s.t;if(visibleRef.current)kick();}},3600);
  };
  const hold=()=>{clearTimeout(resume.current);state.current.tour=false;state.current.target=state.current.t;};
  const choose=(t:number)=>{
    hold();state.current.target=clamp(t,0,TOUR_SECONDS);
    anchor.current?.setAttribute('aria-valuenow',String(Math.round(state.current.target)));
    anchor.current?.setAttribute('aria-valuetext',readoutOf(modelAt(state.current.target)));
    if(visibleRef.current)kick();
  };
  useEffect(()=>{paint(INITIAL_TIME);resume.current=setTimeout(()=>{if(!state.current.hover&&!state.current.focused){state.current.tour=true;if(visibleRef.current)kick();}},1400);return()=>clearTimeout(resume.current);},[]);
  return <div className={`iso pn-clock ${className}`} data-theme={theme}>
    <Plate fig="Fig 1" title="Night shift" hint="Drag the shift · ← →" readout={readoutOf(INITIAL)} keys={[
      {mark:'edge',label:`Tape · ${CLOCK.blockSeconds} s blocks`},
      {mark:'raised',label:`Dial · ${ERA_HOURS} h era`},
      {mark:'lit',label:'Punch · claim marker'},
      {mark:'dim',label:`Rack · ${CLOCK.historyDepth} eras`},
    ]} caption={CAPTION}>
      <div ref={anchor} className="pn-clock-stage iso-stage" tabIndex={0} role="slider" aria-label="Night-shift punch clock. Drag or use arrow keys to explore the reward-claiming cycle." aria-valuemin={0} aria-valuemax={TOUR_SECONDS} aria-valuenow={Math.round(INITIAL_TIME)} aria-valuetext={readoutOf(INITIAL)}
        onPointerEnter={()=>{state.current.hover=true;hold();}}
        onPointerLeave={()=>{state.current.hover=false;if(!state.current.drag)schedule();}}
        onPointerDown={e=>{if(e.button!==0)return;hold();const s=state.current;s.drag=true;s.startX=e.clientX;s.startT=s.t;e.currentTarget.setPointerCapture(e.pointerId);}}
        onPointerMove={e=>{const s=state.current;if(s.drag){const w=e.currentTarget.getBoundingClientRect().width;choose(s.startT+(e.clientX-s.startX)/w*TOUR_SECONDS);}}}
        onPointerUp={e=>{const s=state.current;if(!s.drag)return;s.drag=false;if(Math.abs(e.clientX-s.startX)<4)choose(STOPS.find(t=>t>s.t+.4)??0);if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);schedule();}}
        onPointerCancel={()=>{state.current.drag=false;schedule();}}
        onFocus={()=>{state.current.focused=true;hold();if(live.current)live.current.textContent=readoutOf(modelAt(state.current.t));}}
        onBlur={()=>{state.current.focused=false;schedule();}}
        onKeyDown={e=>{
          const t=state.current.t;let next:number|undefined;
          if(['ArrowRight','ArrowUp','Enter',' '].includes(e.key))next=STOPS.find(n=>n>t+.5)??TOUR_SECONDS;
          if(['ArrowLeft','ArrowDown'].includes(e.key))next=[...STOPS].reverse().find(n=>n<t-.5)??0;
          if(e.key==='Home')next=0;if(e.key==='End')next=STOPS.at(-1);if(e.key==='Escape'){hold();return;}
          if(next!==undefined){e.preventDefault();choose(next);}
        }}>
        <svg className="iso-svg pn-clock-svg" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="A cutaway mechanical punch clock. The dial sits over exposed gears and a card punch. A side rack holds unpunched cards; a forked chute pays two trays. A receipt drawer and bell finish the cycle. A separate large stash key stays on an outside hook.">
          <defs><clipPath id={`${uid}-tape`}><path d={PARTS.find(p=>p.name==='tape.paper')!.paths.top}/></clipPath></defs>
          <path className="iso-halo" d={HALO}/>
          <g ref={art}>{ART.map(part=><g key={part.name} ref={n=>{if(n)nodes.current.set(part.name,n);else nodes.current.delete(part.name);}} data-part={part.name} data-motion={part.motion} transform={part.motion&&initialOffsets[part.motion]?k.translateAlong(P,initialOffsets[part.motion]):undefined} opacity={part.name.startsWith('coin.')?0:1}>
            {part.clip?<clipPath id={`${uid}-rod`}><path data-hold d={part.clip}/></clipPath>:null}
            {part.raw?<g data-tube dangerouslySetInnerHTML={{__html:part.raw}}/>:<g clipPath={part.clip?`url(#${uid}-rod)`:undefined}><Solid paths={part.paths} tone={part.tone} lit={part.lit} inner={<g data-detail dangerouslySetInnerHTML={{__html:part.detail}}/>}>
              {part.name==='clock.face'?<path ref={needle} className="iso-line pn-hand" data-free="" data-tone="hi" d={needleAt(INITIAL)}/>:null}
              {part.name==='punch.card'?<path ref={hole} className="pn-punch-hole" d={G.circleOf(front(10,58.68,103),0,1.6,P)} opacity="0"/>:null}
              {part.name==='tape.paper'?<g clipPath={`url(#${uid}-tape)`}><g ref={tape}>{Array.from({length:8},(_,i)=><g key={i}><path className="iso-line" data-tone="lo" d={k.planOutline({x:-140+i*7,y:-2,w:1.1,d:1.1,r:.3},152.35,P)+k.planOutline({x:-140+i*7,y:16,w:1.1,d:1.1,r:.3},152.35,P)}/><path className="iso-line" data-tone="lo" data-free="" d={k.lineOnTop([-140+i*7,3],[-140+i*7,11],152.35,P)}/></g>)}</g></g>:null}
            </Solid></g>}
          </g>)}</g>
        </svg>
      </div>
      <span ref={live} className="pn-sr-only" aria-live="polite" aria-atomic="true"/>
    </Plate>
  </div>;
}
