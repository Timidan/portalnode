import { ConsolePreview, Footer, LiveNumbers, NominatorCheck, Steps } from './components/Sections';
import { Hero } from './components/Hero';
import { useNetwork } from './lib/api';

export default function App() {
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
