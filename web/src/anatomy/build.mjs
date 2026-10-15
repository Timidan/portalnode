import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as A from './iso/audit.mjs';
const here=dirname(fileURLToPath(import.meta.url));
mkdirSync(join(here,'.build'),{recursive:true});
await build({entryPoints:[join(here,'geometry.ts')],outfile:join(here,'.build/geometry.mjs'),bundle:true,platform:'node',format:'esm'});
const {PARTS,geometrySvg,springAt}=await import(`./.build/geometry.mjs?${Date.now()}`);
await build({entryPoints:[join(here,'view.ts')],outfile:join(here,'.build/view.mjs'),bundle:true,platform:'node',format:'esm'});
const {P}=await import('./.build/view.mjs');
const R=A.recorder(P);
for(const p of PARTS){
  const {kind,args,meta={}}=p.shape;
  const raw=A[kind](...args,{name:p.name,...meta});
  const shape=kind==='tube'?raw:R.solid(raw);
  R.put({name:p.name,at:p.at,piece:'clock',svg:geometrySvg(p),shapes:[shape]});
}
R.route('return-spring',springAt().points,.34);
console.log(`${new Set(PARTS.map(p=>p.physical??p.name)).size} physical parts; ${R.solids.length} recorded solids`);
A.settle(R,P);

await build({stdin:{contents:"export * from './model'; export * from './frame'; export * from './spring';",resolveDir:here,loader:'ts'},outfile:join(here,'.build/live-model.mjs'),bundle:true,platform:'node',format:'esm'});
const {checkMotion}=await import('./motion-check.mjs');
const motion=await checkMotion(PARTS,P,R);
if(!motion.ok)throw new Error('Motion verification failed');
R.items.forEach(p=>p.key=motion.keys[p.name]);
writeFileSync(join(here,'order.json'),JSON.stringify(motion.keys,null,2)+'\n');
A.auditOrExit(R,P);
const result=await build({entryPoints:[join(here,'preview.tsx')],bundle:true,write:false,outdir:join(here,'.build'),format:'iife',jsx:'automatic',minify:true,define:{'process.env.NODE_ENV':'"production"'}});
const js=result.outputFiles.find(f=>f.path.endsWith('.js')).text;
const css=result.outputFiles.find(f=>f.path.endsWith('.css')).text;
for(const theme of ['dark','light']){
  const shell=readFileSync(join(here,'preview.html'),'utf8').replace('<html lang="en">',`<html lang="en" data-theme="${theme}">`).replace('<script type="module" src="./preview.tsx"></script>',()=>`<style>${css}</style><script>${js.replaceAll('</script','<\\/script')}</script>`);
  const out=join(here,theme==='light'?'punch-clock-light.html':'punch-clock.html');writeFileSync(out,shell);console.log('wrote '+out);
}
