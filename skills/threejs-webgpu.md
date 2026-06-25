---
name: Three.js WebGPU/WebGL
description: Use when writing or reviewing Three.js code targeting the modern WebGPU renderer (with automatic WebGL2 fallback) and TSL node materials — r160+ and especially current releases (r185 / three@0.185+). Steers away from the legacy patterns models default to (importing from 'three', ShaderMaterial/onBeforeCompile, JS operators on nodes).
---

You are writing modern **Three.js** targeting `WebGPURenderer` — which runs on
WebGPU and **falls back to WebGL2 automatically**, so one codebase covers both.
This is the post-r160 world built on **node materials** and **TSL** (Three.js
Shading Language), not the legacy `WebGLRenderer` + GLSL `ShaderMaterial` stack.
Models reflexively emit the old API; don't. The single most important habit:
**verify against the installed version's docs/examples**, because this surface
changes most releases.

> Pin reality first: check the project's `three` version (`npm ls three`).
> Current line is **r185 / `three@0.185`**. Entry points and TSL function names
> do shift between revisions — when in doubt, consult
> `threejs.org/examples` (the `webgpu_*` examples) and `threejs.org/docs`, not
> memory.

## Import from the right entry points
The WebGPU stack is **not** in the default `'three'` export. Getting this wrong
is the #1 error.
```js
import * as THREE from 'three/webgpu';   // WebGPURenderer + all *NodeMaterial
import { Fn, uv, vec3, vec4, float, texture, positionLocal, normalWorld,
         uniform, mix, sin, time } from 'three/tsl';   // TSL building blocks
// Addons (controls, loaders) still come from the examples path:
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
```
- `'three/webgpu'` re-exports core THREE **plus** `WebGPURenderer` and the node
  materials (`MeshStandardNodeMaterial`, `MeshBasicNodeMaterial`, …). Import
  core from here too so you don't mix two copies.
- `'three/tsl'` holds the TSL functions (`Fn`, `uv`, `texture`, `uniform`, math
  ops, etc.). Never hand-write GLSL/WGSL strings unless you genuinely need
  `wgslFn`/`glslFn` for an escape hatch.

## Renderer setup and the async gotcha
`WebGPURenderer` initializes **asynchronously** (device request). The clean path
is `setAnimationLoop`, which waits for init internally:
```js
const renderer = new THREE.WebGPURenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(devicePixelRatio);
document.body.appendChild(renderer.domElement);
renderer.setAnimationLoop(() => renderer.render(scene, camera));
```
- If you render **outside** an animation loop, you must init first:
  `await renderer.init();` then `renderer.render(...)`, or use
  `await renderer.renderAsync(scene, camera)`. A bare `renderer.render()` before
  the device is ready renders nothing — a classic "black canvas" bug.
- **Fallback is built in.** WebGPURenderer uses a WebGL2 backend automatically
  when WebGPU is unavailable, so you usually don't need a separate
  `WebGLRenderer` path. Force WebGL for testing with
  `new THREE.WebGPURenderer({ forceWebGL: true })`. Only add an explicit
  `WebGPU.isAvailable()` check if you want to *refuse* the WebGL2 fallback.

## Materials are node materials now
For anything custom, use `*NodeMaterial` and drive its **node slots** — do
**not** reach for `ShaderMaterial` or `onBeforeCompile` (the WebGPU path doesn't
use them):
```js
const material = new THREE.MeshStandardNodeMaterial();
material.colorNode    = texture(map).mul(color(0xff8800));  // fragment color
material.positionNode = positionLocal.add(vec3(0, sin(time), 0)); // vertex
material.emissiveNode = uv().y.mul(2);
```
- Common slots: `colorNode`, `positionNode`, `normalNode`, `emissiveNode`,
  `roughnessNode`, `metalnessNode`, `opacityNode`, `outputNode`. Standard PBR
  inputs (lighting, env maps) keep working; you're augmenting, not replacing.
- Reusable shader logic goes in `Fn`:
```js
const desaturate = Fn(([ col ]) => {
  const g = vec3(0.299, 0.587, 0.114).dot(col.rgb);
  return vec3(g);
});
material.colorNode = desaturate(texture(map));
```

## TSL is a graph builder, not arithmetic
TSL functions return **nodes** that compile to WGSL/GLSL. JavaScript can't
overload operators, so:
- **Use node methods / functional forms, never `+ - * /` on nodes.**
  `a.add(b)`, `a.mul(2)`, `a.sub(c)`, `a.div(d)` — or `add(a, b)`, `mul(a, b)`.
  Writing `a + b` on two nodes silently produces `"[object Object]..."` garbage.
- **Swizzle and components** are properties: `pos.xy`, `col.rgb`, `v.x`.
- **Uniforms are reactive**: `const speed = uniform(1.0);` then read it in the
  graph; update on the JS side via `speed.value = 2.0` (don't rebuild the node).
- **Builtins** like `time`, `uv()`, `positionLocal`, `normalWorld`, `screenUV`,
  `cameraPosition` come from `'three/tsl'` — import them, don't redeclare.
- Branch/loop with TSL control flow (`If`, `Loop`, `select`), not JS `if`/`for`,
  when the condition depends on shader values.

## Beyond materials (same TSL world)
- **Postprocessing**: `import { PostProcessing } from 'three/webgpu'` + `pass()`
  from TSL — compose effects as nodes, not the old `EffectComposer` GLSL passes.
- **Compute**: TSL `Fn(...).compute(count)` runs on the GPU via
  `renderer.computeAsync(node)` — for particles/simulation, prefer this over CPU
  loops.
- **Storage/instancing**: `instancedArray`/`storage` buffers feed compute and
  instanced draws; reach for them before per-instance CPU updates.

## Hygiene
- Dispose what you create — `geometry.dispose()`, `material.dispose()`,
  `texture.dispose()`, and `renderer.dispose()` on teardown; remove the resize
  listener and stop the animation loop (`setAnimationLoop(null)`).
- Handle resize: update `camera.aspect`, `camera.updateProjectionMatrix()`, and
  `renderer.setSize(...)`.
- Respect `prefers-reduced-motion`; gate heavy compute behind capability checks.

## How to respond
- Produce complete, runnable snippets with the **correct imports**
  (`three/webgpu`, `three/tsl`, `three/addons/...`) — not fragments that assume
  the legacy `'three'` import.
- Default to `WebGPURenderer` + node materials + TSL. Only use `WebGLRenderer`
  or `ShaderMaterial` if the user explicitly needs the legacy stack, and say so.
- When an API might have shifted between revisions, say which version you're
  targeting and point to the matching `webgpu_*` official example rather than
  guessing.
- Flag the easy-to-miss traps in context: the async init, node-method math over
  JS operators, and importing from `three/webgpu` not `three`.
