import { useEffect, useRef, useId, useState } from 'react';
import { Plate, Solid } from './iso/react/draw';
import { follow, useLoop, useReadout } from './iso/react/live';
import * as k from './iso/iso-kit';
import { PARTS, HALO, springAt, type Part } from './geometry';
import { WIDTH, HEIGHT, P, front } from './view';
import * as T from './iso/tube.mjs';
import * as G from './iso/lathe.mjs';
import { CAPTION, CLOCK, ERA_HOURS, STOPS, TOUR_SECONDS, clamp, ease, modelAt, readoutOf } from './model';
import { INITIAL_TIME, offsets, coinPaths } from './frame';
import { TAPE_PITCH } from './mechanics';
import order from './order.json';
import './iso/iso.css';
import './punch-clock.css';

const keys=order as Record<string,number>;
const ART=[...PARTS].sort((a,b)=>(keys[a.name]??k.depthOf(a.at,P))-(keys[b.name]??k.depthOf(b.at,P)));
const PART_BY_NAME=new Map(PARTS.map(part=>[part.name,part]));
const solidNodes=new WeakMap<SVGGElement,Map<string,Element>>();
const INITIAL=modelAt(INITIAL_TIME);
const initialOffsets=offsets(INITIAL);
function writeSolid(node:SVGGElement,paths:k.SolidPaths){
  let elements=solidNodes.get(node);if(!elements){elements=new Map();for(const cls of ['iso-fill','iso-top','iso-edge','iso-crease','iso-bevel']){const p=node.querySelector(`.${cls}`);if(p)elements.set(cls,p);}node.querySelectorAll('.iso-shade').forEach(p=>elements!.set(`shade-${p.getAttribute('data-shade')}`,p));solidNodes.set(node,elements);}
  for(const [cls,d] of [['iso-fill',paths.fill],['iso-top',paths.top],['iso-edge',paths.outline],['iso-crease',paths.crease],['iso-bevel',paths.bevel]] as const)elements.get(cls)?.setAttribute('d',d??'');
  paths.shades.forEach((d,i)=>elements!.get(`shade-${i}`)?.setAttribute('d',d));
}

export interface PunchClockProps { theme?:'dark'|'light'; className?:string }
export function PunchClock({theme='dark',className=''}:PunchClockProps){
  const uid=useId().replaceAll(':','');
  const art=useRef<SVGGElement>(null);
  const {anchor,say}=useReadout<HTMLDivElement>();
  const [visible,setVisible]=useState(false);
  useEffect(()=>{
    const node=anchor.current;if(!node)return;
    const observer=new IntersectionObserver(entries=>setVisible(Boolean(entries.at(-1)?.isIntersecting)),{threshold:0,rootMargin:'0px'});
    observer.observe(node);return()=>observer.disconnect();
  },[anchor]);
  const nodes=useRef(new Map<string,SVGGElement>()),hole=useRef<SVGPathElement>(null),tape=useRef<SVGGElement>(null),live=useRef<HTMLSpanElement>(null);
  const state=useRef({t:INITIAL_TIME,target:INITIAL_TIME,tour:true,clock:0,hover:false,focused:false,drag:false,pressed:false,startX:0,startT:0,lastPhase:'',lastPaint:-1,lastTick:0,frameCount:0,lastStroke:-1,lastArm:-1,lastCoinTime:-1,poses:new Map<string,Part>(),depths:new Map<string,number>(),raw:new Map<string,string>(),order:''});
  const resume=useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const visibleRef=useRef(visible);visibleRef.current=visible;
  const paint=(t:number)=>{
    const s=state.current;if(s.lastPaint===t)return;s.lastPaint=t;
    const m=modelAt(t),o=offsets(m),depths=s.depths;
    for(const part of PARTS){
      const node=nodes.current.get(part.name);if(!node)continue;
      if(part.pose){const pose=part.pose(m);if(s.poses.get(part.name)!==pose){s.poses.set(part.name,pose);if(pose.raw){if(s.raw.get(part.name)!==pose.raw){node.querySelector('[data-tube]')!.innerHTML=pose.raw;s.raw.set(part.name,pose.raw);}}else {writeSolid(node,pose.paths);if(pose.detail!==part.detail)node.querySelector('[data-detail]')!.innerHTML=pose.detail;}depths.set(part.name,k.depthOf(G.sub3(pose.at,part.at),P));}}
      if(part.motion&&o[part.motion]){
        const off=o[part.motion];node.setAttribute('transform',k.translateAlong(P,off));depths.set(part.name,k.depthOf(off,P));
        if(part.clip){const origin=k.iso([0,0,0],P),p=k.iso(off,P);k.holdStill(node,[p[0]-origin[0],p[1]-origin[1]]);}
      }
    }
    const card=nodes.current.get('punch.card');
    card?.setAttribute('opacity',String(1-ease(28.7,30,t)));
    nodes.current.get('rack.expired-card')?.setAttribute('opacity',String(1-ease(28,29.3,t)));
    const coinTime=clamp(t,17.5,20.8);
    for(let i=0;i<2;i++){
      const node=nodes.current.get(`coin.${i}`);if(!node)continue;
      if(s.lastCoinTime!==coinTime){
        const coin=coinPaths(m,i);writeSolid(node,coin.paths);depths.set(`coin.${i}`,k.depthOf(G.sub3(coin.F.o,PART_BY_NAME.get(`coin.${i}`)!.at),P));node.querySelector('[data-detail]')!.innerHTML=coin.detail;
      }
      node.setAttribute('opacity',String(1-ease(28.7,30,t)));
    }
    s.lastCoinTime=coinTime;
    if(s.lastStroke!==m.punch){
    const coil=springAt(5.35*m.punch);
    coil.pieces.forEach((p,i)=>{const name=`spring.${i}`,node=nodes.current.get(name);if(node)node.querySelector('[data-tube]')!.innerHTML=T.tubeSvg(p,{tone:'mid'});const base=PART_BY_NAME.get(name);if(base)depths.set(name,k.depthOf(G.sub3(p.mid,base.at),P));});
    s.lastStroke=m.punch;
    }
    const sorted=[...ART].sort((a,b)=>(keys[a.name]??k.depthOf(a.at,P))+(depths.get(a.name)??0)-(keys[b.name]??k.depthOf(b.at,P))-(depths.get(b.name)??0));
    const signature=sorted.map(p=>p.name).join(',');
    if(signature!==s.order&&art.current){s.order=signature;let cursor=art.current.firstElementChild;for(const p of sorted){const node=nodes.current.get(p.name)!;if(node===cursor)cursor=cursor.nextElementSibling;else art.current.insertBefore(node,cursor);}}
    hole.current?.setAttribute('opacity',m.claimMarked?'1':'0');
    tape.current?.setAttribute('transform',k.translateAlong(P,[(m.tape*TAPE_PITCH)%7,0,0]));
    const readout=readoutOf(m);say(readout);
    anchor.current?.setAttribute('aria-valuenow',String(Math.round(t)));
    anchor.current?.setAttribute('aria-valuetext',readout);
    if(anchor.current){anchor.current.dataset.phase=m.state;anchor.current.dataset.time=t.toFixed(3);anchor.current.dataset.frames=String(++s.frameCount);}
    if(s.lastPhase!==m.state){s.lastPhase=m.state;if(live.current)live.current.textContent=readoutOf(m);}
  };
  const kick=useLoop((dt,calm)=>{
    const s=state.current;
    if(!visibleRef.current){s.lastTick=0;return false;}
    const now=performance.now(),elapsed=s.lastTick?(now-s.lastTick)/1000:dt;s.lastTick=now;
    if(s.tour){
      if(calm){
        s.clock+=elapsed;
        if(s.clock>=3){s.clock=0;s.target=STOPS.find(stop=>stop>s.t+.01)??STOPS[0];s.t=s.target;}
      }else{s.target=(s.target+elapsed)%TOUR_SECONDS;s.t=s.target;s.clock=0;}
    }else s.t=follow(s.t,s.target,dt,.18,calm);
    paint(s.t);
    return visibleRef.current&&(s.tour||s.t!==s.target);
  },visible);
  const schedule=()=>{
    clearTimeout(resume.current);
    resume.current=setTimeout(()=>{const s=state.current;if(!s.drag){s.tour=true;s.target=s.t;s.clock=0;s.lastTick=0;if(visibleRef.current)kick();}},2000);
  };
  const hold=()=>{clearTimeout(resume.current);state.current.tour=false;state.current.target=state.current.t;};
  const choose=(t:number)=>{
    hold();state.current.target=clamp(t,0,TOUR_SECONDS);
    if(visibleRef.current)kick();
  };
  useEffect(()=>{paint(INITIAL_TIME);return()=>clearTimeout(resume.current);},[]);
  useEffect(()=>{state.current.lastTick=0;},[visible]);
  return <div className={`iso pn-clock ${className}`} data-theme={theme}>
    <Plate fig="Fig 1" title="Night shift" hint="Plays on its own · drag to scrub" readout={readoutOf(INITIAL)} keys={[
      {mark:'edge',label:`Tape · ${CLOCK.blockSeconds} s blocks`},
      {mark:'raised',label:`Dial · ${ERA_HOURS} h era`},
      {mark:'lit',label:'Punch · claim marker'},
      {mark:'dim',label:`Rack · ${CLOCK.historyDepth} eras`},
    ]} caption={CAPTION}>
      <div ref={anchor} className="pn-clock-stage iso-stage" tabIndex={0} role="slider" aria-label="Night-shift punch clock. Drag or use arrow keys to explore the reward-claiming cycle." aria-valuemin={0} aria-valuemax={TOUR_SECONDS} aria-valuenow={Math.round(INITIAL_TIME)} aria-valuetext={readoutOf(INITIAL)}
        onPointerDown={e=>{if(e.button!==0)return;const s=state.current;s.pressed=true;s.startX=e.clientX;s.startT=s.t;e.currentTarget.setPointerCapture(e.pointerId);}}
        onPointerMove={e=>{const s=state.current;if(!s.pressed)return;if(Math.abs(e.clientX-s.startX)>3)s.drag=true;if(s.drag){const w=e.currentTarget.getBoundingClientRect().width;choose(s.startT+(e.clientX-s.startX)/w*TOUR_SECONDS);}}}
        onPointerUp={e=>{const s=state.current;s.pressed=false;const dragged=s.drag;s.drag=false;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);if(dragged)schedule();}}
        onPointerCancel={()=>{state.current.pressed=false;state.current.drag=false;schedule();}}
        onFocus={()=>{state.current.focused=true;if(live.current)live.current.textContent=readoutOf(modelAt(state.current.t));}}
        onBlur={()=>{state.current.focused=false;}}
        onKeyDown={e=>{
          const t=state.current.t;let next:number|undefined;
          if(['ArrowRight','ArrowUp'].includes(e.key))next=STOPS.find(n=>n>t+.05)??0;
          if(['ArrowLeft','ArrowDown'].includes(e.key))next=[...STOPS].reverse().find(n=>n<t-.05)??STOPS.at(-1);
          if(next!==undefined){e.preventDefault();choose(next);schedule();}
        }}>
        <svg className="iso-svg pn-clock-svg" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="A cutaway mechanical punch clock. The dial sits over exposed gears and a card punch. A side rack holds unpunched cards; a forked chute pays two trays. A receipt drawer and bell finish the cycle. A separate large stash key stays on an outside hook.">
          <defs><clipPath id={`${uid}-tape`}><path d={PARTS.find(p=>p.name==='tape.paper')!.paths.top}/></clipPath></defs>
          <path className="iso-halo" d={HALO}/>
          <g ref={art}>{ART.map(part=><g key={part.name} ref={n=>{if(n)nodes.current.set(part.name,n);else nodes.current.delete(part.name);}} data-part={part.name} data-motion={part.motion} transform={part.motion&&initialOffsets[part.motion]?k.translateAlong(P,initialOffsets[part.motion]):undefined} opacity={1}>
            <g transform={part.layout?k.translateAlong(P,part.layout):undefined}>{part.clip?<clipPath id={`${uid}-${part.name}-rod`}><path data-hold d={part.clip}/></clipPath>:null}
            {part.raw?<g data-tube dangerouslySetInnerHTML={{__html:part.raw}}/>:<g clipPath={part.clip?`url(#${uid}-${part.name}-rod)`:undefined}><Solid paths={part.paths} tone={part.tone} lit={part.lit} inner={<g data-detail dangerouslySetInnerHTML={{__html:part.detail}}/>}>
              {part.name==='punch.card'?<path ref={hole} className="pn-punch-hole" d={G.circleOf(front(10,88.68,148),0,1.6,P)} opacity="0"/>:null}
              {part.name==='tape.paper'?<g clipPath={`url(#${uid}-tape)`}><g ref={tape}>{Array.from({length:16},(_,i)=><g key={i}><path className="iso-line" data-tone="lo" d={k.planOutline({x:-140+i*7,y:-3,w:1.1,d:1.1,r:.3},140.35,P)+k.planOutline({x:-140+i*7,y:13,w:1.1,d:1.1,r:.3},140.35,P)}/><path className="iso-line" data-tone="lo" data-free="" d={k.lineOnTop([-140+i*7,2],[-140+i*7,9],140.35,P)}/></g>)}</g></g>:null}
            </Solid></g>}</g>
          </g>)}</g>
        </svg>
      </div>
      <span ref={live} className="pn-sr-only" aria-live="polite" aria-atomic="true"/>
    </Plate>
  </div>;
}
