import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { addEdges } from './util.js';

const R = 2.2;
const METERS_PER_UNIT = 2;

const vertexShader = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vLocal;
  void main() {
    vLocal = position;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Pastel pink→lilac gradient; the shadow side is drawn as screen-space halftone dots.
const fragmentShader = /* glsl */ `
  uniform vec3 uPink;
  uniform vec3 uLilac;
  uniform vec3 uInk;
  uniform vec3 uLight;
  uniform float uRadius;
  uniform float uDpr;
  varying vec3 vNormalW;
  varying vec3 vLocal;

  void main() {
    vec3 n = normalize(vNormalW);
    float h = clamp(vLocal.y / uRadius, 0.0, 1.0);
    vec3 base = mix(uPink, uLilac, smoothstep(0.0, 1.0, h * 0.8 + n.x * 0.25 + 0.1));
    float ndl = dot(n, normalize(uLight));
    vec3 col = base * (0.78 + 0.28 * max(ndl, 0.0));

    float cell = 6.0 * uDpr;
    float a = 0.785398;
    mat2 rot = mat2(cos(a), sin(a), -sin(a), cos(a));
    vec2 p = rot * gl_FragCoord.xy;
    vec2 local = mod(p, cell) - cell * 0.5;
    float shade = smoothstep(0.55, -0.35, ndl);
    float radius = sqrt(shade) * cell * 0.55;
    float dotMask = 1.0 - smoothstep(radius - 0.8, radius + 0.8, length(local));
    col = mix(col, uInk, dotMask * 0.85);

    float rim = pow(1.0 - abs(n.y), 6.0) * 0.08;
    gl_FragColor = vec4(col + rim, 1.0);
  }
`;

export function createHemisphere(dpr) {
  const root = new THREE.Group();

  const uniforms = {
    uPink: { value: new THREE.Color(PALETTE.pink) },
    uLilac: { value: new THREE.Color(PALETTE.lilac) },
    uInk: { value: new THREE.Color('#6a3cff') },
    uLight: { value: new THREE.Vector3(0.6, 1.0, 0.35) },
    uRadius: { value: R },
    uDpr: { value: dpr },
  };
  const shellMat = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader });
  const capMat = new THREE.MeshLambertMaterial({ color: '#f6d8f0', side: THREE.DoubleSide });
  const capRingMat = new THREE.LineBasicMaterial({ color: PALETTE.magenta });

  function half(sign) {
    const g = new THREE.Group();
    const phiStart = sign > 0 ? Math.PI / 2 : -Math.PI / 2;
    const shell = new THREE.Mesh(new THREE.SphereGeometry(R, 64, 32, phiStart, Math.PI, 0, Math.PI / 2), shellMat);
    shell.castShadow = true;
    const cap = new THREE.Mesh(new THREE.CircleGeometry(R, 48, 0, Math.PI).rotateY(sign > 0 ? -Math.PI / 2 : Math.PI / 2), capMat);
    addEdges(cap, 1);
    // concentric guide arcs on the cut face
    for (let i = 1; i <= 3; i++) {
      const r = (R * i) / 4;
      const pts = [];
      for (let k = 0; k <= 32; k++) {
        const a = (k / 32) * Math.PI;
        pts.push(new THREE.Vector3(sign * 0.005 * -1, Math.sin(a) * r, Math.cos(a) * r));
      }
      cap.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), capRingMat));
    }
    g.add(shell, cap);
    return g;
  }
  const left = half(-1);
  const right = half(1);
  root.add(left, right);

  // Platform with a hazard lip and a center rail.
  const plat = new THREE.Mesh(new THREE.BoxGeometry(11, 0.24, 5.2).translate(0, -0.12, 0), new THREE.MeshLambertMaterial({ color: PALETTE.plate }));
  plat.receiveShadow = true;
  addEdges(plat);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(10.4, 0.04, 0.08), new THREE.MeshBasicMaterial({ color: PALETTE.ink }));
  rail.position.set(0, 0.02, 2.2);
  const lip = new THREE.Mesh(new THREE.BoxGeometry(11, 0.06, 0.2), new THREE.MeshBasicMaterial({ color: PALETTE.yellow }));
  lip.position.set(0, 0.01, 2.5);
  root.add(plat, rail, lip);

  // Dimension line: dashed, with extension lines and 45° architectural ticks.
  const dimY = R + 0.75;
  const dimMat = new THREE.LineDashedMaterial({ color: PALETTE.ink, dashSize: 0.18, gapSize: 0.1 });
  const dimLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), dimMat);
  const extMat = new THREE.LineBasicMaterial({ color: PALETTE.ink });
  const extGeo = new THREE.BufferGeometry();
  extGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(8 * 3), 3));
  const ext = new THREE.LineSegments(extGeo, extMat);
  root.add(dimLine, ext);

  const state = { gap: 0, open: 0, lift: 0 };
  const mid = new THREE.Vector3();

  function update() {
    const g = state.gap;
    left.position.x = -g / 2;
    right.position.x = g / 2;
    left.position.y = right.position.y = state.lift;

    const show = g > 0.05;
    dimLine.visible = ext.visible = show;
    if (show) {
      const y = dimY + state.lift;
      const pos = dimLine.geometry.attributes.position;
      pos.setXYZ(0, -g / 2, y, 0);
      pos.setXYZ(1, g / 2, y, 0);
      pos.needsUpdate = true;
      dimLine.computeLineDistances();

      const e = extGeo.attributes.position;
      const top = R + state.lift + 0.15;
      const s = 0.14;
      e.setXYZ(0, -g / 2, top, 0); e.setXYZ(1, -g / 2, y + 0.25, 0);
      e.setXYZ(2, g / 2, top, 0); e.setXYZ(3, g / 2, y + 0.25, 0);
      e.setXYZ(4, -g / 2 - s, y - s, 0); e.setXYZ(5, -g / 2 + s, y + s, 0);
      e.setXYZ(6, g / 2 - s, y - s, 0); e.setXYZ(7, g / 2 + s, y + s, 0);
      e.needsUpdate = true;
    }
    mid.set(0, dimY + state.lift, 0);
    root.localToWorld(mid);
  }

  function split(tl, at) {
    tl.to(state, { lift: 0.25, duration: 0.5, ease: 'power2.out' }, at);
    tl.to(state, { gap: 6.2, duration: 2.4, ease: 'elastic.out(1, 0.6)' }, at + 0.35);
    tl.to(state, { lift: 0, duration: 0.8, ease: 'bounce.out' }, at + 1.2);
  }

  function close(tl, at) {
    tl.to(state, { gap: 0, duration: 1.0, ease: 'power3.inOut' }, at);
  }

  return {
    root,
    left,
    right,
    state,
    radius: R,
    uniforms,
    dimensionAnchor: mid,
    distanceMeters: () => state.gap * METERS_PER_UNIT,
    split,
    close,
    update,
  };
}
