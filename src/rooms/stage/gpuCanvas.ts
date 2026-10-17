import { HighwayBatch } from './highwayBatch';
import { ARCH_SHADER } from './gpuClip';
import { SpriteBatch, type SpriteQuad, type Projection } from './spriteBatch';
import { PolygonBatch } from './polygonBatch';
/* a small GPU implementation of the canvas operations used by play mode. the drawing and game state stay in
   PlayMode; paths, colours and gradients become uniforms, rather than a freshly rasterised bitmap every frame.
   text and fallback masks use the browser's rasteriser, once per appearance. no readback is needed. */
type Box = { x: number; y: number; w: number; h: number };
type Op = { name: string; args: number[] };
type Path = { ops: Op[]; box: Box; kind: number; points: number[]; radius: number };
type Gradient = { x0: number; y0: number; x1: number; y1: number; stops: [number, number[]][] };
type Sprite = { texture: WebGLTexture; box: Box; pixels: number; screen?: Box };
type Arch = { kind: number; box: Box; centers: number[]; radius: number; spring: number };
type ArchClip = { shape: Arch; inverse: Float32Array; aa: number };
type PathSlot = 'rim-fill' | 'rim-stroke' | 'floor';
const paths = new WeakMap<Path2D, { box: Box; slot: PathSlot; arch: Arch | null }>();
const pathCache = new Map<string, Path2D>();
export function gpuPath(d: string, box: Box, slot: PathSlot, arch = false) {
  const key = slot + ':' + Number(arch) + ':' + d + JSON.stringify(box), old = pathCache.get(key);
  if (old) return old;
  const p = new Path2D(d); paths.set(p, { box, slot, arch: arch ? gothicArch(box) : slot === 'floor' ? quadraticRect(box) : null }); pathCache.set(key, p);
  if (pathCache.size > 32) pathCache.delete(pathCache.keys().next().value!);
  return p;
}

// use the same rounded endpoints and circular arcs as archD, without a plane-sized bitmap
function gothicArch(b: Box): Arch {
  const round = (n: number) => +n.toFixed(2);
  const x0 = round(b.x), x1 = round(b.x + b.w), tip = round(b.x + b.w / 2);
  const top = round(b.y), spring = round(b.y + b.w * .62), bottom = round(b.y + b.h), radius = round(b.w * .8);
  const center = (ax: number, ay: number, bx: number, by: number) => {
    const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy), h = Math.sqrt(Math.max(0, radius * radius - d * d / 4));
    return [(ax + bx) / 2 - dy / d * h, (ay + by) / 2 + dx / d * h];
  };
  return { kind: 6, box: { x: x0, y: top, w: x1 - x0, h: bottom - top }, centers: [...center(x0, spring, tip, top), ...center(tip, top, x1, spring)], radius, spring };
}

function quadraticRect(b: Box): Arch {
  const round = (n: number) => +n.toFixed(2), x = round(b.x), y = round(b.y);
  return { kind: 7, box: { x, y, w: round(b.x + b.w) - x, h: round(b.y + b.h) - y }, centers: [0, 0, 0, 0], radius: 4, spring: 0 };
}
type Draw = {
  kind: number; box: Box; shape: Box; radius: number; stroke: number; style: string | CanvasGradient | CanvasPattern;
  points: number[]; sprite?: WebGLTexture; arch?: Arch; transform: DOMMatrix; alpha: number; blend: GlobalCompositeOperation;
  clip: number[]; mask: WebGLTexture | null; archClip: ArchClip | null;
};

const VS = `attribute vec2 aUv;
uniform vec4 uBox; uniform mat3 uTransform; uniform vec2 uSize; uniform vec2 uOrigin;
uniform highp int uProjected; uniform mat4 uProjection; uniform vec2 uPlaneScale; uniform vec2 uStage;
varying vec2 vPoint; varying vec2 vPixel; varying vec2 vUv;
void main() {
  vUv = aUv; vPoint = uBox.xy + aUv * uBox.zw;
  vPixel = (uTransform * vec3(vPoint, 1.0)).xy;
  vec2 pixel = vPixel - uOrigin;
  if (uProjected == 1) {
    vec4 p = uProjection * vec4(vPixel * uPlaneScale, 0.0, 1.0);
    gl_Position = vec4(p.x * 2.0 / uStage.x - p.w, p.w - p.y * 2.0 / uStage.y, 0.0, p.w);
  } else gl_Position = vec4(pixel.x * 2.0 / uSize.x - 1.0, 1.0 - pixel.y * 2.0 / uSize.y, 0.0, 1.0);
}`;
const FS = `precision highp float;
varying vec2 vPoint; varying vec2 vPixel; varying vec2 vUv;
uniform highp int uProjected; uniform int uKind; uniform vec4 uShape; uniform float uRadius; uniform float uStroke; uniform float uAA;
uniform vec2 uPoints[8]; uniform int uCount;
uniform vec4 uColor[6]; uniform float uStop[6]; uniform int uStops; uniform vec4 uGradient;
uniform vec4 uImageRect;
uniform sampler2D uImage; uniform sampler2D uMask; uniform int uHasMask; uniform vec2 uSize;
uniform vec2 uClip[8]; uniform int uClipCount; uniform float uAlpha;
uniform vec4 uArch; uniform float uSpring;
uniform int uHasArchClip; uniform vec4 uArchClip; uniform vec4 uArchClipShape; uniform vec3 uArchClipParams; uniform mat3 uArchClipTransform;
float edgeCover(float d, float aa) {
  /* project-aware antialiasing is injected only when derivatives are available */
  return clamp(.5 - d / aa, 0.0, 1.0);
}
${ARCH_SHADER}
float polygon(vec2 p, vec2 pts[8], int count) {
  float d = -1.0e8;
  for (int i = 0; i < 8; i++) {
    if (i >= count) break;
    vec2 a = pts[i], b;
    if (i == count - 1) b = pts[0]; else b = pts[i + 1];
    vec2 e = b - a;
    d = max(d, (e.y * (p.x - a.x) - e.x * (p.y - a.y)) / max(length(e), .0001));
  }
  return d;
}
void main() {
  float cover = 1.0;
  if (uKind == 1) {
    vec2 q = abs(vPoint - (uShape.xy + uShape.zw * .5)) - uShape.zw * .5 + uRadius;
    float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uRadius;
    if (uStroke >= 0.0) d = abs(d) - uStroke * .5;
    cover = edgeCover(d, uAA);
  } else if (uKind == 2) {
    float d = length(vPoint - uShape.xy) - uRadius;
    if (uStroke >= 0.0) d = abs(d) - uStroke * .5;
    cover = edgeCover(d, uAA);
  } else if (uKind == 3) {
    float d = polygon(vPoint, uPoints, uCount);
    if (uStroke >= 0.0) d = abs(d) - uStroke * .5;
    cover = edgeCover(d, uAA);
  }
  if (uKind == 6) {
    float d = arch(vPoint, uShape, uArch, uRadius, uSpring);
    if (uStroke >= 0.0) d = abs(d) - uStroke * .5;
    cover = edgeCover(d, uAA);
  }
  if (uKind == 7) cover = edgeCover(quadraticRect(vPoint, uShape, uRadius), uAA);
  if (uHasArchClip > 0) {
    vec2 p = (uArchClipTransform * vec3(vPixel, 1.0)).xy;
    float d = uHasArchClip == 6 ? arch(p, uArchClipShape, uArchClip, uArchClipParams.x, uArchClipParams.y) : quadraticRect(p, uArchClipShape, uArchClipParams.x);
    cover *= edgeCover(d, uArchClipParams.z);
  }
  if (uClipCount > 0) cover *= edgeCover(polygon(vPoint, uClip, uClipCount), uAA);
  if (uHasMask == 1) cover *= texture2D(uMask, vPixel / uSize).a;
  vec4 col = uColor[0];
  if (uKind == 4 || uKind == 5) {
    vec2 uv = uImageRect.xy + vUv * uImageRect.zw;
    col = texture2D(uImage, vec2(uv.x, uKind == 5 ? 1.0 - uv.y : uv.y));
  }
  else if (uStops > 1) {
    vec2 axis = uGradient.zw - uGradient.xy;
    float t = clamp(dot(vPoint - uGradient.xy, axis) / max(dot(axis, axis), .0001), 0.0, 1.0);
    for (int i = 1; i < 6; i++) {
      if (i >= uStops) break;
      float k = clamp((t - uStop[i - 1]) / max(uStop[i] - uStop[i - 1], .00001), 0.0, 1.0);
      col = mix(col, uColor[i], k);
    }
  }
  gl_FragColor = col * (cover * uAlpha);
}`;

function rgba(s: string): number[] {
  let r = 0, g = 0, b = 0, a = 1;
  if (s[0] === '#') {
    const h = s.slice(1), v = h.length <= 4 ? h.split('').map(c => c + c).join('') : h;
    r = parseInt(v.slice(0, 2), 16); g = parseInt(v.slice(2, 4), 16); b = parseInt(v.slice(4, 6), 16);
    if (v.length === 8) a = parseInt(v.slice(6, 8), 16) / 255;
  } else {
    const v = s.match(/[\d.]+/g)?.map(Number);
    if (v && v.length >= 3) { [r, g, b] = v; a = v[3] ?? 1; }
    else if (s === 'white') r = g = b = 255;
    else if (s === 'transparent') a = 0;
  }
  return [r / 255 * a, g / 255 * a, b / 255 * a, a];
}
const expand = (b: Box, p: number): Box => ({ x: b.x - p, y: b.y - p, w: b.w + 2 * p, h: b.h + 2 * p });
const empty = (): Path => ({ ops: [], box: { x: Infinity, y: Infinity, w: 0, h: 0 }, kind: 0, points: [], radius: 0 });

export class GpuCanvas {
  readonly context: CanvasRenderingContext2D;
  private state = document.createElement('canvas').getContext('2d')!;
  private raster = document.createElement('canvas');
  private path = empty();
  private clip: number[] = [];
  private mask: WebGLTexture | null = null;
  private archClip: ArchClip | null = null;
  private lastArchClip: ArchClip | null | undefined = undefined;
  private stack: { clip: number[]; mask: WebGLTexture | null; arch: ArchClip | null }[] = [];
  private gradients = new WeakMap<CanvasGradient, Gradient>();
  private sprites = new Map<string, Sprite>();
  // fallback masks must not compete with small text and spark sprites for the LRU budget
  private assets = new Map<PathSlot, { key: string; sprite: Sprite }>();
  private svgIds = new WeakMap<Path2D, number>();
  private nextId = 0;
  private version = -1;
  private cachePixels = 0;
  private program: WebGLProgram;
  private buffer: WebGLBuffer;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private recording = false;
  private batch: PolygonBatch | null = null;
  private commands: Draw[] = [];
  private used = new Set<WebGLTexture>();
  private previousUsed = new Set<WebGLTexture>();
  private blitUV = new Float32Array(4);
  private dirty = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
  private width = 1;
  private height = 1;
  private density = 1;
  private baseScale = 1;
  private colours = new Float32Array(24);
  private stops = new Float32Array(6);
  private vertices = new Float32Array(16);
  private transform = new Float32Array(9);
  private lastStyle: unknown = null;
  private lastClip: number[] | null = null;
  private lastMask: WebGLTexture | null | undefined = undefined;
  private lastImage: WebGLTexture | null = null;
  private lastBlend = '';
  private lastAlpha = -1;
  private lastTransform = '';
  uploads = 0;
  uploadPixels = 0;
  draws = 0;
  constructor(private gl: WebGLRenderingContext, private trackBounds = false, projected = false) {
    const shader = (type: number, src: string) => {
      const sh = gl.createShader(type)!; gl.shaderSource(sh, src); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { const error = gl.getShaderInfoLog(sh); gl.deleteShader(sh); throw new Error(error || 'GPU canvas shader'); }
      return sh;
    };
    const two = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
    const derivatives = projected && (two || !!gl.getExtension('OES_standard_derivatives'));
    let vertex = VS, fragment = derivatives ? FS.replace('return clamp(.5 - d / aa', 'if (uProjected == 1) aa = max(aa, fwidth(d)); return clamp(.5 - d / aa') : FS;
    // WebGL2 exposes derivatives through GLSL 300, rather than the WebGL1 extension
    if (two && projected) {
      vertex = '#version 300 es\n' + vertex.replaceAll('attribute ', 'in ').replaceAll('varying ', 'out ');
      fragment = '#version 300 es\n' + fragment.replace('precision highp float;', 'precision highp float;\nout vec4 fragColor;').replaceAll('varying ', 'in ').replaceAll('texture2D(', 'texture(').replaceAll('gl_FragColor', 'fragColor');
    } else if (derivatives) fragment = '#extension GL_OES_standard_derivatives : enable\n' + fragment;
    const vs = shader(gl.VERTEX_SHADER, vertex), fs = shader(gl.FRAGMENT_SHADER, fragment), p = gl.createProgram()!;
    gl.attachShader(p, vs); gl.attachShader(p, fs); gl.bindAttribLocation(p, 0, 'aUv'); gl.linkProgram(p);
    gl.deleteShader(vs); gl.deleteShader(fs);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'GPU canvas program');
    this.program = p; this.buffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    for (const key of ['Projected', 'Projection', 'PlaneScale', 'Stage', 'Box', 'Transform', 'Size', 'Origin', 'Kind', 'Shape', 'Radius', 'Stroke', 'AA', 'Points', 'Count', 'Color', 'Stop', 'Stops', 'Gradient', 'Image', 'ImageRect', 'Mask', 'HasMask', 'Clip', 'ClipCount', 'Alpha', 'Arch', 'Spring', 'HasArchClip', 'ArchClip', 'ArchClipShape', 'ArchClipParams', 'ArchClipTransform']) this.u[key] = gl.getUniformLocation(p, 'u' + key);
    if (trackBounds) this.batch = new PolygonBatch(gl);
    const self = this, ctx = this.state;
    this.context = new Proxy(ctx, {
      get(target, prop) {
        if (prop === 'clip') return self.clipPath.bind(self);
        const value = (self as unknown as Record<PropertyKey, unknown>)[prop];
        if (typeof value === 'function' && prop !== 'constructor') return value.bind(self);
        const native = Reflect.get(target, prop, target);
        return typeof native === 'function' ? native.bind(target) : native;
      },
      set(target, prop, value) { return Reflect.set(target, prop, value, target); }
    });
  }
  private retainedBatch: SpriteBatch | null = null;
  private retained = new Map<string, Sprite>();
  private retainedPixels = 0;
  private retainedFramebuffer: WebGLFramebuffer | null = null;
  private target: WebGLFramebuffer | null = null;
  private projection: Projection | null = null;
  private pending: SpriteQuad[] = [];
  private noteBatch: HighwayBatch | null = null;
  private polygons: Draw[] = [];
  private pendingScreen = false;
  private pendingTexture: WebGLTexture | null = null;
  private pendingClip: ArchClip | null = null;
  private baking = false;
  cacheBuilds = 0;
  enableRetained(target: WebGLFramebuffer) {
    this.target = target;
    this.retainedBatch ??= new SpriteBatch(this.gl);
    this.noteBatch ??= new HighwayBatch(this.gl);
    this.retainedFramebuffer ??= this.gl.createFramebuffer();
  }
  private restoreTarget() {
    this.setup(this.width, this.height);
    const p = this.projection;
    if (p) this.project(p.matrix, p.planeW, p.planeH, p.stageW, p.stageH, p.pixelW, p.pixelH);
  }
  private flushPolygons() {
    if (!this.polygons.length) return;
    this.noteBatch!.draw(this.polygons, 0, this.polygons.length, this.width, this.height, 0, 0, rgba, this.projection, this.polygons[0].archClip);
    this.draws++; this.polygons.length = 0; this.restoreTarget();
  }
  flushSprites() {
    this.flushPolygons();
    if (!this.pending.length) return;
    const p = this.projection;
    this.retainedBatch!.draw(this.pending, this.pendingTexture!, this.pendingScreen && p ? p.pixelW : this.width,
      this.pendingScreen && p ? p.pixelH : this.height, this.pendingScreen ? null : p, this.pendingClip);
    this.draws++; this.pending.length = 0;
    this.restoreTarget();
  }
  cached(key: string, box: Box, x: number, y: number, paint: (ctx: CanvasRenderingContext2D) => void, screen = false, sampling?: { x: number; y: number }) {
    this.flushPolygons();
    if (!this.retainedBatch || this.recording || this.mask || this.clip.length || this.state.globalCompositeOperation !== 'source-over') return false;
    const c = this.state, t = c.getTransform(), sx = Math.hypot(t.a, t.b), sy = Math.hypot(t.c, t.d);
    if (sx <= 0 || sy <= 0) return false;
    // preserve the original plane sampling density; a moving appearance never gets re-rasterised at each position
    let screenBox: Box | undefined;
    const projection = this.projection;
    if (screen && projection) {
      const m = projection.matrix, points = [];
      for (const x of [box.x, box.x + box.w]) for (const y of [box.y, box.y + box.h]) {
        const px = (t.a * x + t.c * y + t.e) * projection.planeW / this.width;
        const py = (t.b * x + t.d * y + t.f) * projection.planeH / this.height;
        const w = m[3] * px + m[7] * py + m[15];
        if (w <= 0) return false;
        points.push([(m[0] * px + m[4] * py + m[12]) / w / projection.stageW * projection.pixelW,
          (m[1] * px + m[5] * py + m[13]) / w / projection.stageH * projection.pixelH]);
      }
      const left = Math.max(0, Math.floor(Math.min(...points.map(p => p[0])) - 2)), top = Math.max(0, Math.floor(Math.min(...points.map(p => p[1])) - 2));
      const right = Math.min(projection.pixelW, Math.ceil(Math.max(...points.map(p => p[0])) + 2)), bottom = Math.min(projection.pixelH, Math.ceil(Math.max(...points.map(p => p[1])) + 2));
      if (right <= left || bottom <= top) return true;
      screenBox = { x: left, y: top, w: right - left, h: bottom - top };
    }
    const w = screenBox?.w ?? Math.max(1, Math.ceil(box.w * (sampling?.x ?? sx))), h = screenBox?.h ?? Math.max(1, Math.ceil(box.h * (sampling?.y ?? sy)));
    if (w * h > 8e6) return false;
    const location = screenBox && projection ? JSON.stringify([screenBox, [...projection.matrix], t.a, t.d, t.e, t.f]) : '';
    const id = location + key + ':' + w + 'x' + h;
    let sprite = this.retained.get(id);
    if (!sprite) {
      this.flushSprites();
      if (this.retained.size >= 64 || this.retainedPixels + w * h > 8e6) this.dropRetained();
      const gl = this.gl, texture = gl.createTexture()!;
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      const width = this.width, height = this.height, clip = this.clip, mask = this.mask, arch = this.archClip;
      c.save(); this.baking = true; this.clip = []; this.mask = null; this.archClip = null; this.projection = null;
      try {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.retainedFramebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('retained framebuffer unavailable');
        if (screenBox && projection) {
          this.setup(width, height);
          this.project(projection.matrix, projection.planeW, projection.planeH, projection.stageW, projection.stageH, projection.pixelW, projection.pixelH);
          gl.viewport(-screenBox.x, -(projection.pixelH - screenBox.y - h), projection.pixelW, projection.pixelH);
          c.setTransform(t);
        } else {
          this.setup(w, h);
          c.setTransform(w / box.w, 0, 0, h / box.h, -box.x * w / box.w, -box.y * h / box.h);
        }
        gl.clear(gl.COLOR_BUFFER_BIT);
        c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
        paint(this.context);
        sprite = { texture, box, pixels: w * h, screen: screenBox };
        this.retained.set(id, sprite); this.retainedPixels += w * h; this.cacheBuilds++;
      } catch (error) { gl.deleteTexture(texture); throw error; }
      finally {
        c.restore(); this.baking = false; this.clip = clip; this.mask = mask; this.archClip = arch; this.projection = projection;
        this.width = width; this.height = height; gl.bindFramebuffer(gl.FRAMEBUFFER, this.target); this.restoreTarget();
      }
    }
    const clip = sprite.screen ? null : this.archClip;
    if (this.pendingTexture !== sprite.texture || this.pendingClip !== clip) this.flushSprites();
    this.pendingTexture = sprite.texture; this.pendingClip = clip; this.pendingScreen = !!sprite.screen;
    this.pending.push({ box: sprite.screen ?? { x: box.x + x, y: box.y + y, w: box.w, h: box.h }, transform: sprite.screen ? new DOMMatrix() : t, alpha: c.globalAlpha });
    return true;
  }
  private dropRetained() {
    for (const s of this.retained.values()) this.gl.deleteTexture(s.texture);
    this.retained.clear(); this.retainedPixels = 0;
  }
  begin(width: number, height: number, scale = 1, version = 0, record = false) {
    this.projection = null;
    if (version !== this.version || width !== this.width || height !== this.height) this.dropRetained();
    if (version !== this.version) {
      for (const s of this.sprites.values()) this.gl.deleteTexture(s.texture);
      for (const { sprite } of this.assets.values()) this.gl.deleteTexture(sprite.texture);
      this.assets.clear(); this.sprites.clear(); this.cachePixels = 0; this.mask = null; this.archClip = null; this.clip = []; this.version = version;
    }
    this.baseScale = scale;
    this.dirty = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
    this.draws = 0; this.recording = record; this.commands = [];
    this.previousUsed = this.used; this.used = new Set();
    if (record) { this.width = width; this.height = height; } else this.setup(width, height);
  }
  private setup(width: number, height: number, x = 0, y = 0) {
    this.width = width; this.height = height;
    this.lastStyle = this.lastClip = this.lastImage = null; this.lastMask = undefined; this.lastArchClip = undefined;
    this.lastBlend = this.lastTransform = ''; this.lastAlpha = -1;
    const gl = this.gl;
    gl.useProgram(this.program); gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD);
    gl.uniform1i(this.u.Projected, 0);
    gl.uniform2f(this.u.Size, width, height); gl.uniform2f(this.u.Origin, x, y); gl.uniform1i(this.u.Image, 3); gl.uniform1i(this.u.Mask, 4);
    gl.viewport(0, 0, width, height);
  }
  project(matrix: Float32Array, planeW: number, planeH: number, stageW: number, stageH: number, pixelW: number, pixelH: number) {
    this.projection = { matrix, planeW, planeH, stageW, stageH, pixelW, pixelH };
    // keep local path and clip coordinates; only vertex placement changes to perspective
    const gl = this.gl;
    gl.uniform1i(this.u.Projected, 1);
    gl.uniformMatrix4fv(this.u.Projection, false, matrix);
    gl.uniform2f(this.u.PlaneScale, planeW / this.width, planeH / this.height);
    gl.uniform2f(this.u.Stage, stageW, stageH);
    gl.viewport(0, 0, pixelW, pixelH);
  }
  bounds(width: number, height: number): Box {
    const d = this.dirty, x = Math.max(0, Math.floor(d.left)), y = Math.max(0, Math.floor(d.top));
    const w = Math.min(width, Math.ceil(d.right)) - x, h = Math.min(height, Math.ceil(d.bottom)) - y;
    return Number.isFinite(x + y + w + h) && w > 0 && h > 0 ? { x, y, w, h } : { x: 0, y: 0, w: 1, h: 1 };
  }
  get empty() { return this.commands.length === 0; }
  resetDraws() { this.draws = 0; }
  replay(width: number, height: number, x: number, y: number) {
    this.recording = false; this.setup(width, height, x, y);
    const c = this.state, clip = this.clip, mask = this.mask, archClip = this.archClip;
    c.save();
    const eligible = (d: Draw) => this.batch && d.kind === 3 && d.stroke < 0 && d.points.length === 8 &&
      typeof d.style === 'string' && !d.mask && !d.archClip && !d.clip.length &&
      (d.blend === 'lighter' || d.blend === 'source-over');
    for (let i = 0; i < this.commands.length;) {
      const d = this.commands[i];
      let end = i + 1;
      if (eligible(d)) while (end < this.commands.length && eligible(this.commands[end]) && this.commands[end].blend === d.blend) end++;
      if (end - i > 1) {
        this.batch!.draw(this.commands, i, end, width, height, x, y, rgba); this.draws++;
        this.setup(width, height, x, y);
        i = end; continue;
      }
      i++;
      c.setTransform(d.transform); c.globalAlpha = d.alpha; c.globalCompositeOperation = d.blend;
      this.clip = d.clip; this.mask = d.mask; this.archClip = d.archClip;
      this.render(d.kind, d.box, d.shape, d.radius, d.stroke, d.style, d.points, d.sprite, d.arch);
    }
    c.restore(); this.clip = clip; this.mask = mask; this.archClip = archClip; this.commands = [];
    this.trim();
  }
  blit(texture: WebGLTexture, box: Box, textureW: number, textureH: number, width: number, height: number) {
    this.setup(width, height);
    const c = this.state, clip = this.clip, mask = this.mask, arch = this.archClip;
    this.clip = []; this.mask = null; this.archClip = null;
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    this.blitUV.set([0, 0, box.w / textureW, box.h / textureH]);
    this.render(5, box, box, 0, -1, '#fff', [], texture);
    c.restore(); this.clip = clip; this.mask = mask; this.archClip = arch;
  }
  clearRect() { /* Warp clears each framebuffer once, before its drawing pass */ }
  save() { this.state.save(); this.stack.push({ clip: this.clip, mask: this.mask, arch: this.archClip }); }
  restore() { this.state.restore(); const v = this.stack.pop(); if (v) { this.clip = v.clip; this.mask = v.mask; this.archClip = v.arch; } }
  beginPath() { this.path = empty(); }
  private point(x: number, y: number) {
    const b = this.path.box;
    if (!Number.isFinite(b.x)) { b.x = x; b.y = y; return; }
    const right = Math.max(b.x + b.w, x), bottom = Math.max(b.y + b.h, y);
    b.x = Math.min(b.x, x); b.y = Math.min(b.y, y); b.w = right - b.x; b.h = bottom - b.y;
  }
  moveTo(x: number, y: number) { this.path.ops.push({ name: 'moveTo', args: [x, y] }); this.path.points.push(x, y); this.point(x, y); }
  lineTo(x: number, y: number) { this.path.ops.push({ name: 'lineTo', args: [x, y] }); this.path.points.push(x, y); this.point(x, y); }
  closePath() { this.path.ops.push({ name: 'closePath', args: [] }); }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number) { this.path.ops.push({ name: 'quadraticCurveTo', args: [cx, cy, x, y] }); this.point(cx, cy); this.point(x, y); }
  arc(x: number, y: number, r: number, start: number, end: number) {
    this.path.ops.push({ name: 'arc', args: [x, y, r, start, end] });
    this.path.kind = 2; this.path.radius = r; this.path.box = { x: x - r, y: y - r, w: r * 2, h: r * 2 };
  }
  roundRect(x: number, y: number, w: number, h: number, r: number) {
    if (w < 0) { x += w; w = -w; } if (h < 0) { y += h; h = -h; }
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    this.path.ops.push({ name: 'roundRect', args: [x, y, w, h, r] });
    this.path.kind = 1; this.path.radius = r; this.path.box = { x, y, w, h };
  }
  createLinearGradient(x0: number, y0: number, x1: number, y1: number) {
    const native = this.state.createLinearGradient(x0, y0, x1, y1), g: Gradient = { x0, y0, x1, y1, stops: [] };
    const add = native.addColorStop.bind(native);
    native.addColorStop = (at, col) => { add(at, col); g.stops.push([at, rgba(col)]); g.stops.sort((a, b) => a[0] - b[0]); };
    this.gradients.set(native, g); return native;
  }
  private polygon(points: number[]) {
    let area = 0;
    for (let i = 0; i < points.length; i += 2) { const j = (i + 2) % points.length; area += points[i] * points[j + 1] - points[j] * points[i + 1]; }
    if (area >= 0) return points;
    const out: number[] = []; for (let i = points.length - 2; i >= 0; i -= 2) out.push(points[i], points[i + 1]); return out;
  }
  private style(style: string | CanvasGradient | CanvasPattern) {
    if (style === this.lastStyle) return;
    this.lastStyle = style;
    const gl = this.gl, g = typeof style === 'string' ? null : this.gradients.get(style as CanvasGradient);
    this.colours.fill(0); this.stops.fill(0);
    if (g) {
      g.stops.slice(0, 6).forEach(([at, col], i) => { this.colours.set(col, i * 4); this.stops[i] = at; });
      gl.uniform1i(this.u.Stops, Math.min(6, g.stops.length)); gl.uniform4f(this.u.Gradient, g.x0, g.y0, g.x1, g.y1);
    } else { this.colours.set(rgba(String(style)), 0); gl.uniform1i(this.u.Stops, 1); }
    gl.uniform4fv(this.u.Color, this.colours); gl.uniform1fv(this.u.Stop, this.stops);
  }
  private render(kind: number, box: Box, shape: Box, radius: number, stroke: number, style: string | CanvasGradient | CanvasPattern, points: number[] = [], sprite?: WebGLTexture, arch?: Arch) {
    if (box.w <= 0 || box.h <= 0 || !Number.isFinite(box.x + box.y + box.w + box.h)) return;
    const gl = this.gl, ctx = this.state, t = ctx.getTransform();
    if (!this.baking && !this.recording && this.noteBatch && kind === 3 && points.length >= 6 && points.length <= 12 &&
        typeof style === 'string' && !this.mask && !this.clip.length && (ctx.globalCompositeOperation === 'source-over' || ctx.globalCompositeOperation === 'lighter')) {
      if (this.pending.length) this.flushSprites();
      if (this.polygons.length && (this.polygons[0].archClip !== this.archClip || this.polygons[0].blend !== ctx.globalCompositeOperation)) this.flushPolygons();
      this.polygons.push({ kind, box, shape, radius, stroke, style, points, transform: t, alpha: ctx.globalAlpha, blend: ctx.globalCompositeOperation, clip: this.clip, mask: this.mask, archClip: this.archClip });
      return;
    }
    if (!this.baking) this.flushSprites();
    if (ctx.globalAlpha === 0 && ctx.globalCompositeOperation !== 'destination-in') return;
    if (sprite) this.used.add(sprite);
    this.density = Math.max(.01, Math.min(Math.hypot(t.a, t.b), Math.hypot(t.c, t.d)));
    const transformKey = `${t.a},${t.b},${t.c},${t.d},${t.e},${t.f}`;
    if (this.lastTransform !== transformKey) {
      this.lastTransform = transformKey;
      this.transform.set([t.a, t.b, 0, t.c, t.d, 0, t.e, t.f, 1]);
      if (!this.recording) { gl.uniformMatrix3fv(this.u.Transform, false, this.transform); gl.uniform1f(this.u.AA, 1 / this.density); }
    }
    if (this.trackBounds && kind !== 5) {
      const d = this.dirty;
      for (const x of [box.x, box.x + box.w]) for (const y of [box.y, box.y + box.h]) {
        const px = t.a * x + t.c * y + t.e, py = t.b * x + t.d * y + t.f;
        d.left = Math.min(d.left, px - 1); d.top = Math.min(d.top, py - 1); d.right = Math.max(d.right, px + 1); d.bottom = Math.max(d.bottom, py + 1);
      }
    }
    if (this.recording) {
      this.commands.push({ kind, box, shape, radius, stroke, style, points: points.slice(), sprite, arch, transform: t, alpha: ctx.globalAlpha, blend: ctx.globalCompositeOperation, clip: this.clip, mask: this.mask, archClip: this.archClip });
      return;
    }
    if (kind === 5) gl.uniform4fv(this.u.ImageRect, this.blitUV);
    else if (kind === 4) gl.uniform4f(this.u.ImageRect, 0, 0, 1, 1);
    gl.uniform4f(this.u.Box, box.x, box.y, box.w, box.h);
    gl.uniform4f(this.u.Shape, shape.x, shape.y, shape.w, shape.h);
    gl.uniform1f(this.u.Radius, radius); gl.uniform1f(this.u.Stroke, stroke);
    gl.uniform1i(this.u.Kind, kind);
    if (arch) { gl.uniform4fv(this.u.Arch, arch.centers); gl.uniform1f(this.u.Spring, arch.spring); }
    if (this.lastArchClip !== this.archClip) {
      this.lastArchClip = this.archClip;
      gl.uniform1i(this.u.HasArchClip, this.archClip?.shape.kind ?? 0);
      if (this.archClip) {
        const { shape: a, inverse, aa } = this.archClip, b = a.box;
        gl.uniform4fv(this.u.ArchClip, a.centers); gl.uniform4f(this.u.ArchClipShape, b.x, b.y, b.w, b.h);
        gl.uniform3f(this.u.ArchClipParams, a.radius, a.spring, aa); gl.uniformMatrix3fv(this.u.ArchClipTransform, false, inverse);
      }
    }
    if (this.lastAlpha !== ctx.globalAlpha) { this.lastAlpha = ctx.globalAlpha; gl.uniform1f(this.u.Alpha, ctx.globalAlpha); }
    this.style(style);
    if (kind === 3) { this.vertices.fill(0); this.vertices.set(points); gl.uniform2fv(this.u.Points, this.vertices); gl.uniform1i(this.u.Count, points.length / 2); }
    if (this.lastClip !== this.clip) {
      this.lastClip = this.clip; this.vertices.fill(0); this.vertices.set(this.clip);
      gl.uniform2fv(this.u.Clip, this.vertices); gl.uniform1i(this.u.ClipCount, this.clip.length / 2);
    }
    const white = this.fallback();
    if (this.lastMask !== this.mask) {
      this.lastMask = this.mask; gl.uniform1i(this.u.HasMask, this.mask ? 1 : 0);
      gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, this.mask ?? white);
    }
    // sampler uniforms remain complete even on a primitive which does not read its image
    const image = sprite ?? white;
    if (this.lastImage !== image) { this.lastImage = image; gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, image); }
    if (this.lastBlend !== ctx.globalCompositeOperation) {
      this.lastBlend = ctx.globalCompositeOperation;
      switch (ctx.globalCompositeOperation) {
      case 'lighter': gl.blendFunc(gl.ONE, gl.ONE); break;
      case 'destination-out': gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA); break;
      case 'destination-in': gl.blendFunc(gl.ZERO, gl.SRC_ALPHA); break;
      default: gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    }
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); this.draws++;
  }
  private white: WebGLTexture | null = null;
  private fallback() {
    if (!this.white) { const c = document.createElement('canvas'); c.width = c.height = 1; const cx = c.getContext('2d')!; cx.fillStyle = '#fff'; cx.fillRect(0, 0, 1, 1); this.white = this.upload(c); }
    return this.white;
  }
  private upload(c: HTMLCanvasElement) {
    const gl = this.gl, texture = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    this.lastImage = null; this.uploads++; this.uploadPixels += c.width * c.height; return texture;
  }
  private bitmap(key: string, box: Box, density: number, paint: (ctx: CanvasRenderingContext2D) => void, slot?: PathSlot): Sprite {
    const asset = slot ? this.assets.get(slot) : undefined;
    if (asset?.key === key) return asset.sprite;
    const old = slot ? undefined : this.sprites.get(key);
    if (old) { this.sprites.delete(key); this.sprites.set(key, old); return old; }
    const c = this.raster;
    c.width = Math.max(1, Math.ceil(box.w * density)); c.height = Math.max(1, Math.ceil(box.h * density));
    const ctx = c.getContext('2d')!; ctx.setTransform(c.width / box.w, 0, 0, c.height / box.h, -box.x * c.width / box.w, -box.y * c.height / box.h);
    paint(ctx);
    const value = { texture: this.upload(c), box, pixels: c.width * c.height };
    if (slot) {
      // geometry, scale or appearance changes replace this asset instead of retaining old full-size textures
      if (asset) this.gl.deleteTexture(asset.sprite.texture);
      this.assets.set(slot, { key, sprite: value });
      return value;
    }
    this.cachePixels += value.pixels;
    this.sprites.set(key, value);
    this.trim(key);
    return value;
  }
  private trim(key = '') {
    // keep the active frame's glyphs, even when an end screen exceeds the cold-cache budget
    while (this.sprites.size > 192 || this.cachePixels > .5e6) {
      const first = [...this.sprites.keys()].find(k => k !== key && !this.used.has(this.sprites.get(k)!.texture) && !this.previousUsed.has(this.sprites.get(k)!.texture));
      if (!first) break;
      const evicted = this.sprites.get(first)!; this.gl.deleteTexture(evicted.texture); this.cachePixels -= evicted.pixels; this.sprites.delete(first);
    }
  }
  private appearance(ctx: CanvasRenderingContext2D) {
    const from = this.state;
    for (const k of ['fillStyle', 'strokeStyle', 'lineWidth', 'lineCap', 'lineJoin', 'miterLimit', 'font', 'textAlign', 'textBaseline', 'fontStretch', 'letterSpacing', 'shadowColor', 'shadowBlur', 'shadowOffsetX', 'shadowOffsetY'] as const) {
      let value: unknown = from[k];
      if ((k === 'fillStyle' || k === 'strokeStyle') && typeof value !== 'string') {
        const g = this.gradients.get(value as CanvasGradient);
        if (g) {
          const gradient = ctx.createLinearGradient(g.x0, g.y0, g.x1, g.y1);
          for (const [at, col] of g.stops) {
            const a = col[3];
            gradient.addColorStop(at, a ? `rgba(${col[0] / a * 255},${col[1] / a * 255},${col[2] / a * 255},${a})` : 'rgba(0,0,0,0)');
          }
          value = gradient;
        }
      }
      (ctx as unknown as Record<string, unknown>)[k] = value;
    }
  }
  private appearanceKey(stroke: boolean) {
    const c = this.state, style = stroke ? c.strokeStyle : c.fillStyle;
    const g = typeof style === 'string' ? style : this.gradients.get(style as CanvasGradient);
    return JSON.stringify([g, stroke && c.lineWidth, c.lineCap, c.lineJoin, c.font, c.textAlign, c.textBaseline, c.fontStretch, c.letterSpacing, c.shadowColor, c.shadowBlur, c.shadowOffsetX, c.shadowOffsetY]);
  }
  private svg(p: Path2D, stroke: boolean, mask = false) {
    let id = this.svgIds.get(p); if (id === undefined) { id = ++this.nextId; this.svgIds.set(p, id); }
    const asset = paths.get(p); if (!asset) throw new Error('unregistered GPU path');
    const { box: b, slot, arch } = asset;
    const ctx = this.state, t = ctx.getTransform(), density = Math.max(Math.hypot(t.a, t.b), Math.hypot(t.c, t.d));
    if (arch) {
      if (mask) {
        const inverse = t.inverse();
        this.archClip = { shape: arch, aa: 1 / density, inverse: new Float32Array([inverse.a, inverse.b, 0, inverse.c, inverse.d, 0, inverse.e, inverse.f, 1]) };
        this.mask = null;
      } else {
        const pad = (stroke ? ctx.lineWidth * ctx.miterLimit / 2 : 0) + 2 / density;
        this.render(arch.kind, expand(arch.box, pad), arch.box, arch.radius, stroke ? ctx.lineWidth : -1, stroke ? ctx.strokeStyle : ctx.fillStyle, [], undefined, arch);
      }
      return;
    }
    if (mask) {
      this.archClip = null;
      const key = 'mask:' + id + ':' + [this.width, this.height, t.a, t.d, t.e, t.f].join(',');
      const s = this.bitmap(key, { x: 0, y: 0, w: this.width, h: this.height }, 1, c => { c.setTransform(t); c.fillStyle = '#fff'; c.fill(p); }, slot);
      this.mask = s.texture; return;
    }
    const box = expand(b, (stroke ? ctx.lineWidth * ctx.miterLimit : 0) + 2 / density);
    const key = 'svg:' + id + ':' + density + ':' + this.appearanceKey(stroke);
    const s = this.bitmap(key, box, density, c => { this.appearance(c); if (stroke) c.stroke(p); else c.fill(p); }, slot);
    this.render(4, s.box, s.box, 0, -1, '#fff', [], s.texture);
  }
  clipPath(p?: Path2D) {
    if (p) this.svg(p, false, true);
    else this.clip = this.polygon(this.path.points);
  }
  fill(p?: Path2D) { if (p) this.svg(p, false); else this.paint(false); }
  stroke(p?: Path2D) { if (p) this.svg(p, true); else this.paint(true); }
  fillRect(x: number, y: number, w: number, h: number) {
    if (w < 0) { x += w; w = -w; } if (h < 0) { y += h; h = -h; }
    const b = { x, y, w, h }; this.render(1, expand(b, 1), b, 0, -1, this.state.fillStyle);
  }
  private paint(stroke: boolean) {
    const p = this.path, c = this.state, style = stroke ? c.strokeStyle : c.fillStyle, width = stroke ? c.lineWidth : -1;
    const t = c.getTransform(), pad = (stroke ? c.lineWidth * c.miterLimit / 2 : 0) + 2 / Math.max(.01, Math.min(Math.hypot(t.a, t.b), Math.hypot(t.c, t.d)));
    if (p.kind === 1 || p.kind === 2) {
      const shape = p.kind === 2 ? { ...p.box, x: p.box.x + p.radius, y: p.box.y + p.radius } : p.box;
      this.render(p.kind, expand(p.box, pad), shape, p.radius, width, style); return;
    }
    if (p.points.length === 4 && p.ops.every(o => o.name === 'moveTo' || o.name === 'lineTo')) {
      const [x0, y0, x1, y1] = p.points, dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
      if (!len || !stroke) return;
      const ux = dx / len, uy = dy / len, h = c.lineWidth / 2;
      if (c.lineCap === 'round') {
        c.save(); c.translate(x0, y0); c.rotate(Math.atan2(dy, dx));
        const b = { x: -h, y: -h, w: len + 2 * h, h: 2 * h }; this.render(1, expand(b, pad), b, h, -1, style); c.restore();
      } else {
        const pts = [x0 - uy * h, y0 + ux * h, x0 + uy * h, y0 - ux * h, x1 + uy * h, y1 - ux * h, x1 - uy * h, y1 + ux * h];
        this.render(3, expand(p.box, pad), p.box, 0, -1, style, this.polygon(pts));
      }
      return;
    }
    if (p.points.length >= 6 && p.points.length <= 16 && p.ops.every(o => ['moveTo', 'lineTo', 'closePath'].includes(o.name))) {
      this.render(3, expand(p.box, pad), p.box, 0, width, style, this.polygon(p.points)); return;
    }
    // the curved four-point spark is a tiny cached silhouette, scaled and rotated by the original canvas transform
    const b = p.box, size = Math.max(b.w, b.h); if (!size) return;
    const norm = p.ops.map(o => ({ name: o.name, args: o.args.map((v, i) => +((v - (i % 2 ? b.y : b.x)) / size).toFixed(5)) }));
    const originalStyle = c.fillStyle, originalAlpha = c.globalAlpha;
    if (!stroke && typeof originalStyle === 'string') {
      const col = rgba(originalStyle), a = col[3];
      c.fillStyle = a ? `rgb(${col[0] / a * 255},${col[1] / a * 255},${col[2] / a * 255})` : '#000';
      c.globalAlpha *= a;
    }
    const key = 'path:' + JSON.stringify(norm) + ':' + this.appearanceKey(stroke);
    const box = { x: -.05, y: -.05, w: b.w / size + .1, h: b.h / size + .1 };
    const s = this.bitmap(key, box, 64, cx => {
      this.appearance(cx); cx.beginPath();
      for (const o of norm) (cx as unknown as Record<string, (...args: number[]) => void>)[o.name](...o.args);
      if (stroke) cx.stroke(); else cx.fill();
    });
    const dest = { x: b.x + s.box.x * size, y: b.y + s.box.y * size, w: s.box.w * size, h: s.box.h * size };
    this.render(4, dest, dest, 0, -1, '#fff', [], s.texture);
    c.fillStyle = originalStyle; c.globalAlpha = originalAlpha;
  }
  private text(text: string, x: number, y: number, stroke: boolean) {
    const c = this.state; if (c.globalAlpha === 0) return;
    const metrics = c.measureText(text), t = c.getTransform();
    const density = Math.max(1, Math.ceil(Math.max(Math.hypot(t.a, t.b), Math.hypot(t.c, t.d))));
    const pad = (stroke ? c.lineWidth * (c.lineJoin === 'miter' ? c.miterLimit : 1) / 2 : 0) + c.shadowBlur * 2 + Math.max(Math.abs(c.shadowOffsetX), Math.abs(c.shadowOffsetY)) + 2;
    const b = expand({ x: -metrics.actualBoundingBoxLeft, y: -metrics.actualBoundingBoxAscent, w: metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight, h: metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent }, pad);
    const key = 'text:' + text + ':' + density + ':' + this.baseScale + ':' + this.appearanceKey(stroke);
    const s = this.bitmap(key, b, density, cx => { this.appearance(cx); cx.shadowBlur *= density / this.baseScale; cx.shadowOffsetX *= density / this.baseScale; cx.shadowOffsetY *= density / this.baseScale; if (stroke) cx.strokeText(text, 0, 0); else cx.fillText(text, 0, 0); });
    const box = { ...s.box, x: s.box.x + x, y: s.box.y + y };
    this.render(4, box, box, 0, -1, '#fff', [], s.texture);
  }
  fillText(text: string, x: number, y: number) { this.text(text, x, y, false); }
  strokeText(text: string, x: number, y: number) { this.text(text, x, y, true); }
  get canvasPixels() { return this.state.canvas.width * this.state.canvas.height + this.raster.width * this.raster.height; }
  get bitmapPixels() { return this.retainedPixels + this.cachePixels + [...this.assets.values()].reduce((sum, a) => sum + a.sprite.pixels, 0) + (this.white ? 1 : 0); }
  dispose() {
    this.dropRetained(); this.retainedBatch?.dispose(); this.retainedBatch = null;
    if (this.retainedFramebuffer) this.gl.deleteFramebuffer(this.retainedFramebuffer);
    this.pending.length = 0; this.polygons.length = 0; this.noteBatch?.dispose(); this.noteBatch = null;
    for (const s of this.sprites.values()) this.gl.deleteTexture(s.texture);
    for (const { sprite } of this.assets.values()) this.gl.deleteTexture(sprite.texture);
    this.assets.clear(); this.sprites.clear(); if (this.white) this.gl.deleteTexture(this.white);
    this.batch?.dispose(); this.batch = null;
    this.gl.deleteProgram(this.program); this.gl.deleteBuffer(this.buffer);
    this.commands = []; this.used.clear(); this.previousUsed.clear();
    this.raster.width = this.raster.height = this.state.canvas.width = this.state.canvas.height = 1;
  }
}
