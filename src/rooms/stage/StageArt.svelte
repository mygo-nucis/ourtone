<script lang="ts">
  import type { StageLayout } from './layout';
  import { S, T, linGrad, radGrad } from '../../lib/art/svg';
  import { setPalette } from '../../lib/art/ctx';
  import { halftone, sparkle, staff } from '../../lib/art/marks';
  import { serif, sans, measure, F } from '../../lib/art/type';
  import { clamp } from '../../lib/util';
  import { theme } from '../../lib/state/theme.svelte';
  import { i18n } from '../../lib/i18n/index.svelte';
  import { fonts } from '../../lib/state/fonts.svelte';

  let { L }: { L: StageLayout } = $props();
  let svg: SVGSVGElement;

  /* the night's grain is fractal noise worked out over every pixel of the screen, and Safari can work it out again each
     time anything over it is repainted (the dimmed clock behind the highway, four times a second). so it is worked out
     once, into a bitmap at the screen's own resolution, which stands in for the live filter; the same noise, the same
     5%. (until the bitmap is ready, or where a browser won't make one, the filter itself stays) */
  let grainUrl = '';
  function bakeGrain(rect: SVGRectElement, W: number, H: number, s: number) {
    const k = Math.min(s * (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1), 4096 / W, 4096 / H);
    const cw = Math.round(W * k), ch = Math.round(H * k);
    const src = `<svg xmlns="http://www.w3.org/2000/svg" width="${cw}" height="${ch}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">` +
      `<filter id="g" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/>` +
      `<feColorMatrix values="0 0 0 0 1  0 0 0 0 .95  0 0 0 0 .9  0 0 0 .5 0"/></filter><rect width="${W}" height="${H}" filter="url(#g)"/></svg>`;
    const img = new Image();
    img.onload = () => {
      if (!rect.isConnected) return;
      try {
        const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
        cv.getContext('2d')!.drawImage(img, 0, 0, cw, ch);
        cv.toBlob(b => {
          if (!b || !rect.isConnected) return;
          grainUrl = URL.createObjectURL(b);
          rect.replaceWith(S('image', { href: grainUrl, width: W, height: H, preserveAspectRatio: 'none', opacity: .05 }));
        });
      } catch { /* a canvas this browser won't read back: keep the filter */ }
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(src);
  }

  $effect(() => {
    const th = theme.pal, { W, H } = L;
    void fonts.version; void i18n.lang;
    setPalette(th);
    svg.replaceChildren();
    if (grainUrl) { URL.revokeObjectURL(grainUrl); grainUrl = ''; }
    svg.append(S('rect', { width: W, height: H, fill: th.bg }));
    const dx = W - 1440, ky = H / 900;
    if (th.dark) {
      /* night: a chapel at night, not a puppet theatre. a wine-red light hangs in the air behind the windows; the great
         rose of the west front glows faintly far back; pointed arcades recede down both sides of the nave and the floor
         runs away to the light; shafts of light fall from high windows. grain and a soft vignette hold it together. */
      const wl = L.wins.length ? L.wins[0].x : W * .3, wr = L.wins.length ? L.wins[L.wins.length - 1].x + L.wins[L.wins.length - 1].w : W * .9;
      const mx = (wl + wr) / 2, my = (L.compact ? 150 : 300) * ky, TAU = Math.PI * 2;
      svg.append(S('rect', { width: W, height: H, fill: linGrad(svg, [[0, '#150D14'], [.55, '#0E0A10'], [1, '#0B0A0E']]) }));
      svg.append(S('ellipse', { cx: mx, cy: my + 60 * ky, rx: Math.max(760, (wr - wl) * .9), ry: 640 * ky, fill: radGrad(svg, [[0, '#6E1424', .72], [.4, '#3A0A16', .55], [.75, '#1A0710', .3], [1, '#0B0A0E', 0]]) }));
      // the nave's arcades, receding toward the light: pointed arches between piers, each a little smaller and dimmer
      const vy = my + 40 * ky, arc = S('g', {});
      svg.append(arc);
      for (const side of [-1, 1]) for (let i = 0; i < 5; i++) {
        const f = Math.pow(.72, i), edge = side < 0 ? 0 : W, x0 = edge + side * -1 * (40 + 230 * (1 - f)) * (W / 1440);
        const wdt = 210 * f * (W / 1440), hgt = (H - vy) * f * 1.6 + 240 * f * ky, top = vy + (H - vy) * (1 - f) * .2 - hgt * .5;
        const xa = side < 0 ? x0 : x0 - wdt, xb = xa + wdt, base = top + hgt, spring = top + wdt * .9;
        const d = `M${xa.toFixed(1)} ${base.toFixed(1)}V${spring.toFixed(1)}Q${xa.toFixed(1)} ${(top + wdt * .25).toFixed(1)} ${((xa + xb) / 2).toFixed(1)} ${top.toFixed(1)}Q${xb.toFixed(1)} ${(top + wdt * .25).toFixed(1)} ${xb.toFixed(1)} ${spring.toFixed(1)}V${base.toFixed(1)}`;
        const op = .3 * f + .07;
        arc.append(S('path', { d: d + 'Z', fill: linGrad(svg, [[0, '#2A0F1A', .5 * f], [1, '#0B0A0E', 0]]) }));
        arc.append(S('path', { d, fill: 'none', stroke: '#D8B46A', 'stroke-width': 1, opacity: op }));
        arc.append(S('path', { d, fill: 'none', stroke: '#D8B46A', 'stroke-width': .5, opacity: op * .55, transform: `translate(${side * -6 * f} ${6 * f})` }));
      }
      // the floor, running away to the light
      const fl = S('g', { stroke: '#D8B46A', 'stroke-width': .7, fill: 'none' });
      svg.append(fl);
      for (let k = -9; k <= 9; k++) fl.append(S('line', { x1: mx + k * 14, y1: vy + 140 * ky, x2: mx + k * W * .16, y2: H, opacity: .07 }));
      for (let j = 1; j <= 7; j++) { const t = Math.pow(j / 7, 2.2), y = vy + 140 * ky + (H - vy - 140 * ky) * t; fl.append(S('line', { x1: 0, y1: y, x2: W, y2: y, opacity: .025 + .05 * t })); }
      // the great rose, far back: its glass faintly lit, its tracery in gold hairline
      const R = (L.compact ? 300 : 540) * Math.max(1, ky * .9), N = 16;
      svg.append(S('circle', { cx: mx, cy: my, r: R, fill: radGrad(svg, [[0, '#8E2234', .3], [.35, '#4A1028', .22], [.8, '#1E0A1C', .14], [1, '#0B0A0E', 0]]) }));
      const glass = S('g', { opacity: .17 }), back = S('g', { fill: 'none', stroke: '#D8B46A', opacity: .18 });
      svg.append(glass); svg.append(back);
      const ring = (r: number, w = .8) => back.append(S('circle', { cx: mx, cy: my, r, 'stroke-width': w }));
      ring(R, 1.4); ring(R * .97, .6); ring(R * .62); ring(R * .3, 1); ring(R * .17, .6);
      const jewels = ['#3A2A7A', '#5A1630', '#22406E', '#4A1A5E'];
      for (let k = 0; k < N; k++) {
        const a = k / N * TAU - Math.PI / 2, h = Math.sin(Math.PI / N) * R * .62 * .8, rin = Math.sin(Math.PI / N) * R * .3 * .8;
        const at = (u: number, v: number) => `${(mx + Math.cos(a) * u - Math.sin(a) * v).toFixed(1)} ${(my + Math.sin(a) * u + Math.cos(a) * v).toFixed(1)}`;
        const d = `M${at(R * .3, -rin)}A${rin.toFixed(1)} ${rin.toFixed(1)} 0 0 0 ${at(R * .3, rin)}L${at(R * .62, h)}Q${at(R * .8, h)} ${at(R * .93, 0)}Q${at(R * .8, -h)} ${at(R * .62, -h)}Z`;
        glass.append(S('path', { d, fill: jewels[k % 4] }));
        back.append(S('path', { d, 'stroke-width': .9 }));
        const ar = (k + .5) / N * TAU - Math.PI / 2, rr = Math.sin(Math.PI / N) * R * .85;
        glass.append(S('circle', { cx: mx + Math.cos(ar) * R * .82, cy: my + Math.sin(ar) * R * .82, r: rr * .5, fill: '#6E1424' }));
        back.append(S('circle', { cx: mx + Math.cos(ar) * R * .82, cy: my + Math.sin(ar) * R * .82, r: rr * .5, 'stroke-width': .6 }));
      }
      // shafts of light falling from high windows
      const shaft = (x0: number, w0: number, x1: number, w1: number, op: number) => svg.append(S('path', { d: `M${x0} 0L${x0 + w0} 0L${x1 + w1} ${H}L${x1} ${H}Z`, fill: linGrad(svg, [[0, '#FFE2CC', op], [.7, '#FFE2CC', op * .25], [1, '#FFE2CC', 0]]) }));
      shaft(mx - 260, 120, mx - 520, 260, .07); shaft(mx + 120, 70, mx + 40, 180, .05); shaft(mx + 420, 50, mx + 520, 120, .03);
      staff(svg, -40, 560 * ky, W + 40, 200 * ky, 12, 'rgba(237,230,225,.1)', .8, 1);
      // grain, and the dark closing in at the edges
      const nid = 'utgrain' + Math.random().toString(36).slice(2, 7);
      svg.append(S('filter', { id: nid, x: 0, y: 0, width: '100%', height: '100%' }, [S('feTurbulence', { type: 'fractalNoise', baseFrequency: .9, numOctaves: 2, stitchTiles: 'stitch' }), S('feColorMatrix', { values: '0 0 0 0 1  0 0 0 0 .95  0 0 0 0 .9  0 0 0 .5 0' })]));
      bakeGrain(svg.appendChild(S('rect', { width: W, height: H, filter: `url(#${nid})`, opacity: .05 })), W, H, L.s);
      svg.append(S('rect', { width: W, height: H, fill: radGrad(svg, [[0, '#000000', 0], [.66, '#000000', 0], [1, '#000000', .42]], { cx: '50%', cy: '42%', r: '78%' }) }));
      // a single gilded hairline under the top bar, in place of a valance
      svg.append(S('line', { x1: 0, y1: L.compact ? 54 : 98, x2: W, y2: L.compact ? 54 : 98, stroke: 'rgba(216,180,106,.18)', 'stroke-width': 1 }));
    } else {
      const x0 = 600 + dx, sy = (v: number) => v * ky;
      svg.append(S('path', { d: `M${x0} 0H${W}V${sy(600)}C${x0 + 660} ${sy(560)} ${x0 + 430} ${sy(500)} ${x0 + 250} ${sy(370)}C${x0 + 130} ${sy(285)} ${x0 + 50} ${sy(160)} ${x0} 0Z`, fill: th.sky }));
      halftone(svg, x0, 0, W - x0, sy(600), 15, th.accent2, (x, y) => Math.pow(clamp(1 - Math.hypot(W - x, y * 1.1 / ky) / 820, 0, 1), .85));
      halftone(svg, 0, H - 300, 560, 300, 12, th.halo, (x, y) => clamp(1 - Math.hypot(x, H - y) / 440, 0, 1));
      staff(svg, -40, sy(560), W + 40, sy(200), 12, '#FFFFFF', 3, 1);
      staff(svg, -40, sy(560), W + 40, sy(200), 12, th.accent, 1.2, .24);
      if (!L.compact) { sparkle(svg, W - 34, 118, 15, '#FFFFFF', 10); sparkle(svg, W - 58, 162, 8, '#FFFFFF'); }
    }
    if (L.copy) {
      // the call to action shrinks rather than run under the first window
      const { x, y } = L.copy, zh = i18n.lang === 'zh', room = (L.wins[0]?.x ?? 336) - 26;
      const fit = (text: string, family: string, base: number, from: number) => Math.min(base, (room - from) / Math.max(1, measure(text, `900 100px ${family}`) / 100 + (zh ? .1 : .015)));
      const c1 = th.dark ? i18n.t('stageCallNight1') : i18n.t('stageCall1'), c2 = th.dark ? i18n.t('stageCallNight2') : i18n.t('stageCall2');
      const face = th.dark ? serif : sans, family = th.dark ? F.serif : F.sans, base = th.dark ? (zh ? 34 : 30) : (zh ? 32 : 28);
      const s1 = fit(c1, family, base, x), s2 = fit(c2, family, base, x + 36), size = Math.min(s1, s2);
      svg.append(T(x, y, c1, face(size, 900, th.accent, { 'letter-spacing': zh ? 3 : .5 })));
      svg.append(T(x + 36, y + size * 1.5, c2, face(size, 900, th.dark ? th.ink : th.accent, { 'letter-spacing': zh ? 3 : .5 })));
      svg.append(T(x + 2, y + 98, th.dark ? i18n.t('stageSubNight1') : i18n.t('stageSub1'), sans(15, 500, th.ink2, { 'letter-spacing': 1 })));
      svg.append(T(x + 2, y + 122, th.dark ? i18n.t('stageSubNight2') : i18n.t('stageSub2'), sans(15, 500, th.ink2, { 'letter-spacing': 1 })));
    }
  });
</script>

<svg bind:this={svg} class="art" width={L.W} height={L.H} viewBox="0 0 {L.W} {L.H}" aria-hidden="true"></svg>

<style>
  .art { position: absolute; left: 0; top: 0; }
</style>
