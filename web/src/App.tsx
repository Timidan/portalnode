import { lazy, Suspense } from 'react';
import { ConsolePreview, Footer, LiveNumbers, NominatorCheck, Steps } from './components/Sections';
import { Hero } from './components/Hero';
import { useNetwork } from './lib/api';

const Console = lazy(() => import('./console/Console'));

function Landing() {
  const net = useNetwork();
  return (
    <main>
      <Hero net={net} />
      <LiveNumbers net={net} />
      <Steps />
      <ConsolePreview net={net} />
      <NominatorCheck />
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
