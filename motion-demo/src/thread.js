import * as THREE from 'three';
import { PALETTE } from './palette.js';

const SEGMENTS = 480;
const RADIAL = 8;
const PARTICLES = 1400;

const pointVert = /* glsl */ `
  attribute float aU;
  attribute vec3 aOffset;
  attribute float aSeed;
  uniform float uHead;
  uniform float uTail;
  uniform float uTime;
  uniform float uDpr;
  varying float vAlpha;
  void main() {
    float visible = step(uTail, aU) * step(aU, uHead);
    float nearHead = exp(-max(uHead - aU, 0.0) * 28.0);
    vec3 drift = vec3(sin(uTime * 1.7 + aSeed * 40.0), cos(uTime * 1.3 + aSeed * 31.0), sin(uTime * 1.1 + aSeed * 17.0)) * 0.05;
    vec3 p = position + aOffset * (0.08 + 0.9 * nearHead) + drift;
    vAlpha = visible * (0.35 + 0.65 * nearHead);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = visible * uDpr * (1.5 + 3.0 * nearHead * fract(aSeed * 7.13 + 0.3));
  }
`;

const pointFrag = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    if (dot(c, c) > 0.25) discard;
    gl_FragColor = vec4(uColor, vAlpha);
  }
`;

// The red thread: a tube that draws itself along a CatmullRom path, with a spray of particles at its tip.
export function createThread(points, dpr) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.5);
  const root = new THREE.Group();

  const tubeGeo = new THREE.TubeGeometry(curve, SEGMENTS, 0.055, RADIAL, false);
  const tube = new THREE.Mesh(tubeGeo, new THREE.MeshBasicMaterial({ color: PALETTE.red }));
  tube.frustumCulled = false;
  root.add(tube);

  const pos = new Float32Array(PARTICLES * 3);
  const u = new Float32Array(PARTICLES);
  const offset = new Float32Array(PARTICLES * 3);
  const seed = new Float32Array(PARTICLES);
  const tmp = new THREE.Vector3();
  for (let i = 0; i < PARTICLES; i++) {
    const t = Math.random();
    curve.getPointAt(t, tmp);
    pos.set([tmp.x, tmp.y, tmp.z], i * 3);
    u[i] = t;
    const dir = new THREE.Vector3().randomDirection().multiplyScalar(Math.pow(Math.random(), 1.5));
    offset.set([dir.x, dir.y, dir.z], i * 3);
    seed[i] = Math.random();
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  pGeo.setAttribute('aU', new THREE.BufferAttribute(u, 1));
  pGeo.setAttribute('aOffset', new THREE.BufferAttribute(offset, 3));
  pGeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const uniforms = {
    uHead: { value: 0 },
    uTail: { value: 0 },
    uTime: { value: 0 },
    uDpr: { value: dpr },
    uColor: { value: new THREE.Color(PALETTE.red) },
  };
  const particles = new THREE.Points(pGeo, new THREE.ShaderMaterial({ uniforms, vertexShader: pointVert, fragmentShader: pointFrag, transparent: true, depthWrite: false }));
  particles.frustumCulled = false;
  root.add(particles);

  const headDot = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), new THREE.MeshBasicMaterial({ color: PALETTE.red }));
  root.add(headDot);

  const state = { head: 0, tail: 0 };
  const headPos = new THREE.Vector3();

  function update(time) {
    const { head, tail } = state;
    const perSeg = RADIAL * 6;
    const start = Math.floor(tail * SEGMENTS) * perSeg;
    const end = Math.ceil(head * SEGMENTS) * perSeg;
    tubeGeo.setDrawRange(start, Math.max(0, end - start));
    uniforms.uHead.value = head;
    uniforms.uTail.value = tail;
    uniforms.uTime.value = time;
    curve.getPointAt(THREE.MathUtils.clamp(head, 0, 1), headPos);
    headDot.position.copy(headPos);
    headDot.visible = head > 0.002 && head - tail > 0.002;
    root.visible = head - tail > 0.0005;
  }

  function draw(tl, at) {
    tl.fromTo(state, { head: 0, tail: 0 }, { head: 1, duration: 4.2, ease: 'power2.inOut' }, at);
  }

  function retract(tl, at) {
    tl.to(state, { tail: 1, duration: 1.6, ease: 'power2.in' }, at);
  }

  return { root, curve, state, headPos, update, draw, retract };
}
