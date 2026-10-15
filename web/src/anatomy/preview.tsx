import { createRoot } from 'react-dom/client';
import { PunchClock } from './index';
const theme = document.documentElement.dataset.theme === 'light' || new URLSearchParams(location.search).get('theme') === 'light' ? 'light' : 'dark';
document.documentElement.dataset.theme=theme;
createRoot(document.getElementById('root')!).render(<PunchClock theme={theme}/>);
