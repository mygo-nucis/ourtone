/* shared floor coverage for primitives and retained sprites */
export const ARCH_SHADER = `float arch(vec2 p, vec4 box, vec4 centers, float radius, float spring) {
  float sides = max(max(box.x - p.x, p.x - box.x - box.z), p.y - box.y - box.w);
  // Below the spring the cap cannot affect this distance. Most highway pixels
  // take this branch, including every lower lane and hit effect.
  if (spring - p.y <= sides) return sides;
  vec2 a = p - centers.xy, b = p - centers.zw;
  float cap = sqrt(max(dot(a, a), dot(b, b))) - radius;
  return max(sides, min(cap, spring - p.y));
}
// nearest point on rectD's quadratic corner: (x,y) = ((1-t)^2,t^2)
float cornerDistance(vec2 p, float t) {
  t = clamp(t, 0.0, 1.0);
  return length(vec2((1.0 - t) * (1.0 - t), t * t) - p);
}
float quadraticRect(vec2 point, vec4 box, float radius) {
  vec2 edge = min(point - box.xy, box.xy + box.zw - point);
  float d = -min(edge.x, edge.y);
  if (edge.x < radius && edge.y < radius) {
    vec2 uv = edge / radius;
    float p = .75 - .5 * (uv.x + uv.y), q = .25 * (uv.x - uv.y);
    float delta = q * q * .25 + p * p * p / 27.0, dist;
    if (delta >= 0.0) {
      vec2 z = vec2(-q * .5) + vec2(1.0, -1.0) * sqrt(delta);
      vec2 roots = sign(z) * pow(abs(z), vec2(1.0 / 3.0));
      dist = cornerDistance(uv, roots.x + roots.y + .5);
    } else {
      float r = sqrt(-p / 3.0), angle = acos(clamp(-q / (2.0 * r * r * r), -1.0, 1.0)) / 3.0;
      dist = min(cornerDistance(uv, 2.0 * r * cos(angle) + .5), min(cornerDistance(uv, 2.0 * r * cos(angle + 2.0943951) + .5), cornerDistance(uv, 2.0 * r * cos(angle + 4.1887902) + .5)));
    }
    float side = sign(1.0 - sqrt(max(uv.x, 0.0)) - sqrt(max(uv.y, 0.0)));
    d = max(d, dist * radius * side);
  }
  return d;
}
`;
