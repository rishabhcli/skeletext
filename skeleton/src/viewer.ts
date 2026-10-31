// Browser viewer (REQ-9 and REQ-11)
//
// Functional core: mapKey, reduce, startCarousel and decorate are pure or take injected timers
// and are unit tested. mountTeletext is the thin DOM layer around them.
//
// Expected HTML: any element. mountTeletext fills it with
//   <div class="tt-root">
//     <div class="tt-screen"> ...the SVG... </div>
//     <div class="tt-bar"> five coloured key buttons, a reveal toggle and a page number field </div>
//   </div>

import type { RawPage } from './types.js';
import { setCell, createPage } from './grid.js';
import { interpretPage } from './interpreter.js';
import { renderSVG } from './renderer.js';
import { enterDigit, neighbourPage, type DigitState } from './store.js';
import { handleFastextKey, type FastextConfig, type FastextLabels } from './fastext.js';
import { makeErrorPage, makeLoadingPage, makeNotFoundPage } from './system-pages.js';

export interface ProvidedPage {
  /** One or more subpages. More than one rotate in the carousel. */
  subpages: RawPage[];
  fastext: FastextConfig;
  labels?: FastextLabels;
}

/** Supplies pages by number. Resolve null for "no such page", reject for a failure. */
export type PageProvider = (pageNumber: number, signal: AbortSignal) => Promise<ProvidedPage | null>;

export type ViewerAction =
  | { type: 'digit'; value: number }
  | { type: 'fastext'; key: 'red' | 'green' | 'yellow' | 'cyan' | 'index' }
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'reveal' }
  | { type: 'cancel-entry' };

/** Map a KeyboardEvent.key to a viewer action. Returns null for keys that do nothing. */
export function mapKey(key: string): ViewerAction | null {
  if (/^[0-9]$/.test(key)) return { type: 'digit', value: Number(key) };
  switch (key.toLowerCase()) {
    case 'r':
      return { type: 'fastext', key: 'red' };
    case 'g':
      return { type: 'fastext', key: 'green' };
    case 'y':
      return { type: 'fastext', key: 'yellow' };
    case 'c':
      return { type: 'fastext', key: 'cyan' };
    case 'i':
      return { type: 'fastext', key: 'index' };
    case 'arrowright':
    case 'pageup':
      return { type: 'next' };
    case 'arrowleft':
    case 'pagedown':
      return { type: 'prev' };
    case 'x':
      return { type: 'reveal' };
    case 'escape':
    case 'backspace':
      return { type: 'cancel-entry' };
    default:
      return null;
  }
}

export type ViewerStatus = 'loading' | 'page' | 'not-found' | 'error';

export interface ViewerState {
  status: ViewerStatus;
  /** Page number shown or being requested. */
  page: number;
  sub: number;
  digits: DigitState;
  reveal: boolean;
  provided: ProvidedPage | null;
  message: string;
}

export type ViewerEvent =
  | ViewerAction
  | { type: 'goto'; page: number }
  | { type: 'provided'; page: number; result: ProvidedPage | null }
  | { type: 'failed'; page: number; message: string }
  | { type: 'tick' };

export interface ViewerOptions {
  /** Page numbers that exist, used by next and previous to skip gaps. */
  pages?: readonly number[];
  initialPage?: number;
  /** Seconds each subpage stays on screen. Default 8. */
  subpageSeconds?: number;
  /** Called after every navigation, for example to update the URL hash. */
  onNavigate?: (page: number) => void;
  /** Service name for system pages. */
  clock?: () => Date;
}

export function initialState(page = 100): ViewerState {
  return { status: 'loading', page, sub: 0, digits: { digits: '' }, reveal: false, provided: null, message: '' };
}

const validPage = (n: number) => Number.isInteger(n) && n >= 100 && n <= 899;

/** The page the red and index keys lead to when the current screen is a system page. */
export function indexPageOf(options: ViewerOptions): number {
  const pages = (options.pages ?? []).filter(validPage);
  return pages.length > 0 ? Math.min(...pages) : 100;
}

/**
 * Pure state transition. `request` is set when the caller must fetch a page.
 * It is only ever a number from 100 to 899.
 */
export function reduce(state: ViewerState, event: ViewerEvent, options: ViewerOptions = {}): { state: ViewerState; request: number | null } {
  const go = (page: number) => ({
    state: { ...state, status: 'loading' as const, page, sub: 0, digits: { digits: '' }, provided: null, message: '' },
    request: page,
  });
  switch (event.type) {
    case 'goto':
      return validPage(event.page) ? go(event.page) : { state, request: null };
    case 'digit': {
      const r = enterDigit(state.digits, event.value);
      if (r.navigate !== null && validPage(r.navigate)) return go(r.navigate);
      return { state: { ...state, digits: r.next }, request: null };
    }
    case 'cancel-entry':
      return { state: { ...state, digits: { digits: '' } }, request: null };
    case 'next':
      return go(neighbourPage(state.page, 1, options.pages));
    case 'prev':
      return go(neighbourPage(state.page, -1, options.pages));
    case 'fastext': {
      const idx = indexPageOf(options);
      const links = state.provided?.fastext ?? { red: idx, green: null, yellow: null, cyan: null, index: idx };
      const target = handleFastextKey(links, event.key);
      return target !== null && validPage(target) ? go(target) : { state, request: null };
    }
    case 'reveal':
      return { state: { ...state, reveal: !state.reveal }, request: null };
    case 'provided':
      if (event.page !== state.page) return { state, request: null }; // stale answer
      return event.result && event.result.subpages.length > 0
        ? { state: { ...state, status: 'page', provided: event.result, sub: 0, message: '' }, request: null }
        : { state: { ...state, status: 'not-found', provided: null, message: '' }, request: null };
    case 'failed':
      if (event.page !== state.page) return { state, request: null };
      return { state: { ...state, status: 'error', provided: null, message: event.message }, request: null };
    case 'tick': {
      const count = state.provided?.subpages.length ?? 0;
      return count > 1 ? { state: { ...state, sub: (state.sub + 1) % count }, request: null } : { state, request: null };
    }
  }
}

/** Call onTick every `ms` milliseconds until the returned function is called. Timers can be injected for tests. */
export function startCarousel(
  ms: number,
  onTick: () => void,
  timers: { setInterval: (fn: () => void, ms: number) => unknown; clearInterval: (id: unknown) => void } = {
    setInterval: (fn, t) => setInterval(fn, t),
    clearInterval: (id) => clearInterval(id as ReturnType<typeof setInterval>),
  },
): () => void {
  const id = timers.setInterval(onTick, ms);
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    timers.clearInterval(id);
  };
}

function putText(page: RawPage, row: number, col: number, text: string): void {
  Array.from(text).forEach((ch, i) => {
    if (col + i < 40) setCell(page, row, col + i, ch.charCodeAt(0));
  });
}

/**
 * Copy of the page with live header details: the clock at columns 31 to 39, the subpage
 * indicator at columns 24 to 29 when there are several subpages, and the digits typed so far.
 */
export function decorate(page: RawPage, info: { clock: string; sub: number; subCount: number; digits: string; pageNumber: number }): RawPage {
  const out = page.slice() as RawPage;
  setCell(out, 0, 31, 0x03);
  putText(out, 0, 32, info.clock.padEnd(8, ' ').slice(0, 8));
  if (info.subCount > 1) {
    setCell(out, 0, 24, 0x07);
    putText(out, 0, 25, `${info.sub + 1}/${info.subCount}`.padEnd(5, ' ').slice(0, 5));
  }
  if (info.digits.length > 0) {
    setCell(out, 0, 0, 0x02);
    putText(out, 0, 1, ('P' + info.digits).padEnd(4, '-').slice(0, 4));
  }
  return out;
}

export function screenPage(state: ViewerState, clock: string, indexPage = 100): RawPage {
  const links = { red: indexPage, green: null, yellow: null, cyan: null, index: indexPage };
  const base =
    state.status === 'page' && state.provided
      ? (state.provided.subpages[state.sub] ?? createPage())
      : state.status === 'loading'
        ? makeLoadingPage(state.page)
        : state.status === 'not-found'
          ? makeNotFoundPage(state.page, links)
          : makeErrorPage('Cannot show page', state.message || 'Something went wrong.', links, state.page);
  return decorate(base, {
    clock,
    sub: state.sub,
    subCount: state.provided?.subpages.length ?? 1,
    digits: state.digits.digits,
    pageNumber: state.page,
  });
}

export interface TeletextController {
  goto(page: number): void;
  getState(): ViewerState;
  destroy(): void;
}

const CSS = `
.tt-root{max-width:min(100%,calc(100vh - 150px));margin:0 auto;font-family:system-ui,sans-serif;color:#ddd}
.tt-screen{background:#000;line-height:0}
.tt-sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:pre;border:0}
.tt-bar{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;align-items:center}
.tt-bar button{flex:1 1 56px;min-height:40px;border:0;border-radius:4px;font-weight:600;cursor:pointer;color:#000}
.tt-bar button:focus-visible,.tt-bar input:focus-visible{outline:3px solid #fff;outline-offset:2px}
.tt-r{background:#ff2a2a}.tt-g{background:#2aff2a}.tt-y{background:#ffff2a}.tt-c{background:#2affff}
.tt-i,.tt-x{background:#ddd}
.tt-go{display:flex;gap:6px;flex:2 1 140px}
.tt-go input{flex:1;min-height:40px;border-radius:4px;border:1px solid #666;background:#111;color:#fff;font-size:18px;text-align:center;width:70px}
.tt-go button{flex:0 0 52px}
`;

/** Mount a teletext screen into an element. See the comment at the top of this file for the markup. */
export function mountTeletext(element: HTMLElement, provider: PageProvider, options: ViewerOptions = {}): TeletextController {
  const doc = element.ownerDocument;
  const style = doc.createElement('style');
  style.textContent = CSS;
  element.replaceChildren(style);

  const root = doc.createElement('div');
  root.className = 'tt-root';
  const screen = doc.createElement('div');
  screen.className = 'tt-screen';
  const bar = doc.createElement('div');
  bar.className = 'tt-bar';
  // Screen readers get the page as plain text. It is only updated when the page changes, never on the clock tick.
  const transcript = doc.createElement('pre');
  transcript.className = 'tt-sr';
  transcript.setAttribute('aria-live', 'polite');
  root.append(screen, transcript, bar);
  element.append(root);

  let state = initialState(options.initialPage ?? 100);
  let controller: AbortController | null = null;
  const clock = options.clock ?? (() => new Date());
  const clockText = () => clock().toTimeString().slice(0, 8);

  let announced = '';
  const draw = (announce = true) => {
    const cells = interpretPage(screenPage(state, clockText(), indexPageOf(options)), state.reveal);
    screen.innerHTML = renderSVG(cells);
    const key = `${state.status}|${state.page}|${state.sub}|${state.reveal}`;
    if (announce && key !== announced) {
      announced = key;
      transcript.textContent = cells
        .map((row) => row.map((c) => c.char).join('').trimEnd())
        .filter((line) => line !== '')
        .join('\n');
    }
  };

  const dispatch = (event: ViewerEvent) => {
    const r = reduce(state, event, options);
    const pageChanged = r.state.page !== state.page;
    state = r.state;
    if (r.request !== null) {
      controller?.abort();
      controller = new AbortController();
      const page = r.request;
      const signal = controller.signal;
      if (pageChanged || event.type === 'goto') options.onNavigate?.(page);
      provider(page, signal).then(
        (result) => {
          if (!signal.aborted) dispatch({ type: 'provided', page, result });
        },
        (error: unknown) => {
          if (!signal.aborted) dispatch({ type: 'failed', page, message: error instanceof Error ? error.message : String(error) });
        },
      );
    }
    draw();
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    const action = mapKey(e.key);
    if (action) {
      e.preventDefault();
      dispatch(action);
    }
  };
  doc.addEventListener('keydown', onKey);

  const mkButton = (cls: string, label: string, action: ViewerAction) => {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = cls;
    b.textContent = label;
    b.addEventListener('click', () => dispatch(action));
    return b;
  };
  bar.append(
    mkButton('tt-r', 'Red', { type: 'fastext', key: 'red' }),
    mkButton('tt-g', 'Green', { type: 'fastext', key: 'green' }),
    mkButton('tt-y', 'Yellow', { type: 'fastext', key: 'yellow' }),
    mkButton('tt-c', 'Cyan', { type: 'fastext', key: 'cyan' }),
    mkButton('tt-i', 'Index', { type: 'fastext', key: 'index' }),
    mkButton('tt-x', 'Reveal', { type: 'reveal' }),
  );
  const form = doc.createElement('form');
  form.className = 'tt-go';
  const input = doc.createElement('input');
  input.type = 'text';
  input.inputMode = 'numeric';
  input.maxLength = 3;
  input.placeholder = 'Page';
  input.setAttribute('aria-label', 'Page number, 100 to 899');
  const go = doc.createElement('button');
  go.type = 'submit';
  go.textContent = 'Go';
  go.className = 'tt-i';
  form.append(input, go);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const n = Number(input.value);
    if (validPage(n)) dispatch({ type: 'goto', page: n });
    input.value = '';
  });
  bar.append(form);

  const tickMs = (options.subpageSeconds ?? 8) * 1000;
  const stopCarousel = startCarousel(tickMs, () => dispatch({ type: 'tick' }));
  const clockTimer = setInterval(() => draw(false), 1000);

  dispatch({ type: 'goto', page: state.page });

  return {
    goto: (page) => dispatch({ type: 'goto', page }),
    getState: () => state,
    destroy: () => {
      controller?.abort();
      stopCarousel();
      clearInterval(clockTimer);
      doc.removeEventListener('keydown', onKey);
      element.replaceChildren();
    },
  };
}

