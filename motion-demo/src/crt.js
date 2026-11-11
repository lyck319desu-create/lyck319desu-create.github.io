import * as THREE from 'three';
import { PALETTE } from './palette.js';

const W = 256;
const H = 192;

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Barrel distortion, RGB split, scanlines and a rolling bar: a tiny CRT.
const fragmentShader = /* glsl */ `
  uniform sampler2D map;
  uniform float uTime;
  uniform float uPower;
  varying vec2 vUv;

  void main() {
    vec2 uv = vUv * 2.0 - 1.0;
    uv *= 1.0 + dot(uv, uv) * 0.09;
    uv = uv * 0.5 + 0.5;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
      gl_FragColor = vec4(0.012, 0.012, 0.016, 1.0);
      return;
    }
    float split = 0.004;
    vec3 c;
    c.r = texture2D(map, uv + vec2(split, 0.0)).r;
    c.g = texture2D(map, uv).g;
    c.b = texture2D(map, uv - vec2(split, 0.0)).b;
    c *= 0.72 + 0.28 * sin(uv.y * 192.0 * 3.14159);
    c += 0.06 * smoothstep(0.0, 0.04, 0.04 - abs(fract(uv.y - uTime * 0.25) - 0.5));
    vec2 v = uv * (1.0 - uv);
    c *= pow(v.x * v.y * 16.0, 0.25);
    gl_FragColor = vec4(c * uPower, 1.0);
  }
`;

export function createCRT() {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;

  const material = new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, uTime: { value: 0 }, uPower: { value: 1 } },
    vertexShader,
    fragmentShader,
  });

  const bars = [PALETTE.plate, PALETTE.yellow, '#33e0ff', '#2bd96b', PALETTE.magenta, PALETTE.red, PALETTE.blue];

  function draw(t) {
    g.fillStyle = '#0b0d1a';
    g.fillRect(0, 0, W, H);

    // Color bars, sliding sideways.
    const bw = W / bars.length;
    const shift = (t * 30) % bw;
    for (let i = -1; i < bars.length + 1; i++) {
      g.fillStyle = bars[(i + bars.length) % bars.length];
      g.fillRect(i * bw + shift, 0, bw + 1, H * 0.42);
    }

    // Oscilloscope trace.
    g.strokeStyle = '#ffffff';
    g.lineWidth = 2;
    g.beginPath();
    for (let x = 0; x <= W; x += 4) {
      const y = H * 0.68 + Math.sin(x * 0.05 + t * 4) * 16 * Math.sin(t * 0.9 + x * 0.01);
      x === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.stroke();

    g.fillStyle = '#ffffff';
    g.font = 'bold 15px monospace';
    g.fillText('CH-04', 10, H - 12);
    g.fillStyle = Math.floor(t * 2) % 2 ? PALETTE.red : '#550000';
    g.beginPath();
    g.arc(W - 62, H - 17, 5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffffff';
    g.font = '13px monospace';
    g.fillText('REC', W - 52, H - 12);
    const tc = t.toFixed(2).padStart(6, '0');
    g.fillText(tc, W / 2 - 22, H - 12);

    map.needsUpdate = true;
  }

  return {
    material,
    resolution: `${W}x${H}`,
    update(t) {
      draw(t);
      material.uniforms.uTime.value = t;
    },
  };
}
