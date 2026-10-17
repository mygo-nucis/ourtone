<script lang="ts">
  import Panel from './Panel.svelte';
  import { studio } from '../../../lib/project/studio.svelte';
  import { transport } from '../../../lib/audio/transport.svelte';
  import { theme } from '../../../lib/state/theme.svelte';
  import { i18n } from '../../../lib/i18n/index.svelte';
  import Toggle from '../../../components/ui/Toggle.svelte';
  import { current, edit, level } from '../sound.svelte';

  /* what the part sounds like right now: its waveform, left and right levels, and the loudest peak of the last moments */
  let { s }: { s: number } = $props();
  let cv = $state<HTMLCanvasElement | null>(null);
  let peakText = $state('−∞ dB');
  $effect(() => {
    if (!cv) return;
    let raf = 0, hold = -120, holdT = 0, lvL = -120, lvR = -120, last = performance.now();
    const buf = new Float32Array(512), bl = new Float32Array(512);
    const f = (now: number) => {
      const dt = Math.min(.1, (now - last) / 1000); last = now;
      const m = transport.meters().parts[studio.part], ctx = cv!.getContext('2d')!;
      const dpr = (devicePixelRatio || 1) * s, W = 208, H = 96;
      if (cv!.width !== Math.round(W * dpr)) { cv!.width = Math.round(W * dpr); cv!.height = Math.round(H * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      const th = theme.pal;
      let pk = 0, pl = 0, pr = 0;
      if (m) {
        m.l.getFloatTimeDomainData(buf); m.r.getFloatTimeDomainData(bl);
        for (let i = 0; i < 512; i++) { pl = Math.max(pl, Math.abs(buf[i])); pr = Math.max(pr, Math.abs(bl[i])); }
        pk = Math.max(pl, pr);
      }
      const dbL = pl > 1e-6 ? 20 * Math.log10(pl) : -120, dbR = pr > 1e-6 ? 20 * Math.log10(pr) : -120;
      lvL = dbL >= lvL ? dbL : Math.max(dbL, lvL - 24 * dt); lvR = dbR >= lvR ? dbR : Math.max(dbR, lvR - 24 * dt);
      const db = pk > 1e-6 ? 20 * Math.log10(pk) : -120;
      if (db > hold || now - holdT > 1500) { hold = db; holdT = now; peakText = hold <= -90 ? '−∞ dB' : `${hold.toFixed(1).replace('-', '−')} dB`; }
      // waveform
      ctx.strokeStyle = th.hair; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, 30); ctx.lineTo(W, 30); ctx.stroke();
      ctx.strokeStyle = th.accent; ctx.lineWidth = 1.6; ctx.beginPath();
      for (let i = 0; i < 208; i++) { const v = m ? buf[Math.floor(i / 208 * 512)] : 0, y = 30 - Math.max(-1, Math.min(1, v * 2.2)) * 26; if (i) ctx.lineTo(i, y); else ctx.moveTo(i, y); }
      ctx.stroke();
      // levels
      [[lvL, 62], [lvR, 76]].forEach(([lv, y]) => {
        ctx.fillStyle = th.track; ctx.fillRect(14, y, W - 14, 7);
        const k = Math.max(0, Math.min(1, (lv + 48) / 48));
        ctx.fillStyle = th.dark ? '#D8B46A' : th.accent; ctx.fillRect(14, y, (W - 14) * k, 7);
        ctx.fillStyle = th.muted; ctx.font = '900 10px ' + getComputedStyle(cv!).fontFamily; ctx.fillText(y === 62 ? 'L' : 'R', 0, y + 7);
      });
      raf = requestAnimationFrame(f);
    };
    raf = requestAnimationFrame(f);
    return () => cancelAnimationFrame(raf);
  });
</script>

<Panel zh="输出" en="Output" day="Output" night="Exitus">
  {#snippet right()}
    {@const p = current()}
    <span class="auto" title={i18n.lang === 'zh' ? '改音色时，自动保持和原预设一样的响度' : 'Keep the preset\'s loudness while you edit'}>
      <span class="al">{level.busy ? '…' : p?.trim ? `${p.trim > 0 ? '+' : '−'}${Math.abs(p.trim).toFixed(1)} dB` : ''}</span>
      <Toggle on={!p?.manual} label={i18n.lang === 'zh' ? '自动音量' : 'Auto level'} onchange={(v) => edit(q => { if (v) delete q.manual; else { q.manual = true; } })} />
    </span>
  {/snippet}
  <div class="out">
    <canvas bind:this={cv} style="width:208px;height:96px" aria-hidden="true"></canvas>
    <div class="pk"><span>{i18n.lang === 'zh' ? '峰值' : 'Peak'}</span><span class="v ut-num">{peakText}</span></div>
  </div>
</Panel>

<style>
  .out { padding: 0 18px; }
  .auto { display: inline-flex; align-items: center; gap: 8px; }
  .al { font: 700 10.5px/1 var(--f-sans); color: var(--muted); font-variant-numeric: tabular-nums; }
  canvas { display: block; font-family: var(--f-sans); }
  .pk { display: flex; justify-content: space-between; align-items: baseline; margin-top: 4px; font: 500 11px/1 var(--f-sans); color: var(--muted); }
  .v { font-size: 14px; color: var(--ink); }
  :global([data-sky="night"]) .v { font-size: 16px; }
</style>
