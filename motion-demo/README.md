# ISO//TOWER — motion graphics web demo

Creative-coding motion study: Three.js + GSAP + GLSL + HTML/CSS, built with Vite.

- **Procedural isometric tower** — `OrthographicCamera` looking down the (1,1,1) diagonal; hazard-striped pedestal, banded columns, voxel cluster, wireframe cube, progress ring and a CRT billboard rise in on a beat with `elastic.out` / `back.out` (`src/tower.js`, `src/crt.js`).
- **Splitting hemisphere + dimension HUD** — pastel pink→lilac shader with halftone shadow; the halves slide apart while a dashed dimension line and a live `d: 12.4m` readout follow the gap (`src/hemisphere.js`).
- **Red thread** — `CatmullRomCurve3` drawn as a growing `TubeGeometry` (draw range 0→1) with a particle spray at the tip (`src/thread.js`).
- **Post-processing** — halftone pass in a region that tracks the hemisphere, and a rainbow spectral scanline with a bloom halo and chromatic split (`src/post.js`).
- **Debug HUD** — tiny monospace labels with leader lines, fps / frame / draw calls, scene timeline, typed GLSL snippet (`src/hud.js`).

Everything runs on one GSAP master timeline (BUILD → SPLIT → THREAD → PRINT → HOLD → COLLAPSE) that loops (`src/main.js`).

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # writes ../motion (served by GitHub Pages at /motion/)
```

Keys: `space` pause · `h` hide HUD · `r` restart. URL `?t=7.5&pause` freezes a moment for screenshots. Any window shape works, including 9:16 portrait for screen recording.
