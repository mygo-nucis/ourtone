import { clamp } from '../../lib/util';

/* the stage is composed on a virtual canvas and scaled to the screen.
   full: 900 units tall, at least 1200 wide — the approved 1440 x 900 composition, stretched sideways.
   compact: 540 units tall for phones held sideways; the song, transport and Multi-Track button share a left column. a phone's
   notch or Dynamic Island (its safe-area insets, in px) is kept clear: the column starts after it, the windows end
   before the other side's. */

export interface Win { part: number; slot: number; x: number; y: number; w: number; h: number; rot: number; cx: number; cy: number; k: number }
export interface StageLayout {
  s: number; W: number; H: number; compact: boolean;
  /** the stage units kept clear at the left and right for a notch (0 except on such a phone held sideways) */
  safe: { l: number; r: number };
  /** the left column (compact): where it starts and how wide it is */
  col: { x: number; w: number };
  wins: Win[];
  /** a window's full height: the night's windows all stand this tall; a day window may start a little lower */
  Hw: number;
  /** the standard window: one of MAXVIS on the stage. play mode lays its highway out on it, whatever the stage shows */
  std: { w: number; k: number };
  panel: (w: Win) => number;
  noteTop: (w: Win, night: boolean) => number;
  hitY: (w: Win) => number;
  copy: { x: number; y: number } | null;
  hint: { x: number; y: number; size: number } | null;
  tag: { x: number; y: number } | null;
  wheel: { X0: number; CY: number; R: number; big: number; maxW: number; metaX: number; metaY: number; metaBelow: boolean; keys: [number, number, number, number][] };
  lens: { FY: number; W: number; H: number; CYl: number; X0: number; wx0: number; wx1: number; R: number; step: number; fs: number; persp: number; fade: number; metaX: number; metaY: number; metaBelow: boolean; mag: number };
  play: { cx: number; cy: number; r: number };
  time: { x: number; y: number; size: number };
  prog: { x1: number; y1: number; x2: number; y2: number; gap: number };
  multi: { x: number; y: number; w: number; h: number; size: number };
  /** the note-speed control */
  speed: { x: number; y: number; anchor: 'start' | 'end' };
}

/** the windows the stage shows at first (a song with more parts shows the rest on request) */
export const MAXVIS = 5;

const DAY_TOPS = [150, 180, 136, 168, 150, 172, 142], DAY_ROTS = [-1.6, 1.2, -.7, 1.4, -1.1, .9, -1.3];

export function layoutStage(vw: number, vh: number, parts: number[], night: boolean, ins = { l: 0, r: 0 }): StageLayout {
  const compact = vh < 560 || vw / vh > 2.05;
  const n = Math.max(1, parts.length);
  if (!compact) {
    const s = Math.min(vh / 900, vw / 1200), W = vw / s, H = vh / s, dy = H - 900;
    const X0r = 336 + (W - 1440) * .35, X1r = W - 138 - (W - 1440) * .25;
    const region = X1r - X0r;
    const GAP = n > 5 ? 16 : 24;
    const PWmax = n <= 2 ? 250 : n <= 4 ? 222 : 210;
    const PW = Math.min(PWmax, (region - (n - 1) * GAP) / n);
    const total = n * PW + (n - 1) * GAP;
    const xs = X0r + Math.max(0, (region - total) / 2) * (n <= 3 ? 1 : .5);
    const Hw = clamp(560 + dy * .6, 520, 760);
    const k = clamp(PW / 190, .62, 1.12);
    const stdW = Math.min(210, (region - (MAXVIS - 1) * 24) / MAXVIS);
    const wins: Win[] = parts.map((part, slot) => {
      const x = xs + slot * (PW + GAP), y = night ? 150 : DAY_TOPS[slot % 7], rot = night ? 0 : DAY_ROTS[slot % 7];
      return { part, slot, x, y, w: PW, h: Hw, rot, cx: x + PW / 2, cy: y + Hw / 2, k };
    });
    const play = { cx: Math.max(W * .607, 760), cy: 800 + dy, r: 52 };
    const X0 = 58;
    const maxW = Math.max(250, play.cx - play.r - 330 - X0);
    const last = wins[wins.length - 1];
    return {
      s, W, H, compact,
      safe: { l: 0, r: 0 }, col: { x: 0, w: 0 },
      wins, Hw, std: { w: stdW, k: clamp(stdW / 190, .62, 1.12) },
      panel: w => 132 * w.k,
      noteTop: (w, nt) => w.y + (nt ? 118 : 24) * w.k,
      hitY: w => w.y + w.h - 150 * w.k,
      copy: { x: 56, y: 330 + Math.max(0, dy) * .4 },
      hint: { x: 58, y: 486 + dy, size: 12 },
      tag: last ? { x: last.x + last.w - 104, y: last.y - 58 } : null,
      wheel: { X0, CY: 800 + dy, R: 1000, big: 128, maxW, metaX: 0, metaY: 752 + dy, metaBelow: false, keys: [[-3, -236, 24, 0], [-2, -214, 28, .3], [-1, -132, 46, .5], [0, 0, 128, 1], [1, 68, 36, .5], [2, 130, 28, 0]] },
      lens: { FY: 500 + dy, W: 760, H: 400, CYl: 270, X0, wx0: 30, wx1: 344, R: 196, step: 23, fs: 46, persp: 520, fade: 330, metaX: 372, metaY: 770 + dy - 18, metaBelow: false, mag: 84 },
      play,
      time: { x: play.cx + 78, y: 800 + dy, size: 32 },
      prog: { x1: play.cx + 78, y1: 844 + dy, x2: play.cx + 322, y2: 820 + dy, gap: 7 },
      multi: { x: W - 208, y: 772 + dy, w: 164, h: 72, size: 19 },
      speed: { x: play.cx + 322, y: 880 + dy, anchor: 'end' }
    };
  }
  // compact: phones held sideways
  // the composition is laid out on the width between the insets (Wc), shifted right by the left one (ox)
  const cw = vw - ins.l - ins.r;
  let s = vh / 540, H = 540;
  if (cw / s < 1000) { s = cw / 1000; H = vh / s; }
  const W = vw / s, Wc = cw / s, ox = ins.l / s;
  const dy = H - 540;
  const colW = Math.round(Wc * .4);
  const X0r = ox + colW, X1r = ox + Wc - 22, region = X1r - X0r, GAP = n > 5 ? 10 : 14;
  const PW = Math.min(n <= 2 ? 200 : 170, (region - (n - 1) * GAP) / n);
  const total = n * PW + (n - 1) * GAP, xs = X0r + Math.max(0, (region - total) / 2);
  const top = 74, Hw = H - top - 26;
  const k = clamp(PW / 190, .5, .95);
  const stdW = Math.min(170, (region - (MAXVIS - 1) * 14) / MAXVIS);
  const wins: Win[] = parts.map((part, slot) => {
    const x = xs + slot * (PW + GAP), y = night ? top : top + (DAY_TOPS[slot % 7] - 150) * .45, rot = night ? 0 : DAY_ROTS[slot % 7] * .6;
    const h = night ? Hw : Hw - (y - top);
    return { part, slot, x, y, w: PW, h, rot, cx: x + PW / 2, cy: y + h / 2, k };
  });
  const X0 = ox + 30, CY = 258 + dy * .5, LCY = 196 + dy * .5;
  const play = { cx: ox + 74, cy: H - 74, r: 40 };
  const lastW = wins[wins.length - 1];
  return {
    s, W, H, compact,
    safe: { l: ox, r: ins.r / s }, col: { x: ox, w: colW },
    wins, Hw, std: { w: stdW, k: clamp(stdW / 190, .5, .95) },
    panel: w => 118 * w.k,
    noteTop: (w, nt) => w.y + (nt ? 112 : 22) * w.k,
    hitY: w => w.y + w.h - 132 * w.k,
    copy: null,
    hint: null,
    tag: lastW ? { x: lastW.x + lastW.w - 34, y: lastW.y - 20 } : null,
    wheel: { X0, CY, R: 760, big: 84, maxW: colW - X0 - 40, metaX: X0, metaY: CY + 40, metaBelow: true, keys: [[-3, -190, 18, 0], [-2, -150, 20, 0], [-1, -104, 30, .5], [0, 0, 84, 1], [1, 138, 24, .45], [2, 186, 20, 0]] },
    lens: { FY: LCY - 170, W: ox + colW + 40, H: 300, CYl: 170, X0, wx0: ox + 16, wx1: ox + colW - 34, R: 150, step: 25, fs: 34, persp: 420, fade: ox + colW - 40, metaX: X0, metaY: LCY + 132, metaBelow: true, mag: 64 },
    play,
    time: { x: ox + 132, y: H - 74, size: 26 },
    prog: { x1: ox + 132, y1: H - 40, x2: ox + colW - 168, y2: H - 48, gap: 6 },
    multi: { x: ox + colW - 152, y: H - 110, w: 130, h: 62, size: 16 },
    speed: { x: ox + colW - 22, y: H - 24, anchor: 'end' }
  };
}
