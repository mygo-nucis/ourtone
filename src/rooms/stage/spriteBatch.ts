import { ARCH_SHADER } from './gpuClip';

type Box = { x: number; y: number; w: number; h: number };
export type Projection = { matrix: Float32Array; planeW: number; planeH: number; stageW: number; stageH: number; pixelW: number; pixelH: number };
export type SpriteQuad = { box: Box; transform: DOMMatrix; alpha: number };
type Clip = { shape: { kind: number; box: Box; centers: number[]; radius: number; spring: number }; inverse: Float32Array; aa: number };

/* a stream of already-painted appearances: one upload of positions, one draw per texture, in original order */
const VS = `attribute vec2 aPixel; attribute vec2 aUV; attribute float aAlpha;
uniform vec2 uSize; uniform int uProjected; uniform mat4 uProjection; uniform vec2 uPlaneScale; uniform vec2 uStage;
varying vec2 vPixel; varying vec2 vUV; varying float vAlpha;
void main() {
  vPixel = aPixel; vUV = aUV; vAlpha = aAlpha;
  if (uProjected == 1) {
    vec4 p = uProjection * vec4(aPixel * uPlaneScale, 0.0, 1.0);
    gl_Position = vec4(p.x * 2.0 / uStage.x - p.w, p.w - p.y * 2.0 / uStage.y, 0.0, p.w);
  } else gl_Position = vec4(aPixel.x * 2.0 / uSize.x - 1.0, 1.0 - aPixel.y * 2.0 / uSize.y, 0.0, 1.0);
}`;
const FS = `precision highp float;
varying vec2 vPixel; varying vec2 vUV; varying float vAlpha;
uniform sampler2D uImage;
uniform int uClip; uniform vec4 uArch; uniform vec4 uShape; uniform vec3 uParams; uniform mat3 uInverse;
${ARCH_SHADER}
void main() {
  float cover = 1.0;
  if (uClip > 0) {
    vec2 p = (uInverse * vec3(vPixel, 1.0)).xy;
    float d = uClip == 6 ? arch(p, uShape, uArch, uParams.x, uParams.y) : quadraticRect(p, uShape, uParams.x);
    cover = clamp(.5 - d / uParams.z, 0.0, 1.0);
  }
  gl_FragColor = texture2D(uImage, vUV) * (vAlpha * cover);
}`;
const CORNERS = [0, 1, 2, 2, 1, 3];
export class SpriteBatch {
  private program: WebGLProgram;
  private buffer: WebGLBuffer;
  private data = new Float32Array(128 * 6 * 5);
  private u: Record<string, WebGLUniformLocation | null> = {};
  constructor(private gl: WebGLRenderingContext) {
    const shader = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { const error = gl.getShaderInfoLog(sh); gl.deleteShader(sh); throw new Error(error || 'sprite shader'); }
      return sh;
    };
    const vs = shader(gl.VERTEX_SHADER, VS), fs = shader(gl.FRAGMENT_SHADER, FS), p = gl.createProgram()!;
    gl.attachShader(p, vs); gl.attachShader(p, fs);
    ['aPixel', 'aUV', 'aAlpha'].forEach((name, i) => gl.bindAttribLocation(p, i, name));
    gl.linkProgram(p); gl.deleteShader(vs); gl.deleteShader(fs);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'sprite program');
    this.program = p; this.buffer = gl.createBuffer()!;
    for (const name of ['Size','Projected','Projection','PlaneScale','Stage','Image','Clip','Arch','Shape','Params','Inverse']) this.u[name] = gl.getUniformLocation(p, 'u' + name);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer); gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.STREAM_DRAW);
  }
  draw(quads: SpriteQuad[], texture: WebGLTexture, width: number, height: number, projection: Projection | null, clip: Clip | null) {
    const gl = this.gl, required = quads.length * 30;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    if (required > this.data.length) {
      let capacity = this.data.length; while (capacity < required) capacity *= 2;
      this.data = new Float32Array(capacity); gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.STREAM_DRAW);
    }
    let offset = 0;
    for (const q of quads) for (const corner of CORNERS) {
      const x = q.box.x + (corner & 1 ? q.box.w : 0), y = q.box.y + (corner & 2 ? q.box.h : 0), t = q.transform;
      this.data[offset++] = t.a * x + t.c * y + t.e;
      this.data[offset++] = t.b * x + t.d * y + t.f;
      this.data[offset++] = corner & 1 ? 1 : 0;
      this.data[offset++] = corner & 2 ? 0 : 1;
      this.data[offset++] = q.alpha;
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data.subarray(0, offset));
    gl.useProgram(this.program);
    gl.uniform2f(this.u.Size, width, height); gl.uniform1i(this.u.Projected, projection ? 1 : 0);
    if (projection) {
      gl.uniformMatrix4fv(this.u.Projection, false, projection.matrix);
      gl.uniform2f(this.u.PlaneScale, projection.planeW / width, projection.planeH / height);
      gl.uniform2f(this.u.Stage, projection.stageW, projection.stageH);
    }
    gl.uniform1i(this.u.Clip, clip?.shape.kind ?? 0);
    if (clip) {
      const a = clip.shape, b = a.box;
      gl.uniform4fv(this.u.Arch, a.centers); gl.uniform4f(this.u.Shape, b.x, b.y, b.w, b.h);
      gl.uniform3f(this.u.Params, a.radius, a.spring, clip.aa); gl.uniformMatrix3fv(this.u.Inverse, false, clip.inverse);
    }
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, texture); gl.uniform1i(this.u.Image, 3);
    for (let i = 0; i < 3; i++) {
      gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, i === 2 ? 1 : 2, gl.FLOAT, false, 20, i * 8);
    }
    gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLES, 0, quads.length * 6);
    gl.disableVertexAttribArray(1); gl.disableVertexAttribArray(2);
  }
  dispose() { this.gl.deleteBuffer(this.buffer); this.gl.deleteProgram(this.program); }
}
