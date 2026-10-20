import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// Runs after OutputPass, so it works in display (sRGB) space.
export const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uRes: { value: new THREE.Vector2(1, 1) },
    uDpr: { value: 1 },
    uTime: { value: 0 },
    uRegion: { value: new THREE.Vector4(0, 0, 0, 0) }, // halftone rect in uv: x0, y0, x1, y1
    uHalftone: { value: 0 },
    uScanY: { value: 0.5 },
    uScan: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uRes;
    uniform float uDpr;
    uniform float uTime;
    uniform vec4 uRegion;
    uniform float uHalftone;
    uniform float uScanY;
    uniform float uScan;
    varying vec2 vUv;

    vec3 spectrum(float h) {
      return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    }
    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    }

    vec3 halftone(vec2 frag, vec3 under) {
      float cell = 7.0 * uDpr;
      float a = 0.785398;
      mat2 rot = mat2(cos(a), sin(a), -sin(a), cos(a));
      mat2 inv = mat2(cos(a), -sin(a), sin(a), cos(a));
      vec2 p = rot * frag;
      vec2 center = (floor(p / cell) + 0.5) * cell;
      vec3 c = texture2D(tDiffuse, (inv * center) / uRes).rgb;
      float lum = dot(c, vec3(0.299, 0.587, 0.114));
      float maxc = max(c.r, max(c.g, c.b));
      float sat = maxc - min(c.r, min(c.g, c.b));
      float ink = clamp((max(1.0 - lum, sat * 0.9) - 0.14) / 0.86, 0.0, 1.0);
      float radius = sqrt(ink) * cell * 0.62;
      float d = length(p - center);
      float m = 1.0 - smoothstep(radius - 0.9, radius + 0.9, d);
      vec3 dotColor = sat > 0.12 ? c / max(maxc, 0.001) * mix(0.75, 1.0, lum) : vec3(0.08);
      // dots printed over a washed-out copy of the image, so forms still read
      vec3 paper = mix(under, vec3(0.969, 0.969, 0.961), 0.6);
      return mix(paper, dotColor, m * 0.9);
    }

    void main() {
      vec2 frag = vUv * uRes;
      float dy = (vUv.y - uScanY) * uRes.y / uDpr;
      float glow = exp(-abs(dy) / 16.0) * uScan;

      // chromatic split that leaks off the spectral line
      vec2 ca = vec2(glow * 0.006, 0.0);
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + ca).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - ca).b;

      vec2 inR = step(uRegion.xy, vUv) * step(vUv, uRegion.zw);
      if (uHalftone > 0.001 && inR.x * inR.y > 0.5) {
        col = mix(col, halftone(frag, col), uHalftone);
      }

      // spectral line: rainbow core with a soft bloom halo
      vec3 rainbow = spectrum(vUv.x * 1.15 - uTime * 0.12);
      float core = exp(-dy * dy / 2.2) * uScan;
      float flicker = 0.9 + 0.1 * sin(uTime * 53.0);
      col = mix(col, rainbow, clamp(glow * 0.45 * flicker, 0.0, 1.0));
      col = mix(col, mix(rainbow, vec3(1.0), 0.45), clamp(core, 0.0, 1.0));
      col += rainbow * exp(-abs(dy) / 60.0) * 0.06 * uScan;

      col += (hash(frag + fract(uTime) * 100.0) - 0.5) * 0.018;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export function createComposer(renderer, scene, camera) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(size.x, size.y, { samples: 4, type: THREE.HalfFloatType });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new OutputPass());
  const final = new ShaderPass(FinalShader);
  composer.addPass(final);
  return { composer, final };
}
