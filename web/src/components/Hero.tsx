import { useMemo, useState } from 'react';
import { motion, useScroll, useMotionValueEvent } from 'motion/react';
import { CopySimple, Check } from '@phosphor-icons/react';
import { ShaderCanvas } from '../fx/ShaderCanvas';
import { nightDither } from '../fx/shaders';
import { type Load, type Network, chainOf, fmtPOT } from '../lib/api';
import { Network as NetworkMark, Token } from './brand';

const INSTALL = 'docker compose up -d';
const FOOTAGE = '/footage/fiber-optic-14886-720.mp4';
const NAV = [['Network', '#network'], ['How it works', '#how'], ['Console', '/console'], ['Nominators', '#nominators']] as const;

const rise = (delay = 0) => ({
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.9, delay, ease: [0.23, 1, 0.32, 1] as const },
});

function Install({ className = '' }: { className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(INSTALL).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  return (
    <button type="button" onClick={copy} aria-label={copied ? 'Copied install command' : `Copy install command: ${INSTALL}`}
      className={`group inline-flex items-center gap-4 font-mono text-[15px] ${className}`}>
      <span>{INSTALL}</span>
      <span className="opacity-60 transition-opacity group-hover:opacity-100">{copied ? <Check size={18} weight="bold" /> : <CopySimple size={18} />}</span>
      <span className="sr-only" aria-live="polite">{copied ? 'Copied install command' : ''}</span>
    </button>
  );
}

function Status({ net }: { net: Load<Network> }) {
  const ok = net.state === 'ok' ? net.data : null;
  return (
    <ul className="mt-6 space-y-1 font-mono text-[13px] text-muted">
      {ok ? (
        <>
          <li className="flex items-center gap-2"><NetworkMark genesis={ok.genesis} />{chainOf(ok.genesis).name} block {ok.block.height.toLocaleString('en-US')}</li>
          {ok.finality.threshold !== null && <li>finality needs {ok.finality.threshold} of {ok.finality.authorities} validators</li>}
          <li><Token className="text-accent" value={fmtPOT(ok.rewards.expiring7dPOT)} genesis={ok.genesis} /> expiring in 7 days (estimate)</li>
        </>
      ) : <li>{net.state === 'error' ? `mainnet unavailable: ${net.reason}` : 'reading the chain…'}</li>}
    </ul>
  );
}

export function Hero({ net }: { net: Load<Network> }) {
  const [fade, setFade] = useState(0);
  const { scrollYProgress } = useScroll();
  useMotionValueEvent(scrollYProgress, 'change', (v) => setFade(Math.min(1, v * 5)));
  const build = useMemo(() => nightDither(FOOTAGE, true, 'right'), []);

  return (
    <section className="relative isolate min-h-[100svh] overflow-hidden">
      <ShaderCanvas build={build} scroll={fade} buildKey="night-right" />
      <nav className="relative z-10 flex items-center justify-between px-6 py-5 md:px-10">
        <a href="#" className="font-mono text-[15px] tracking-[0.12em] uppercase">portal<span className="text-accent">node</span></a>
        <div className="hidden items-center gap-7 text-[15px] md:flex">
          {NAV.map(([label, href]) => <a key={href} href={href} className="opacity-75 transition-opacity hover:opacity-100">{label}</a>)}
        </div>
      </nav>
      <div className="relative z-10 flex min-h-[calc(100svh-80px)] max-w-[760px] flex-col justify-center px-6 pb-16 md:px-10">
        <motion.p {...rise(0.1)} className="font-mono text-[13px] text-accent">the night shift for your node</motion.p>
        <motion.h1 {...rise(0.2)} className="display mt-6 text-[clamp(48px,6.4vw,112px)]">Rewards claimed before they expire.</motion.h1>
        <motion.p {...rise(0.32)} className="mt-7 max-w-[44ch] text-[18px] leading-relaxed text-ink/70">
          PortalNode runs your Portaldot node, claims rewards for you and your nominators, and tells you when something needs attention.
        </motion.p>
        <motion.div {...rise(0.44)} className="mt-9 max-w-[460px] border border-ink/20 bg-card/70 p-4 backdrop-blur-sm">
          <Install className="w-full justify-between text-ink" />
        </motion.div>
        <Status net={net} />
      </div>
    </section>
  );
}
