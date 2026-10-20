import { screenPosition, fmt } from './util.js';
import * as THREE from 'three';

const CODE = `// halftone.frag
vec2 p = rot * gl_FragCoord.xy;
vec2 c = (floor(p / cell) + .5) * cell;
float ink = 1. - luma(texture(tDiffuse, c));
float r = sqrt(ink) * cell * .62;
col = mix(paper, ink_rgb, 1. - smoothstep(r-.9, r+.9, d));

// spectral.frag
float glow = exp(-abs(dy) / 16.) * uScan;
col = mix(col, spectrum(vUv.x - t * .12), glow);

// timeline.js
tl.to(piece.scale, { y: 1, ease: 'elastic.out(1,.45)' })
  .to(hemi, { gap: 6.2, ease: 'elastic.out(1,.6)' })
  .fromTo(thread, { head: 0 }, { head: 1 });`;

const SVG_NS = 'http://www.w3.org/2000/svg';

export function createHUD() {
  const $ = (id) => document.getElementById(id);
  const el = {
    hud: $('hud'),
    fps: $('fps'), frame: $('frame'), time: $('time'), loop: $('loop'),
    res: $('res'), dpr: $('dpr'), calls: $('calls'), tris: $('tris'),
    code: $('code'), scenes: $('scenes'), bar: $('bar'),
    labels: $('labels'), leaders: $('leaders'),
    dim: $('dim-label'), halftone: $('halftone-frame'), scan: $('scan-label'),
  };

  const labels = new Map();
  function label(key) {
    if (labels.has(key)) return labels.get(key);
    const div = document.createElement('div');
    div.className = 'lbl';
    el.labels.appendChild(div);
    const line = document.createElementNS(SVG_NS, 'line');
    const ring = document.createElementNS(SVG_NS, 'circle');
    ring.setAttribute('r', '2.5');
    el.leaders.append(line, ring);
    const entry = { div, line, ring };
    labels.set(key, entry);
    return entry;
  }

  // Leader line from the 3D anchor to a label pushed out by (dx, dy) pixels.
  function place(key, world, camera, w, h, text, visible, dx = 28, dy = -22) {
    const { div, line, ring } = label(key);
    const s = screenPosition(world, camera, w, h);
    const lx = s.x + dx;
    const ly = s.y + dy;
    const o = visible ? 1 : 0;
    div.style.opacity = o;
    line.style.opacity = o;
    ring.style.opacity = o;
    if (!visible) return;
    div.style.transform = dx < 0 ? 'translate(-100%, -100%)' : 'translate(0, -100%)';
    div.style.left = `${lx}px`;
    div.style.top = `${ly}px`;
    div.innerHTML = text;
    line.setAttribute('x1', s.x); line.setAttribute('y1', s.y);
    line.setAttribute('x2', lx); line.setAttribute('y2', ly);
    ring.setAttribute('cx', s.x); ring.setAttribute('cy', s.y);
  }

  const codeLines = CODE.split('\n');
  let typed = 0;
  function typeCode(dt) {
    typed += dt * 90;
    const total = CODE.length + 160;
    if (typed > total) typed = 0;
    let n = Math.floor(typed);
    const shown = [];
    for (const lineText of codeLines) {
      if (n <= 0) break;
      shown.push(lineText.slice(0, n));
      n -= lineText.length + 1;
    }
    const last = shown.length - 1;
    el.code.innerHTML = shown
      .map((l, i) => {
        const safe = l.replace(/&/g, '&amp;').replace(/</g, '&lt;');
        return i === last ? `<span class="hl">${safe}▌</span>` : safe;
      })
      .slice(-12)
      .join('\n');
  }

  function setScenes(names) {
    el.scenes.innerHTML = names.map((n) => `<span data-s="${n}">${n}</span>`).join('');
  }
  function activeScene(name, progress) {
    for (const s of el.scenes.children) s.classList.toggle('on', s.dataset.s === name);
    el.bar.style.width = `${(progress * 100).toFixed(1)}%`;
  }

  function stats({ fps, frame, time, loop, w, h, dpr, info }) {
    el.fps.textContent = fps.toFixed(0);
    el.frame.textContent = frame;
    el.time.textContent = time.toFixed(3);
    el.loop.textContent = loop;
    el.res.textContent = `${w}x${h}`;
    el.dpr.textContent = dpr.toFixed(1);
    el.calls.textContent = info.render.calls;
    el.tris.textContent = info.render.triangles.toLocaleString('en-US');
  }

  function dimension(world, camera, w, h, meters) {
    const s = screenPosition(world, camera, w, h);
    el.dim.style.left = `${s.x}px`;
    el.dim.style.top = `${s.y}px`;
    el.dim.style.opacity = meters > 0.15 ? 1 : 0;
    el.dim.textContent = `d: ${meters.toFixed(1)}m`;
  }

  function halftoneFrame(rectPx, amount) {
    const f = el.halftone.style;
    f.opacity = amount > 0.02 ? 1 : 0;
    f.left = `${rectPx.x}px`;
    f.top = `${rectPx.y}px`;
    f.width = `${rectPx.w}px`;
    f.height = `${rectPx.h}px`;
  }

  function scanline(amount, y) {
    el.scan.style.opacity = amount > 0.05 ? 0.9 : 0;
    el.scan.textContent = `SPECTRAL_LINE · y=${y.toFixed(3)} · i=${amount.toFixed(2)}`;
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'h') el.hud.classList.toggle('hidden');
  });

  return { place, typeCode, setScenes, activeScene, stats, dimension, halftoneFrame, scanline, fmt, Vector3: THREE.Vector3 };
}
