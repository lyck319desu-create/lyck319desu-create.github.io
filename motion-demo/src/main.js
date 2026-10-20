import * as THREE from 'three';
import gsap from 'gsap';
import { PALETTE } from './palette.js';
import { createTower } from './tower.js';
import { createHemisphere } from './hemisphere.js';
import { createThread } from './thread.js';
import { createComposer } from './post.js';
import { createHUD } from './hud.js';
import { fmt, screenPosition } from './util.js';

const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
const dpr = Math.min(window.devicePixelRatio, 2);
renderer.setPixelRatio(dpr);
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(PALETTE.bg);
renderer.info.autoReset = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.bg);

// ── Isometric orthographic camera: look down the (1,1,1) diagonal.
const TARGET = new THREE.Vector3(0.4, 3.1, -0.4);
const ISO_DIR = new THREE.Vector3(1, 1, 1).normalize();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
function frameCamera() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const aspect = w / h;
  // Fit a 25×17 world-unit window into any aspect, portrait included.
  let halfH = 8.5;
  let halfW = halfH * aspect;
  if (halfW < 12.5) {
    halfW = 12.5;
    halfH = halfW / aspect;
  }
  camera.left = -halfW;
  camera.right = halfW;
  camera.top = halfH;
  camera.bottom = -halfH;
  camera.updateProjectionMatrix();
}
frameCamera();

// ── Lights, floor, grid.
scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d8d4, 2.2));
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.set(-6, 18, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 50 });
sun.shadow.bias = -0.0005;
scene.add(sun);

const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 120).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.1 }));
floor.receiveShadow = true;
scene.add(floor);
const grid = new THREE.GridHelper(60, 60, 0xdcdcd8, 0xe8e8e4);
grid.position.y = -0.001;
scene.add(grid);

// Origin marker + axis gizmo, purely decorative.
{
  const axes = new THREE.Group();
  const mk = (to, color) => new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), to]), new THREE.LineBasicMaterial({ color }));
  axes.add(mk(new THREE.Vector3(1.2, 0, 0), PALETTE.red), mk(new THREE.Vector3(0, 1.2, 0), '#22b05a'), mk(new THREE.Vector3(0, 0, 1.2), PALETTE.blue));
  axes.position.set(-1, 0.01, 9);
  scene.add(axes);
}

// ── Actors.
const TOWER_POS = new THREE.Vector3(-4.5, 0, 4.5);
const HEMI_POS = new THREE.Vector3(4.2, 0.24, -4.2);

const tower = createTower();
tower.root.position.copy(TOWER_POS);
scene.add(tower.root);

const hemi = createHemisphere(dpr);
hemi.root.position.copy(HEMI_POS);
scene.add(hemi.root);

const threadPoints = [];
{
  // spiral up around the tower…
  const turns = 1.6;
  const n = 18;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = Math.PI * 0.75 + t * turns * Math.PI * 2;
    const r = 3.3 + Math.sin(t * Math.PI) * 0.4;
    threadPoints.push(new THREE.Vector3(TOWER_POS.x + Math.cos(a) * r, 0.25 + t * 8.6, TOWER_POS.z + Math.sin(a) * r));
  }
  // …arc over, dive behind the hemisphere, thread the gap, land on the platform.
  const depth = new THREE.Vector3(0, 0, 1); // the hemisphere splits along x, so the gap runs along z
  const h = HEMI_POS;
  threadPoints.push(
    new THREE.Vector3(-0.5, 10.2, -1.5),
    h.clone().addScaledVector(depth, -4.2).add(new THREE.Vector3(0, 4.2, 0)),
    h.clone().addScaledVector(depth, -2.6).add(new THREE.Vector3(0, 1.6, 0)),
    h.clone().add(new THREE.Vector3(0, 1.1, 0)),
    h.clone().addScaledVector(depth, 2.4).add(new THREE.Vector3(0, 0.5, 0)),
    h.clone().addScaledVector(depth, 2.4).add(new THREE.Vector3(2.0, 0.06, 0)),
    h.clone().addScaledVector(depth, 2.4).add(new THREE.Vector3(5.2, 0.06, 0)),
  );
}
const thread = createThread(threadPoints, dpr);
scene.add(thread.root);

// ── Post-processing.
const { composer, final } = createComposer(renderer, scene, camera);
final.uniforms.uDpr.value = dpr;
const fx = { halftone: 0, scan: 0.25, scanY: 0.5 };

// ── Master timeline: build → split → thread → print → hold → collapse, then loop.
const hud = createHUD();
const SCENES = [
  ['BUILD', 0],
  ['SPLIT', 3.0],
  ['THREAD', 4.2],
  ['PRINT', 5.6],
  ['HOLD', 8.8],
  ['COLLAPSE', 11.0],
];
hud.setScenes(SCENES.map(([n]) => n));

let loops = 0;
const tl = gsap.timeline({ repeat: -1, repeatDelay: 0.3, onRepeat: () => loops++ });
SCENES.forEach(([name, t]) => tl.addLabel(name, t));

function flash(at, peak = 1, rest = 0.3) {
  tl.to(fx, { scan: peak, duration: 0.12, ease: 'power2.out' }, at);
  tl.to(fx, { scan: rest, duration: 0.9, ease: 'power2.out' }, at + 0.12);
}

tower.buildIn(tl, 0.1);
flash(0.1, 1, 0.35);
hemi.split(tl, 3.0);
flash(3.0, 0.9, 0.35);
thread.draw(tl, 4.2);
tl.to(fx, { halftone: 1, duration: 1.2, ease: 'expo.out' }, 5.6);
flash(5.6, 1, 0.5);
tl.to(fx, { scanY: 0.56, duration: 1.4, ease: 'sine.inOut', yoyo: true, repeat: 1 }, 8.8);

thread.retract(tl, 11.0);
tl.to(fx, { halftone: 0, duration: 0.6, ease: 'power2.in' }, 11.2);
hemi.close(tl, 11.4);
const end = tower.collapse(tl, 11.6);
flash(end - 0.2, 1, 0.25);
tl.to(fx, { scanY: 0.5, duration: 0.3 }, end - 0.2);
tl.to({}, { duration: 0.4 }, end); // breathing room before the loop restarts

// ── Controls.
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') tl.paused(!tl.paused());
  if (e.key === 'r') {
    loops = 0;
    tl.restart();
  }
});

// Optional ?t=SECONDS to jump to a moment (handy for screenshots).
const jump = parseFloat(new URLSearchParams(location.search).get('t'));
if (!Number.isNaN(jump)) tl.seek(jump);
if (new URLSearchParams(location.search).has('pause')) tl.pause();

// ── Resize.
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  final.uniforms.uRes.value.set(w * dpr, h * dpr);
  frameCamera();
}
window.addEventListener('resize', resize);
resize();

// ── Frame loop.
const clock = new THREE.Clock();
let frame = 0;
let fps = 60;
const tmp = new THREE.Vector3();
const region = new THREE.Vector3();

function anchorLabel(key, group, offset, text, dx, dy) {
  tmp.copy(offset);
  group.localToWorld(tmp);
  const visible = group.visible && group.scale.x > 0.6;
  hud.place(key, tmp, camera, window.innerWidth, window.innerHeight, text, visible, dx, dy);
}

function tick() {
  const dt = Math.min(clock.getDelta(), 0.1);
  const t = clock.elapsedTime;
  fps += (1 / Math.max(dt, 1e-4) - fps) * 0.05;
  frame++;

  // Barely-there camera sway keeps the iso view alive.
  const sway = Math.sin(t * 0.25) * 0.05;
  const dir = ISO_DIR.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), sway);
  camera.position.copy(TARGET).addScaledVector(dir, 60);
  camera.lookAt(TARGET);

  tower.update(t);
  hemi.update();
  thread.update(t);

  const w = window.innerWidth;
  const h = window.innerHeight;

  // Halftone region follows the hemisphere and widens with the split.
  region.copy(HEMI_POS).add(new THREE.Vector3(0, 1.4, 0));
  const c = screenPosition(region, camera, w, h);
  const ppu = h / (camera.top - camera.bottom);
  // the split runs along world x, which projects to (cos45°, sin35°·sin45°) on screen
  const hw = (hemi.state.gap * 0.354 + hemi.radius + 0.9) * ppu * fx.halftone;
  const hh = (hemi.state.gap * 0.204 + hemi.radius + 1.3) * ppu * fx.halftone;
  final.uniforms.uRegion.value.set((c.x - hw) / w, 1 - (c.y + hh) / h, (c.x + hw) / w, 1 - (c.y - hh) / h);
  final.uniforms.uHalftone.value = fx.halftone;
  final.uniforms.uScan.value = fx.scan;
  final.uniforms.uScanY.value = fx.scanY;
  final.uniforms.uTime.value = t;
  hud.halftoneFrame({ x: c.x - hw, y: c.y - hh, w: hw * 2, h: hh * 2 }, fx.halftone);
  hud.scanline(fx.scan, fx.scanY);

  renderer.info.reset();
  composer.render(dt);

  // ── HUD.
  const a = tower.anchors;
  const xyz = (v) => `[${fmt(v.x)} ${fmt(v.y)} ${fmt(v.z)}]`;
  anchorLabel('crt', a.crt, new THREE.Vector3(-1.1, 1.6, 0), `<span class="k">CRT_04</span>${tower.crt.resolution} · ch04 · rec`, -40, -26);
  anchorLabel('col', a.column, new THREE.Vector3(0, 3, 0), `<span class="k">COL.A</span>h=3.00 r=0.34 ${xyz(a.column.position)}`, -46, -14);
  anchorLabel('ring', a.ring, new THREE.Vector3(1.5, 0, 1.5), `<span class="k">RING</span>p=${tower.ringState.p.toFixed(2)} θ=${(tower.ringState.p * 360).toFixed(0)}°`, 40, 8);
  anchorLabel('wire', a.wire, new THREE.Vector3(1.2, 2.4, -1.2), `<span class="k">WIRE</span>2.40u · edges 12 · ease elastic.out`, 34, -18);
  anchorLabel('base', a.base, new THREE.Vector3(2.5, 0.5, 2.5), `<span class="k">BASE</span>5.0×1.0×5.0 · hazard_45°`, 30, 26);
  anchorLabel('voxel', a.voxel, new THREE.Vector3(0, 0.5, 0), `<span class="k">VOX</span>9 cells · seed 7`, 44, 30);

  tmp.copy(hemi.left.position).add(new THREE.Vector3(-hemi.radius * 0.7, hemi.radius * 0.75, 0));
  hemi.root.localToWorld(tmp);
  hud.place('hemi', tmp, camera, w, h, `<span class="k">HEMI_L</span>r=2.20 · pink→lilac · halftone shadow`, true, -30, -44);

  const tState = thread.state;
  hud.place(
    'thread',
    thread.headPos,
    camera,
    w,
    h,
    `<span class="k">THREAD</span>t=${tState.head.toFixed(3)} ${xyz(thread.headPos)}`,
    tState.head - tState.tail > 0.01 && tState.head < 0.999,
    26,
    -20,
  );

  hud.dimension(hemi.dimensionAnchor, camera, w, h, hemi.distanceMeters());

  const time = tl.time();
  let current = SCENES[0][0];
  for (const [name, start] of SCENES) if (time >= start) current = name;
  hud.activeScene(current, time / tl.duration());
  hud.typeCode(dt);
  hud.stats({ fps, frame, time, loop: loops, w: w * dpr | 0, h: h * dpr | 0, dpr, info: renderer.info });

  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
