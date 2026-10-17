import { GpuCanvas } from './gpuCanvas';
import { gpuTiming } from './gpuTiming';

/* the play-mode highway, drawn flat. the window's art and its notes are painted face-on (in window units, as before);
   this tips them into perspective with WebGL, onto one canvas the size of the screen: one quad, the exact 3D matrix,
   and the far end's fade done as it is drawn.
   (the highway used to be a page layer turned in CSS 3D. a phone's compositor has to rasterise and clip such a layer
   at the scale its near end is seen at, and on some phones it ran out of graphics memory and drew only part of it.)
   there is one context for the page, made while the page is idle and kept: play mode borrows it each time it opens.
   making and dropping a context on every visit cost a stall, and on some PCs the whole window flashed. */

const VS = `attribute vec2 aUv;
uniform mat4 uM; uniform vec2 uPlane; uniform vec2 uStage;
varying vec2 vUv;
void main() {
  vUv = aUv;
  vec4 p = uM * vec4(aUv * uPlane, 0.0, 1.0);
  gl_Position = vec4(p.x * 2.0 / uStage.x - p.w, p.w - p.y * 2.0 / uStage.y, 0.0, p.w);
}`;
// art (with the stage window's own glass over it at uOwn, as the plane starts), then notes over it (all premultiplied);
// the far end fades into the dark (PlayMode's FADE, its length scaled by uFadeK: 1 as drawn, less to shorten it)
const FS = `precision mediump float;
uniform float uFlipNotes; uniform int uProjected; uniform vec2 uScreen;
uniform sampler2D tArt; uniform sampler2D tOwn; uniform sampler2D tNotes; uniform float uFade; uniform float uOwn; uniform float uFadeK;
varying vec2 vUv;
float ramp(float v) {
  if (v < .2) return v / .2 * .05;
  if (v < .34) return mix(.05, .32, (v - .2) / .14);
  if (v < .48) return mix(.32, .72, (v - .34) / .14);
  if (v < .62) return mix(.72, 1.0, (v - .48) / .14);
  return 1.0;
}
void main() {
  vec2 notesUV = uProjected == 1 ? gl_FragCoord.xy / uScreen : vec2(vUv.x, mix(vUv.y, 1.0 - vUv.y, uFlipNotes));
  vec4 n = texture2D(tNotes, notesUV), a = texture2D(tArt, vUv);
  if (uOwn > 0.0) { vec4 o = texture2D(tOwn, vUv) * uOwn; a = o + a * (1.0 - o.a); }
  gl_FragColor = (n + a * (1.0 - n.a)) * mix(1.0, ramp(vUv.y / uFadeK), uFade);
}`;

export class Warp {
  private gl: WebGLRenderingContext;
  private timing: ReturnType<typeof gpuTiming> = null;
  private timingChecked = false;
  beginFrame() {
    if (!this.timingChecked) { this.timingChecked = true; this.timing = gpuTiming(this.gl, this.gl2); }
    this.timing?.begin();
  }
  endFrame() { this.timing?.end(); }
  private program: WebGLProgram;
  private buffer: WebGLBuffer;
  private framebuffer: WebGLFramebuffer | null = null;
  private overlay: WebGLTexture | null = null;
  private overlayFramebuffer: WebGLFramebuffer | null = null;
  private overlayW = 0;
  private overlayH = 0;
  private overlayBox: { x: number; y: number; w: number; h: number } | null = null;
  private overlayDirty = true;
  private overlayAllocations = 0;
  private notesPainter: GpuCanvas | null = null;
  private overPainter: GpuCanvas | null = null;
  private flip: WebGLUniformLocation | null;
  private artPixels = 1;
  private ownPixels = 1;
  private canvasUploads = 0;
  private canvasPixels = 0;
  private retiredUploads = 0;
  private retiredPixels = 0;
  gpu = false;
  readonly software: boolean;
  projected = false;
  enableGPU(projected = false) {
    this.projected = projected;
    try {
      this.notesPainter = new GpuCanvas(this.gl, false, projected);
      this.overPainter = new GpuCanvas(this.gl, true);
      this.framebuffer = this.gl.createFramebuffer();
      this.overlayFramebuffer = this.gl.createFramebuffer();
      this.gpu = !!this.framebuffer && !!this.overlayFramebuffer;
      if (projected && this.framebuffer) this.notesPainter.enableRetained(this.framebuffer);
      if (!this.gpu) this.disableGPU();
    } catch (e) { console.warn('play mode GPU canvas unavailable', e); this.disableGPU(); }
  }
  disableGPU() {
    this.retiredUploads += (this.notesPainter?.uploads ?? 0) + (this.overPainter?.uploads ?? 0);
    this.retiredPixels += (this.notesPainter?.uploadPixels ?? 0) + (this.overPainter?.uploadPixels ?? 0);
    this.notesPainter?.dispose(); this.overPainter?.dispose();
    this.notesPainter = this.overPainter = null;
    if (this.framebuffer) this.gl.deleteFramebuffer(this.framebuffer);
    if (this.overlay) this.gl.deleteTexture(this.overlay);
    if (this.overlayFramebuffer) this.gl.deleteFramebuffer(this.overlayFramebuffer);
    this.overlayFramebuffer = null;
    this.overlay = null; this.overlayW = this.overlayH = 0; this.overlayBox = null;
    this.framebuffer = null; this.gpu = false; this.projected = false;
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
  }
  beginNotes(width: number, height: number, version: number, M: DOMMatrix, planeW: number, planeH: number, stageW: number, stageH: number, pixelW: number, pixelH: number) {
    // screen-space storage must not exceed the original plane budget on a large tablet
    const f = Math.min(1, Math.sqrt(width * height / (pixelW * pixelH)), this.max / pixelW, this.max / pixelH);
    const gl = this.gl, tw = this.projected ? Math.max(1, Math.floor(pixelW * f)) : width, th = this.projected ? Math.max(1, Math.floor(pixelH * f)) : height;
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.notes);
    const resized = tw !== this.notesW || th !== this.notesH;
    if (resized) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, tw, th, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      this.notesW = tw; this.notesH = th;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    if (resized) gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.notes, 0);
    if (resized && gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('GPU notes framebuffer unavailable');
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.notesPainter!.begin(width, height, 1, version);
    if (this.projected) this.notesPainter!.project(this.matrix(M), planeW, planeH, stageW, stageH, tw, th);
    return this.notesPainter!.context;
  }
  cachedNotes(key: string, box: { x: number; y: number; w: number; h: number }, x: number, y: number, paint: (ctx: CanvasRenderingContext2D) => void, screen = false, sampling?: { x: number; y: number }) {
    return this.projected && !!this.notesPainter?.cached(key, box, x, y, paint, screen, sampling);
  }
  beginOverlay(scale: number, version: number) {
    // record the small effects pass first, so the framebuffer need only cover its actual pixels
    this.overlayDirty = true;
    this.overPainter!.begin(this.canvas.width, this.canvas.height, scale, version, true);
    return this.overPainter!.context;
  }
  reuseOverlay() { this.overlayDirty = false; this.overPainter!.resetDraws(); }
  finishNotes() { this.notesPainter?.flushSprites(); }
  prepareOverlay() {
    const gl = this.gl, canvas = this.canvas;
    if (!this.overlayDirty) return;
    if (this.overPainter!.empty) { this.overlayBox = null; return; }
    const box = this.overPainter!.bounds(canvas.width, canvas.height);
    this.overlayBox = box;
    // retain the largest needed extent until exit; changing one axis must not shrink the other
    const w = Math.min(canvas.width, Math.max(this.overlayW, Math.ceil(box.w / 128) * 128));
    const h = Math.min(canvas.height, Math.max(this.overlayH, Math.ceil(box.h / 128) * 128));
    if (!this.overlay) this.overlay = gl.createTexture();
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, this.overlay);
    const resized = w !== this.overlayW || h !== this.overlayH;
    if (resized) {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      this.overlayW = w; this.overlayH = h; this.overlayAllocations++;
    }
    // additive sparks must mix on transparent pixels before covering the highway
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.overlayFramebuffer);
    if (resized) gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.overlay, 0);
    if (resized && gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('GPU overlay framebuffer unavailable');
    // No previous pixels are needed. A full clear lets tile GPUs discard the old
    // attachment instead of loading it to preserve pixels outside a scissor.
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.SCISSOR_TEST); gl.scissor(0, this.overlayH - box.h, box.w, box.h);
    try { this.overPainter!.replay(this.overlayW, this.overlayH, box.x, box.y); }
    finally { gl.disable(gl.SCISSOR_TEST); }
  }
  compositeOverlay() {
    if (this.overlayBox) this.overPainter!.blit(this.overlay!, this.overlayBox, this.overlayW, this.overlayH, this.canvas.width, this.canvas.height);
  }
  stats() {
    const bitmapPixels = (this.notesPainter?.bitmapPixels ?? 0) + (this.overPainter?.bitmapPixels ?? 0);
    return {
      ...this.timing?.stats(),
      gpu: this.gpu, projected: this.projected, software: this.software, overlayAllocations: this.overlayAllocations,
      bitmapPixels,
      rasterPixels: (this.notesPainter?.canvasPixels ?? 0) + (this.overPainter?.canvasPixels ?? 0),
      texturePixels: this.artPixels + this.ownPixels + this.notesW * this.notesH + this.overlayW * this.overlayH + bitmapPixels,
      notes: [this.notesW, this.notesH],
      overlay: this.gpu ? [this.overlayW, this.overlayH] : [this.canvas.width, this.canvas.height],
      uploads: this.canvasUploads + this.retiredUploads + (this.notesPainter?.uploads ?? 0) + (this.overPainter?.uploads ?? 0),
      uploadPixels: this.canvasPixels + this.retiredPixels + (this.notesPainter?.uploadPixels ?? 0) + (this.overPainter?.uploadPixels ?? 0),
      cacheBuilds: this.notesPainter?.cacheBuilds ?? 0,
      notesDraws: this.notesPainter?.draws ?? 0,
      effectsDraws: this.overPainter?.draws ?? 0,
      draws: (this.notesPainter?.draws ?? 0) + (this.overPainter?.draws ?? 0)
    };
  }
  get canvas() { return this.gl.canvas as HTMLCanvasElement; }
  /** WebGL 2 can give the art mipmaps, so its fine lines stay smooth where the far end shrinks them */
  private gl2: boolean;
  private art: WebGLTexture;
  private notes: WebGLTexture;
  private own: WebGLTexture;
  private hasOwn = false;
  private u: { M: WebGLUniformLocation; plane: WebGLUniformLocation; stage: WebGLUniformLocation; fade: WebGLUniformLocation; own: WebGLUniformLocation; fadeK: WebGLUniformLocation; projected: WebGLUniformLocation; screen: WebGLUniformLocation };
  /** the largest texture side this GPU takes */
  readonly max: number;
  private notesW = 0;
  private notesH = 0;
  /** the matrix, reused frame to frame (nothing allocated per frame) */
  private m = new Float32Array(16);
  lost = false;

  /** null when WebGL is not to be had (the CSS layer stands in) */
  static create(cv: HTMLCanvasElement, onlost: () => void): Warp | null {
    try {
      const opts: WebGLContextAttributes = { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false };
      const gl = (cv.getContext('webgl2', opts) || cv.getContext('webgl', opts)) as WebGLRenderingContext | null;
      if (!gl) return null;
      const w = new Warp(gl, typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext);
      cv.addEventListener('webglcontextlost', e => { e.preventDefault(); w.lost = true; onlost(); }, { once: true });
      return w;
    } catch { return null; }
  }

  private constructor(gl: WebGLRenderingContext, gl2: boolean) {
    this.gl = gl; this.gl2 = gl2;
    const renderer = gl.getExtension('WEBGL_debug_renderer_info');
    const backend = String(gl.getParameter(renderer ? renderer.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    this.software = /SwiftShader|llvmpipe|softpipe|software|Basic Render Driver/i.test(backend);
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT)?.precision ? FS.replace('uniform vec2 uScreen', 'uniform highp vec2 uScreen').replace('vec2 notesUV', 'highp vec2 notesUV') : FS));
    gl.bindAttribLocation(p, 0, 'aUv');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link');
    this.program = p; this.flip = gl.getUniformLocation(p, 'uFlipNotes');
    gl.useProgram(p);
    this.buffer = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const loc = (n: string) => gl.getUniformLocation(p, n)!;
    this.u = { M: loc('uM'), plane: loc('uPlane'), stage: loc('uStage'), fade: loc('uFade'), own: loc('uOwn'), fadeK: loc('uFadeK'), projected: loc('uProjected'), screen: loc('uScreen') };
    gl.uniform1i(loc('tArt'), 0); gl.uniform1i(loc('tNotes'), 1); gl.uniform1i(loc('tOwn'), 2);
    const tex = (unit: number) => {
      const t = gl.createTexture()!;
      gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      // an empty pixel until the first upload
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
      return t;
    };
    this.art = tex(0); this.notes = tex(1); this.own = tex(2);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.clearColor(0, 0, 0, 0);
    this.max = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 2048;
  }

  /** the window's art (painted once per look), from a canvas it was painted on (a 2D canvas rasterises an SVG off the
      main thread; handing WebGL the SVG image itself rasterised a 4096-pixel-tall image there and then, a long stall);
      false if it could not be taken (the CSS layer stands in) */
  setArt(src: TexImageSource) {
    const gl = this.gl;
    try {
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.art);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      if (this.gl2) { gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); }
      this.artPixels = (src as HTMLCanvasElement).width * (src as HTMLCanvasElement).height * (this.gl2 ? 4 / 3 : 1);
      // (no getError here: it waits for the GPU to finish everything sent so far, a stall of tens of milliseconds)
      return true;
    } catch { return false; }
  }

  /** the stage window's own glass, painted on the plane like the art (null: none). it shows only as the plane starts,
      and is let go once it has faded */
  setOwn(src: TexImageSource | null) {
    const gl = this.gl;
    try {
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.own);
      if (src) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
      this.ownPixels = src ? (src as HTMLCanvasElement).width * (src as HTMLCanvasElement).height : 1;
      this.hasOwn = !!src;
      return true;
    } catch { return false; }
  }

  private matrix(M: DOMMatrix) {
    const m = this.m;
    m[0] = M.m11; m[1] = M.m12; m[2] = M.m13; m[3] = M.m14; m[4] = M.m21; m[5] = M.m22; m[6] = M.m23; m[7] = M.m24;
    m[8] = M.m31; m[9] = M.m32; m[10] = M.m33; m[11] = M.m34; m[12] = M.m41; m[13] = M.m42; m[14] = M.m43; m[15] = M.m44;
    return m;
  }
  /** this frame's notes, then the highway: M takes the plane's own pixels (w × h) to the stage's (W × H); `fadeK` the
      far end's fade, as a share of its full length */
  draw(notes: HTMLCanvasElement | null, M: DOMMatrix, w: number, h: number, W: number, H: number, fade: number, own = 0, fadeK = 1) {
    const gl = this.gl, cv = gl.canvas as HTMLCanvasElement;
    try {
      if (notes) {
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.notes);
        // same size as last frame: write over the old texture rather than make a new one
        if (notes.width === this.notesW && notes.height === this.notesH) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, notes);
        else { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, notes); this.notesW = notes.width; this.notesH = notes.height; }
        this.canvasUploads++; this.canvasPixels += notes.width * notes.height;
      }
    } catch { return false; }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.disable(gl.BLEND); gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.art);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.notes);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.own);
    gl.uniform1f(this.flip, notes ? 0 : 1);
    gl.viewport(0, 0, cv.width, cv.height);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniformMatrix4fv(this.u.M, false, this.matrix(M));
    gl.uniform1i(this.u.projected, this.projected ? 1 : 0); gl.uniform2f(this.u.screen, cv.width, cv.height);
    gl.uniform2f(this.u.plane, w, h); gl.uniform2f(this.u.stage, W, H); gl.uniform1f(this.u.fade, fade); gl.uniform1f(this.u.fadeK, fadeK);
    if (this.hasOwn && own <= 0) this.setOwn(null);
    gl.uniform1f(this.u.own, this.hasOwn ? own : 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return true;
  }

  /** play mode has closed: the textures and the canvas shrink to a pixel, the context stays for next time */
  rest() {
    this.timing?.dispose(); this.timing = null; this.timingChecked = false; this.disableGPU();
    this.canvasUploads = this.canvasPixels = this.retiredUploads = this.retiredPixels = this.overlayAllocations = 0;
    const gl = this.gl, cv = gl.canvas as HTMLCanvasElement, empty = new Uint8Array(4);
    this.hasOwn = false; this.artPixels = this.ownPixels = 1;
    for (const [unit, t] of [[0, this.art], [1, this.notes], [2, this.own]] as const) {
      gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, empty);
    }
    this.notesW = this.notesH = 0;
    cv.width = cv.height = 1;
    cv.remove();
  }
}

/* the page's one context. `onlost` is whoever has it at the time */
let shared: Warp | null = null, failed = false;
let onlost: (() => void) | null = null;
/** the shared warp (made now if it is not yet), or null without WebGL */
export function getWarp(lost: () => void): Warp | null {
  onlost = lost;
  if (!shared && !failed) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 1;
    cv.setAttribute('aria-hidden', 'true');
    shared = Warp.create(cv, () => { shared = null; onlost?.(); });
    if (!shared) failed = true;
  }
  return shared;
}
/** make it ahead of time, when the page has nothing else to do */
export function prewarm() {
  const ric = (window as unknown as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
  const go = () => { if (!shared && !failed) getWarp(() => {}); };
  if (ric) ric(go, { timeout: 4000 }); else setTimeout(go, 1500);
}
