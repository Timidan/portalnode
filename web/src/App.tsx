import { lazy, Suspense } from 'react';
import { ConsolePreview, Footer, LiveNumbers, NominatorCheck, Steps } from './components/Sections';
import { Hero } from './components/Hero';
import { useNetwork } from './lib/api';

const Console = lazy(() => import('./console/Console'));
const PunchClock = lazy(() => import('./anatomy').then((m) => ({ default: m.PunchClock })));

function Landing() {
  const net = useNetwork();
  return (
    <main>
      <Hero net={net} />
      <LiveNumbers net={net} />
      <Steps />
      <section id="keeper" className="mx-auto max-w-6xl px-6 pt-32">
        <h2 className="mb-10 max-w-[18ch] text-[clamp(28px,4.6vw,60px)] [overflow-wrap:anywhere] display">What the keeper does on the night shift.</h2>
        <Suspense fallback={null}><PunchClock /></Suspense>
      </section>
      <ConsolePreview net={net} />
      <NominatorCheck net={net} />
      <Footer />
    </main>
  );
}

export default function App() {
  if (location.pathname.startsWith('/console')) {
    return <Suspense fallback={null}><Console /></Suspense>;
  }
  return <Landing />;
}
