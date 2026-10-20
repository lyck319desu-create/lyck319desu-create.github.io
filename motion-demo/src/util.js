import * as THREE from 'three';
import { PALETTE } from './palette.js';

const edgeMat = new THREE.LineBasicMaterial({ color: PALETTE.ink, transparent: true, opacity: 0.55 });

// Ink outline that gives every solid the drafted, industrial look.
export function addEdges(mesh, threshold = 20, material = edgeMat) {
  const lines = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, threshold), material);
  lines.raycast = () => {};
  mesh.add(lines);
  return lines;
}

// A mesh whose geometry is shifted so its origin sits on its bottom face,
// so scaling the parent group grows it upward from the floor.
export function baseMesh(geometry, material, height) {
  geometry.translate(0, height / 2, 0);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function screenPosition(vec3, camera, width, height, out = new THREE.Vector2()) {
  const v = vec3.clone().project(camera);
  out.set((v.x * 0.5 + 0.5) * width, (-v.y * 0.5 + 0.5) * height);
  return out;
}

export function fmt(n, digits = 2) {
  const s = n.toFixed(digits);
  return n >= 0 ? ` ${s}` : s;
}
