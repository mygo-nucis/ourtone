/* consecutive filled quads share one submission; their original edge coverage, colour and blend order stay intact */
type Poly = { box: { x: number; y: number; w: number; h: number }; points: number[]; transform: DOMMatrix; alpha: number; style: unknown; blend: GlobalCompositeOperation };
const CORNERS = [0, 1, 2, 2, 1, 3];
const VS = `attribute vec2 aPixel; attribute vec4 aColor;
attribute vec3 aEdge0; attribute vec3 aEdge1; attribute vec3 aEdge2; attribute vec3 aEdge3;
uniform vec2 uSize; uniform vec2 uOrigin;
varying vec2 vPixel; varying vec4 vColor;
varying vec3 vEdge0; varying vec3 vEdge1; varying vec3 vEdge2; varying vec3 vEdge3;
void main() {
  vPixel = aPixel; vColor = aColor;
  vEdge0 = aEdge0; vEdge1 = aEdge1; vEdge2 = aEdge2; vEdge3 = aEdge3;
  vec2 p = aPixel - uOrigin;
  gl_Position = vec4(p.x * 2.0 / uSize.x - 1.0, 1.0 - p.y * 2.0 / uSize.y, 0.0, 1.0);
}`;
const FS = `precision highp float;
varying vec2 vPixel; varying vec4 vColor;
varying vec3 vEdge0; varying vec3 vEdge1; varying vec3 vEdge2; varying vec3 vEdge3;
void main() {
  vec3 p = vec3(vPixel, 1.0);
  float d = max(max(dot(vEdge0, p), dot(vEdge1, p)), max(dot(vEdge2, p), dot(vEdge3, p)));
  gl_FragColor = vColor * clamp(.5 - d, 0.0, 1.0);
}`;
export class PolygonBatch {
  private program: WebGLProgram;
  private buffer: WebGLBuffer;
  private size: WebGLUniformLocation | null;
  private origin: WebGLUniformLocation | null;
  private data = new Float32Array(128 * 6 * 18);
  private edges = new Float64Array(12);
  constructor(private gl: WebGLRenderingContext) {
    const shader = (kind: number, source: string) => {
      const s = gl.createShader(kind)!; gl.shaderSource(s, source); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { const error = gl.getShaderInfoLog(s); gl.deleteShader(s); throw new Error(error || 'polygon shader'); }
      return s;
    };
    const vs = shader(gl.VERTEX_SHADER, VS), fs = shader(gl.FRAGMENT_SHADER, FS), p = gl.createProgram()!;
    gl.attachShader(p, vs); gl.attachShader(p, fs);
    ['aPixel', 'aColor', 'aEdge0', 'aEdge1', 'aEdge2', 'aEdge3'].forEach((name, i) => gl.bindAttribLocation(p, i, name));
    gl.linkProgram(p); gl.deleteShader(vs); gl.deleteShader(fs);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'polygon program');
    this.program = p; this.buffer = gl.createBuffer()!;
    this.size = gl.getUniformLocation(p, 'uSize'); this.origin = gl.getUniformLocation(p, 'uOrigin');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer); gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.STREAM_DRAW);
  }
  draw(polys: readonly Poly[], start: number, end: number, width: number, height: number, x: number, y: number, colour: (style: string) => number[]) {
    const gl = this.gl, required = (end - start) * 6 * 18;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    if (required > this.data.length) {
      let capacity = this.data.length; while (capacity < required) capacity *= 2;
      this.data = new Float32Array(capacity); gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.STREAM_DRAW);
    }
    let offset = 0;
    for (let i = start; i < end; i++) {
      const d = polys[i], t = d.transform, points = d.points, b = d.box;
      // affine inversion needs no additional DOMMatrix allocation for each particle
      const det = t.a * t.d - t.b * t.c, inv = det ? 1 / det : 0;
      const ia = t.d * inv, ib = -t.b * inv, ic = -t.c * inv, id = t.a * inv;
      const ie = -(ia * t.e + ic * t.f), iff = -(ib * t.e + id * t.f);
      const density = Math.max(.01, Math.min(Math.hypot(t.a, t.b), Math.hypot(t.c, t.d)));
      for (let j = 0; j < 4; j++) {
        const k = (j + 1) % 4, ax = points[j * 2], ay = points[j * 2 + 1];
        const ex = points[k * 2] - ax, ey = points[k * 2 + 1] - ay, norm = density / Math.max(Math.hypot(ex, ey), .0001);
        const nx = ey * norm, ny = -ex * norm, nz = (ex * ay - ey * ax) * norm;
        this.edges[j * 3] = nx * ia + ny * ib;
        this.edges[j * 3 + 1] = nx * ic + ny * id;
        this.edges[j * 3 + 2] = nx * ie + ny * iff + nz;
      }
      const col = colour(String(d.style));
      // triangles keep the same order as the individual source-over or additive draws
      for (const corner of CORNERS) {
        const px = b.x + (corner & 1 ? b.w : 0), py = b.y + (corner & 2 ? b.h : 0);
        this.data[offset++] = t.a * px + t.c * py + t.e;
        this.data[offset++] = t.b * px + t.d * py + t.f;
        for (let c = 0; c < 4; c++) this.data[offset++] = col[c] * d.alpha;
        this.data.set(this.edges, offset); offset += 12;
      }
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data.subarray(0, offset));
    gl.useProgram(this.program); gl.uniform2f(this.size, width, height); gl.uniform2f(this.origin, x, y);
    for (let i = 0; i < 6; i++) {
      gl.enableVertexAttribArray(i);
      gl.vertexAttribPointer(i, i === 0 ? 2 : i === 1 ? 4 : 3, gl.FLOAT, false, 18 * 4, (i === 0 ? 0 : i === 1 ? 2 : 6 + (i - 2) * 3) * 4);
    }
    gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD);
    gl.blendFunc(gl.ONE, polys[start].blend === 'lighter' ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLES, 0, (end - start) * 6);
    for (let i = 1; i < 6; i++) gl.disableVertexAttribArray(i);
  }
  dispose() { this.gl.deleteBuffer(this.buffer); this.gl.deleteProgram(this.program); }
}