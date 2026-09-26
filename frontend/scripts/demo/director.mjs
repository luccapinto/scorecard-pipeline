// Recording machinery for the product demo video: screencast capture, an
// on-page overlay (cursor, captions, title cards) and the ffmpeg encode.
//
// Frames come from CDP `Page.startScreencast` rather than Playwright's
// `recordVideo`, because the latter records at CSS-pixel size with a capped
// VP8 bitrate — UI text comes out soft. Screencast frames are device pixels,
// so a 1280×720 viewport at scale 2 yields crisp 2560×1440 frames: the layout
// is that of a 720p screen, with twice the pixel density.

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export const VIEWPORT = { width: 1280, height: 720 };
export const SCALE = 2;
const OUT_SIZE = { width: VIEWPORT.width * SCALE, height: VIEWPORT.height * SCALE };
const FPS = 30;
// GitHub's video attachment limit on Free plans is 10 MB; aim a little under it.
const README_TARGET_BYTES = 9_400_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * Runs in every document. The overlay lives in a *closed* shadow root: the
 * app's global CSS (a `.card` with margins and borders, say) cannot restyle it,
 * and page locators like `getByText` cannot see its captions. The host is
 * pointer-events:none, so it never intercepts input.
 */
function overlayInit() {
  const CSS = `
    .root { position: fixed; inset: 0; font-family: inherit; line-height: normal; letter-spacing: normal;
      text-transform: none; color: #fff; }
    .root, .root * { box-sizing: border-box; }
    .cur { position: absolute; left: 0; top: 0; width: 26px; height: 26px; opacity: 0;
      transform: translate(-100px, -100px); transition: opacity .2s; filter: drop-shadow(0 2px 4px rgba(0,0,0,.5)); }
    .card.on ~ .cur { opacity: 0 !important; }
    .ripple { position: absolute; width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 50%;
      background: rgba(123,162,255,.5); animation: ripple .5s ease-out forwards; }
    @keyframes ripple { from { transform: scale(.2); opacity: 1 } to { transform: scale(1.4); opacity: 0 } }
    .cap { position: absolute; left: 50%; bottom: 26px; max-width: 78%; padding: 12px 22px;
      transform: translate(-50%, 12px); opacity: 0; transition: opacity .25s, transform .25s;
      border-radius: 14px; background: rgba(10,14,26,.86); border: 1px solid rgba(255,255,255,.14);
      backdrop-filter: blur(12px); box-shadow: 0 10px 30px rgba(0,0,0,.35); text-align: center; }
    .cap.on { opacity: 1; transform: translate(-50%, 0); }
    .step { display: block; margin-bottom: 3px; font-size: 11px; font-weight: 600;
      letter-spacing: .12em; text-transform: uppercase; color: #a9c2ff; }
    .txt { display: block; font-size: 19px; font-weight: 500; line-height: 1.35; }
    .card { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center;
      justify-content: center; gap: 14px; opacity: 0; transition: opacity .6s; text-align: center;
      background: radial-gradient(1000px 600px at 50% 40%, rgba(43,82,199,.45), transparent 60%), #0b0f1a; }
    .card.on { opacity: 1; }
    .card h1 { margin: 0; font-size: 60px; font-weight: 700; letter-spacing: -.02em; }
    .card p { margin: 0; font-size: 23px; line-height: 1.4; color: rgba(255,255,255,.8); max-width: 940px; }
    .card small { margin-top: 14px; font-size: 16px; color: #a9c2ff; letter-spacing: .02em; }
  `;
  const CURSOR = `<svg viewBox="0 0 24 24" width="26" height="26"><path d="M3 2l17 10.5-7.4 1.3L17 21.5l-3 1.5-4.3-7.8L4 20z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
  const state = { step: '', text: '' };
  let host, root, cur, cap, card;

  function build() {
    // A custom tag: no page selector targets it, and inline !important beats any that tried.
    host = document.createElement('demo-overlay');
    host.style.cssText =
      'all: initial !important; position: fixed !important; inset: 0 !important;' +
      'z-index: 2147483647 !important; pointer-events: none !important; font-family: inherit !important;';
    const shadow = host.attachShadow({ mode: 'closed' });
    shadow.innerHTML = `<style>${CSS}</style><div class="root"><div class="cap"><span class="step"></span><span class="txt"></span></div><div class="card"></div><div class="cur">${CURSOR}</div></div>`;
    root = shadow.querySelector('.root');
    [cur, cap, card] = ['.cur', '.cap', '.card'].map((s) => shadow.querySelector(s));
  }
  function attach() {
    if (!document.body) return;
    if (!host) build();
    if (!host.isConnected) document.body.appendChild(host);
  }
  function place(x, y) {
    if (!cur) return;
    cur.style.opacity = '1';
    cur.style.transform = `translate(${x}px, ${y}px)`;
  }

  window.addEventListener('mousemove', (e) => place(e.clientX, e.clientY), true);
  window.addEventListener(
    'mousedown',
    (e) => {
      attach();
      const r = document.createElement('div');
      r.className = 'ripple';
      r.style.left = `${e.clientX}px`;
      r.style.top = `${e.clientY}px`;
      root.appendChild(r);
      setTimeout(() => r.remove(), 600);
    },
    true,
  );

  // React owns <body>; if a re-render ever drops the overlay, put it back.
  new MutationObserver(attach).observe(document, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', attach);

  window.__demo = {
    sync(next) {
      attach();
      if (next.x != null) place(next.x, next.y);
      this.caption(next.step ?? '', next.text ?? '', true);
    },
    caption(step, text, instant = false) {
      attach();
      if (state.step === step && state.text === text && cap.classList.contains('on') === !!text) return;
      state.step = step;
      state.text = text;
      const swap = () => {
        cap.querySelector('.step').textContent = step;
        cap.querySelector('.txt').textContent = text;
        cap.classList.toggle('on', !!text);
      };
      if (instant || !cap.classList.contains('on')) return swap();
      cap.classList.remove('on');
      setTimeout(swap, 250);
    },
    card(html) {
      attach();
      if (html) card.innerHTML = html;
      card.classList.toggle('on', !!html);
    },
  };
}

/** Timestamps frames on arrival; a frame lasts until the next one, so static holds keep real-time pacing. */
class Screencast {
  constructor(page) {
    this.page = page;
    this.frames = [];
    this.dir = mkdtempSync(join(tmpdir(), 'scorecard-demo-'));
  }

  async start() {
    this.started = Date.now();
    this.cdp = await this.page.context().newCDPSession(this.page);
    this.cdp.on('Page.screencastFrame', ({ data, sessionId }) => {
      // Frames already in flight when recording stops must not land in a deleted directory.
      if (this.stopped) return;
      this.cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
      const file = join(this.dir, `${String(this.frames.length).padStart(6, '0')}.jpg`);
      writeFileSync(file, Buffer.from(data, 'base64'));
      this.frames.push({ file, t: (Date.now() - this.started) / 1000 });
    });
    await this.cdp.send('Page.startScreencast', {
      format: 'jpeg',
      quality: 92,
      maxWidth: OUT_SIZE.width,
      maxHeight: OUT_SIZE.height,
    });
  }

  async stop() {
    this.stopped = true;
    await this.cdp.send('Page.stopScreencast');
    this.end = (Date.now() - this.started) / 1000;
  }

  /**
   * Encodes the captured frames into one or both deliverables, each straight
   * from the source frames (no generational loss):
   * - `linkedin`: full 2560×1440 at near-transparent quality — LinkedIn takes
   *   up to 4096×2304 and 30 Mbps, so the file size is not the constraint;
   * - `readme`: the best picture that fits GitHub's 10 MB attachment limit —
   *   a two-pass encode aimed at README_TARGET_BYTES.
   */
  encode({ linkedin, readme }) {
    if (!this.frames.length) throw new Error('Nenhum frame capturado.');
    const lines = ['ffconcat version 1.0'];
    this.frames.forEach((frame, i) => {
      const next = this.frames[i + 1]?.t ?? this.end;
      lines.push(`file '${frame.file}'`, `duration ${Math.max(next - frame.t, 0.001).toFixed(4)}`);
    });
    // The concat demuxer ignores the last entry's duration unless it is repeated.
    lines.push(`file '${this.frames.at(-1).file}'`);
    const list = join(this.dir, 'frames.ffconcat');
    writeFileSync(list, lines.join('\n'));
    const input = ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list];
    const scale = (w, h) => ['-vf', `fps=${FPS},scale=${w}:${h}:flags=lanczos,format=yuv420p`];

    if (linkedin) {
      mkdirSync(dirname(linkedin), { recursive: true });
      ffmpeg([
        ...input, ...scale(OUT_SIZE.width, OUT_SIZE.height),
        '-c:v', 'libx264', '-preset', 'slow', '-tune', 'animation', '-crf', '16',
        '-maxrate', '25M', '-bufsize', '50M',
        '-movflags', '+faststart', linkedin,
      ]);
    }
    if (readme) {
      mkdirSync(dirname(readme), { recursive: true });
      // Bits per second that land the file on the target, minus ~1% of MP4 overhead.
      const kbps = Math.floor((README_TARGET_BYTES * 8 * 0.99) / this.end / 1000);
      const passlog = join(this.dir, 'x264-2pass');
      const video = [
        ...input, ...scale(1920, 1080),
        '-c:v', 'libx264', '-preset', 'veryslow', '-tune', 'animation', '-b:v', `${kbps}k`,
        '-passlogfile', passlog,
      ];
      ffmpeg([...video, '-pass', '1', '-an', '-f', 'mp4', '/dev/null']);
      ffmpeg([...video, '-pass', '2', '-movflags', '+faststart', readme]);
    }
    rmSync(this.dir, { recursive: true, force: true });
  }
}

function ffmpeg(args) {
  const { status, error } = spawnSync('ffmpeg', args, { stdio: 'inherit' });
  if (error || status !== 0) throw error ?? new Error(`ffmpeg saiu com código ${status}`);
}

/** Drives the page like a person would: eased cursor travel, visible clicks, captions. */
export class Director {
  /** `topInset`: height of any sticky header, so framing and visibility checks clear it. */
  static async create(context, { topInset = 0 } = {}) {
    await context.addInitScript(overlayInit);
    const page = await context.newPage();
    return new Director(page, topInset);
  }

  constructor(page, topInset) {
    this.page = page;
    this.topInset = topInset;
    this.pos = { x: VIEWPORT.width * 0.55, y: VIEWPORT.height * 0.45 };
    this.captionState = { step: '', text: '' };
  }

  async record() {
    this.cast = new Screencast(this.page);
    await this.cast.start();
  }

  /** `outputs`: `{ linkedin, readme }` file paths — see Screencast.encode. */
  async finish(outputs) {
    await this.cast.stop();
    this.cast.encode(outputs);
  }

  hold(ms) {
    return sleep(ms);
  }

  /** Full document loads wipe the overlay; restore caption and cursor. */
  async goto(url) {
    await this.page.goto(url);
    await this.page.evaluate((s) => window.__demo.sync(s), { ...this.pos, ...this.captionState });
  }

  async caption(step, text) {
    this.captionState = { step, text };
    await this.page.evaluate(([s, t]) => window.__demo.caption(s, t), [step, text]);
  }

  async card(html, ms) {
    await this.page.evaluate((h) => window.__demo.card(h), html);
    if (ms) await sleep(ms);
  }

  async moveTo(x, y, ms = 650) {
    const from = { ...this.pos };
    const steps = Math.max(1, Math.round(ms / 16));
    for (let i = 1; i <= steps; i++) {
      const k = easeInOut(i / steps);
      this.pos = { x: from.x + (x - from.x) * k, y: from.y + (y - from.y) * k };
      await this.page.mouse.move(this.pos.x, this.pos.y);
      await sleep(16);
    }
  }

  async pointAt(locator, ms) {
    await this.reveal(locator);
    const box = await locator.boundingBox();
    if (!box) throw new Error(`Elemento sem caixa visível: ${locator}`);
    await this.moveTo(box.x + box.width / 2, box.y + box.height / 2, ms);
  }

  async click(locator, { ms, pause = 180 } = {}) {
    await this.pointAt(locator, ms);
    await sleep(pause);
    await this.page.mouse.down();
    await sleep(70);
    await this.page.mouse.up();
  }

  /** Native <select> popups are not rendered in a screencast: point at the control, then pick. */
  async choose(locator, option, ms) {
    await this.pointAt(locator, ms);
    await sleep(250);
    await locator.selectOption(option);
  }

  /** Smooth-scrolls only when the element is not already comfortably in view. */
  async reveal(locator) {
    await locator.waitFor({ state: 'visible' });
    const moved = await locator.evaluate((el, top) => {
      const r = el.getBoundingClientRect();
      const inView = r.top >= top + 8 && r.bottom <= window.innerHeight - 110;
      if (inView) return false;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return true;
    }, this.topInset);
    if (moved) await sleep(900);
  }

  /** Always scrolls `locator` to the top of the viewport, just below any sticky header — frames a section. */
  async frame(locator) {
    await locator.waitFor({ state: 'visible' });
    await locator.evaluate((el, top) => {
      el.style.scrollMarginTop = `${top + 16}px`;
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, this.topInset);
    await sleep(900);
  }

  /** SPA navigation keeps the previous scroll offset; a person would scroll back up. */
  async scrollTop() {
    const moved = await this.page.evaluate(() => {
      if (window.scrollY < 4) return false;
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return true;
    });
    if (moved) await sleep(800);
  }
}
