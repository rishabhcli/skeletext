import { mountTeletext } from '@skeletext/core';
import { fetchFeed } from './feed.js';
import { createProvider, PAGE_NUMBERS } from './provider.js';

const screen = document.getElementById('screen');
if (!screen) throw new Error('Missing #screen element');

const fromHash = () => {
  const n = Number(location.hash.replace('#', ''));
  return Number.isInteger(n) && n >= 100 && n <= 899 ? n : 100;
};

const provider = createProvider({ loadFeed: (name) => fetchFeed(name), now: () => Date.now() });
const viewer = mountTeletext(screen, provider, {
  pages: PAGE_NUMBERS,
  initialPage: fromHash(),
  onNavigate: (page) => history.replaceState(null, '', `#${page}`),
});
window.addEventListener('hashchange', () => viewer.goto(fromHash()));
