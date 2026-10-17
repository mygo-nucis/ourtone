/* opt-in, asynchronous timing of this WebGL context's pass; it excludes other Canvas/compositor work */
type Query = WebGLQuery;
type Ext = {
  TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number; QUERY_RESULT_AVAILABLE_EXT: number; QUERY_RESULT_EXT: number;
  createQueryEXT(): Query | null; beginQueryEXT(target: number, query: Query): void; endQueryEXT(target: number): void;
  getQueryObjectEXT(query: Query, name: number): number | boolean; deleteQueryEXT(query: Query): void;
};
export function gpuTiming(gl: WebGLRenderingContext, gl2: boolean) {
  if (!new URLSearchParams(location.search).has('perf')) return null;
  const ext = gl.getExtension(gl2 ? 'EXT_disjoint_timer_query_webgl2' : 'EXT_disjoint_timer_query') as Ext | null;
  if (!ext) return null;
  const two = gl as WebGL2RenderingContext;
  const create = () => gl2 ? two.createQuery() : ext.createQueryEXT();
  const begin = (q: Query) => gl2 ? two.beginQuery(ext.TIME_ELAPSED_EXT, q) : ext.beginQueryEXT(ext.TIME_ELAPSED_EXT, q);
  const end = () => gl2 ? two.endQuery(ext.TIME_ELAPSED_EXT) : ext.endQueryEXT(ext.TIME_ELAPSED_EXT);
  const available = (q: Query) => gl2 ? two.getQueryParameter(q, two.QUERY_RESULT_AVAILABLE) : ext.getQueryObjectEXT(q, ext.QUERY_RESULT_AVAILABLE_EXT);
  const value = (q: Query) => Number(gl2 ? two.getQueryParameter(q, two.QUERY_RESULT) : ext.getQueryObjectEXT(q, ext.QUERY_RESULT_EXT));
  const remove = (q: Query) => gl2 ? two.deleteQuery(q) : ext.deleteQueryEXT(q);
  let active: Query | null = null, frame = 0;
  const pending: Query[] = [], samples: number[] = [];
  return {
    begin() {
      if (++frame % 8 || gl.isContextLost()) return;
      const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
      if (disjoint) { pending.splice(0).forEach(remove); samples.length = 0; }
      while (pending.length && available(pending[0])) {
        const q = pending.shift()!, ms = value(q) / 1e6; remove(q);
        if (!disjoint && Number.isFinite(ms)) { samples.push(ms); if (samples.length > 120) samples.shift(); }
      }
      if (pending.length >= 8) return;
      active = create(); if (active) begin(active);
    },
    end() { if (active) { end(); pending.push(active); active = null; } },
    stats() {
      const sorted = [...samples].sort((a, b) => a - b);
      return { glP95: sorted.length ? sorted[Math.floor(sorted.length * .95)] : undefined, glSamples: sorted.length };
    },
    dispose() { if (active && !gl.isContextLost()) { end(); remove(active); } pending.splice(0).forEach(remove); samples.length = 0; active = null; }
  };
}
