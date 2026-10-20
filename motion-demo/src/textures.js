import * as THREE from 'three';
import { PALETTE } from './palette.js';

function canvasTexture(w, h, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Yellow/black 45° warning stripes for the pedestal.
export function hazardTexture(repeatX = 1, repeatY = 1) {
  const tex = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = PALETTE.yellow;
    g.fillRect(0, 0, w, h);
    g.fillStyle = PALETTE.ink;
    const step = 64;
    for (let x = -h; x < w + h; x += step) {
      g.beginPath();
      g.moveTo(x, h);
      g.lineTo(x + step / 2, h);
      g.lineTo(x + step / 2 + h, 0);
      g.lineTo(x + h, 0);
      g.closePath();
      g.fill();
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  return tex;
}

// Horizontal bands that wrap a cylinder (v runs along its height).
export function bandTexture(colorA, colorB, bands = 8) {
  const tex = canvasTexture(16, 256, (g, w, h) => {
    const bh = h / bands;
    for (let i = 0; i < bands; i++) {
      g.fillStyle = i % 2 ? colorB : colorA;
      g.fillRect(0, i * bh, w, bh);
    }
  });
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

// Thin ruler ticks for slab edges.
export function rulerTexture() {
  const tex = canvasTexture(512, 32, (g, w, h) => {
    g.fillStyle = PALETTE.plate;
    g.fillRect(0, 0, w, h);
    g.fillStyle = PALETTE.ink;
    for (let i = 0; i <= 64; i++) {
      const x = (i / 64) * w;
      const len = i % 8 === 0 ? h * 0.7 : i % 4 === 0 ? h * 0.45 : h * 0.25;
      g.fillRect(x, 0, 1.5, len);
    }
  });
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}
