import { useState } from 'react';
import { chainOf } from '../lib/api';

export function Token({ value, genesis, className = '' }: { value: string; genesis?: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-[0.3em] whitespace-nowrap ${className}`}>
      <img src="/brand/pot.png" alt="" width={16} height={16} className="h-[0.9em] w-[0.9em] shrink-0" />
      {value} {chainOf(genesis).unit}
    </span>
  );
}

export function Network({ genesis, className = '' }: { genesis?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const { name, logo } = chainOf(genesis);
  return (
    <button type="button" title={name} aria-label={name} aria-expanded={open} onClick={() => setOpen((o) => !o)}
      onBlur={() => setOpen(false)} className={`relative inline-flex shrink-0 items-center align-middle ${className}`}>
      <img src={logo} alt="" width={20} height={20} className="h-[1.25em] w-[1.25em]" />
      {open && (
        <span role="tooltip" className="absolute left-0 top-full z-20 mt-1.5 whitespace-nowrap rounded-md border border-line bg-card px-2 py-1 font-sans text-[12px] text-ink">
          {name}
        </span>
      )}
    </button>
  );
}
