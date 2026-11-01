import { mountTeletext, type PageProvider } from '@skeletext/core';
import { repoFromSearch } from './param.js';
import { createProvider } from './provider.js';
import { PAGE_NUMBERS } from './pages.js';

const screen = document.getElementById('screen');
if (!screen) throw new Error('Missing #screen element');

const fromHash = () => {
  const n = Number(location.hash.replace('#', ''));
  return Number.isInteger(n) && n >= 100 && n <= 899 ? n : 100;
};

const repo = repoFromSearch(location.search);
const storage = (() => {
  try {
    return window.localStorage;
  } catch {
    return null; // storage can be blocked
  }
})();

const provider: PageProvider = repo
  ? createProvider(repo, { fetcher: (url, init) => fetch(url, init), storage, now: () => Date.now() })
  : async () => {
      throw new Error('The repo parameter must look like owner/name, for example ?repo=rishabhcli/skeletext.');
    };

const viewer = mountTeletext(screen, provider, {
  pages: PAGE_NUMBERS,
  initialPage: fromHash(),
  onNavigate: (page) => history.replaceState(null, '', `${location.search}#${page}`),
});
window.addEventListener('hashchange', () => viewer.goto(fromHash()));
