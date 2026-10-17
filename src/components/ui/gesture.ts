/* undo keys for continuous controls: one key per drag, and one per burst of wheel turns or key presses,
   so a whole gesture becomes a single undo step */
let seq = 0;
export function gesture() {
  const last: Record<string, { key: string; t: number }> = {};
  return {
    key: () => 'g' + ++seq,
    burst(kind: string, gap = 700) {
      const now = performance.now(), l = last[kind];
      if (l && now - l.t < gap) { l.t = now; return l.key; }
      const key = 'g' + ++seq;
      last[kind] = { key, t: now };
      return key;
    }
  };
}
