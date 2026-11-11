import * as THREE from 'three';
import gsap from 'gsap';
import { PALETTE } from './palette.js';
import { hazardTexture, bandTexture, rulerTexture } from './textures.js';
import { addEdges, baseMesh } from './util.js';
import { createCRT } from './crt.js';

const lambert = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });

export function createTower() {
  const root = new THREE.Group();
  const pieces = []; // { group, y, kind }
  const anchors = {};

  function piece(kind, y, ...objects) {
    const group = new THREE.Group();
    group.position.y = y;
    objects.forEach((o) => group.add(o));
    group.userData.y = y;
    root.add(group);
    pieces.push({ group, y, kind });
    return group;
  }

  // ── Pedestal: hazard-striped sides, pale top with a ruler rim.
  {
    const sides = lambert(0xffffff, { map: hazardTexture(3, 0.6) });
    const top = lambert(PALETTE.plate);
    const bottom = lambert(PALETTE.steel);
    const mesh = baseMesh(new THREE.BoxGeometry(5, 1, 5), [sides, sides, top, bottom, sides, sides], 1);
    addEdges(mesh);
    const inset = baseMesh(new THREE.BoxGeometry(4.2, 0.06, 4.2), lambert(PALETTE.steel), 0.06);
    inset.position.y = 1;
    addEdges(inset);
    anchors.base = piece('base', 0, mesh, inset);
  }

  // ── Level 1: four banded columns around a voxel cluster.
  const columnSpecs = [
    [-1.6, -1.6, PALETTE.red],
    [1.6, -1.6, PALETTE.blue],
    [1.6, 1.6, PALETTE.red],
    [-1.6, 1.6, PALETTE.blue],
  ];
  columnSpecs.forEach(([x, z, color], i) => {
    const mat = lambert(0xffffff, { map: bandTexture(color, '#ffffff', 10) });
    const mesh = baseMesh(new THREE.CylinderGeometry(0.34, 0.34, 3, 24), mat, 3);
    addEdges(mesh, 40);
    const g = piece('column', 1.06, mesh);
    g.position.set(x, 1.06, z);
    if (i === 0) anchors.column = g;
  });

  const voxelColors = [PALETTE.magenta, PALETTE.yellow, '#ffffff', PALETTE.blue, '#ffffff', PALETTE.red];
  const rng = mulberry32(7);
  for (let ix = -1; ix <= 1; ix++) {
    for (let iz = -1; iz <= 1; iz++) {
      const h = 0.45 * (1 + Math.floor(rng() * 4));
      const color = voxelColors[Math.floor(rng() * voxelColors.length)];
      const mesh = baseMesh(new THREE.BoxGeometry(0.44, h, 0.44), lambert(color), h);
      addEdges(mesh);
      const g = piece('voxel', 1.06, mesh);
      g.position.set(ix * 0.5, 1.06, iz * 0.5);
      if (ix === 1 && iz === 1) anchors.voxel = g;
    }
  }

  // ── Slab with ruler rim.
  function slab(y, size) {
    const rim = lambert(0xffffff, { map: rulerTexture() });
    const top = lambert(PALETTE.plate);
    const mesh = baseMesh(new THREE.BoxGeometry(size, 0.22, size), [rim, rim, top, top, rim, rim], 0.22);
    addEdges(mesh);
    return piece('slab', y, mesh);
  }
  anchors.slab1 = slab(4.06, 4.4);

  // ── Level 2: wireframe cube, a solid yellow core, and a progress ring.
  const wire = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(2.4, 2.4, 2.4).translate(0, 1.2, 0)),
    new THREE.LineBasicMaterial({ color: PALETTE.blue }),
  );
  const wireCorners = new THREE.Points(
    new THREE.BoxGeometry(2.4, 2.4, 2.4, 1, 1, 1).translate(0, 1.2, 0),
    new THREE.PointsMaterial({ color: PALETTE.blue, size: 4, sizeAttenuation: false }),
  );
  anchors.wire = piece('wire', 4.28, wire, wireCorners);

  const core = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), lambert(PALETTE.yellow));
  core.castShadow = true;
  addEdges(core);
  core.position.y = 1.2;
  const coreGroup = piece('core', 4.28, core);

  const ringTrack = new THREE.Mesh(
    new THREE.RingGeometry(2.05, 2.12, 96).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: PALETTE.steel, side: THREE.DoubleSide }),
  );
  const ringMat = new THREE.MeshBasicMaterial({ color: PALETTE.magenta, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.BufferGeometry(), ringMat);
  const ringState = { p: 0 };
  function setRing(p) {
    ringState.p = p;
    ring.geometry.dispose();
    ring.geometry = new THREE.RingGeometry(1.9, 2.2, 96, 1, Math.PI / 2, -Math.max(p, 0.0001) * Math.PI * 2).rotateX(-Math.PI / 2);
  }
  setRing(0);
  const ticks = new THREE.Group();
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.01, i % 6 === 0 ? 0.32 : 0.16), new THREE.MeshBasicMaterial({ color: PALETTE.ink }));
    t.position.set(Math.cos(a) * 2.4, 0, Math.sin(a) * 2.4);
    t.rotation.y = -a + Math.PI / 2;
    ticks.add(t);
  }
  anchors.ring = piece('ring', 5.5, ringTrack, ring, ticks);

  anchors.slab2 = slab(6.9, 3.4);

  // ── CRT billboard on the roof.
  const crt = createCRT();
  {
    const bodyMat = lambert('#e6e6e2');
    const body = baseMesh(new THREE.BoxGeometry(2.3, 1.7, 1.3), bodyMat, 1.7);
    addEdges(body);
    const bezel = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.4), lambert(PALETTE.ink));
    bezel.position.set(0, 0.88, 0.651);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.25), crt.material);
    screen.position.set(0, 0.88, 0.655);
    const stand = baseMesh(new THREE.BoxGeometry(0.5, 0.3, 0.5), lambert(PALETTE.steel), 0.3);
    stand.position.y = -0.3;
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 16).rotateX(Math.PI / 2), lambert(PALETTE.red));
    knob.position.set(0.95, 0.25, 0.66);
    const unit = new THREE.Group();
    unit.add(body, bezel, screen, knob);
    unit.rotation.y = Math.PI / 4; // face the isometric camera
    anchors.crt = piece('crt', 7.42, stand, unit);

    const antMat = new THREE.LineBasicMaterial({ color: PALETTE.ink });
    const ant = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0), new THREE.Vector3(-0.6, 1.0, 0.2),
        new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.5, 1.15, -0.3),
      ]),
      antMat,
    );
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), lambert(PALETTE.red));
    tip.position.set(0.5, 1.15, -0.3);
    anchors.antenna = piece('antenna', 9.12, ant, tip);
  }

  // Start fully collapsed.
  pieces.forEach(({ group }) => hide(group));

  function hide(group) {
    group.scale.setScalar(0.001);
    group.position.y = group.userData.y - 2.5;
    group.visible = false;
  }

  const easeFor = {
    base: 'back.out(1.4)',
    column: 'elastic.out(1, 0.45)',
    voxel: 'back.out(2.2)',
    slab: 'back.out(1.6)',
    wire: 'elastic.out(1.1, 0.4)',
    core: 'elastic.out(1, 0.35)',
    ring: 'back.out(1.7)',
    crt: 'back.out(2)',
    antenna: 'elastic.out(1, 0.5)',
  };

  // Rhythmic build: each kind enters on its own beat.
  function buildIn(tl, at) {
    const beat = 0.32;
    const order = ['base', 'column', 'voxel', 'slab', 'wire', 'core', 'ring', 'crt', 'antenna'];
    const slabs = pieces.filter((p) => p.kind === 'slab');
    let t = at;
    for (const kind of order) {
      let group = pieces.filter((p) => p.kind === kind);
      if (kind === 'slab') group = [slabs[0]];
      if (kind === 'crt') {
        // the second slab lands right before the monitor
        rise(tl, [slabs[1]], t, 'back.out(1.6)');
        t += beat;
      }
      rise(tl, group, t, easeFor[kind]);
      t += kind === 'voxel' ? beat * 1.6 : beat;
      if (kind === 'ring') {
        tl.to(ringState, { p: 1, duration: 2.6, ease: 'power2.inOut', onUpdate: () => setRing(ringState.p) }, t);
      }
    }
    return t;
  }

  function rise(tl, list, at, ease) {
    const groups = list.map((p) => p.group);
    tl.set(groups, { visible: true }, at);
    tl.to(groups.map((g) => g.scale), { x: 1, y: 1, z: 1, duration: 1.1, ease, stagger: 0.07 }, at);
    groups.forEach((g, i) => {
      tl.to(g.position, { y: g.userData.y, duration: 0.8, ease: 'back.out(1.8)' }, at + i * 0.07);
    });
  }

  function collapse(tl, at) {
    const reversed = [...pieces].reverse();
    reversed.forEach(({ group }, i) => {
      const t = at + i * 0.045;
      tl.to(group.scale, { x: 0.001, y: 0.001, z: 0.001, duration: 0.45, ease: 'power3.in' }, t);
      tl.to(group.position, { y: group.userData.y - 2.5, duration: 0.45, ease: 'power3.in' }, t);
      tl.set(group, { visible: false }, t + 0.46);
    });
    tl.to(ringState, { p: 0, duration: 0.5, ease: 'power2.in', onUpdate: () => setRing(ringState.p) }, at);
    return at + reversed.length * 0.045 + 0.5;
  }

  function update(t) {
    core.rotation.y = t * 1.2;
    core.rotation.x = t * 0.7;
    ticks.rotation.y = -t * 0.2;
    crt.update(t);
  }

  return { root, anchors, ringState, crt, buildIn, collapse, update };
}

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
