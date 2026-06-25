---
name: Three.js WebGPU/WebGL
description: Use when writing or reviewing modern Three.js targeting the WebGPU renderer (with automatic WebGL2 fallback) and TSL node materials — r160+ and especially current releases (r185 / three@0.185+). Covers renderer setup, node materials, the full TSL workflow, textures, lighting, instancing, compute shaders, postprocessing, loaders, performance, and debugging. Steers away from the legacy patterns models default to (importing from 'three', ShaderMaterial/onBeforeCompile, JS operators on nodes).
---

You are writing modern **Three.js** targeting `WebGPURenderer` — which runs on
WebGPU and **falls back to WebGL2 automatically**, so one codebase covers both.
This is the post-r160 world built on **node materials** and **TSL** (Three.js
Shading Language), not the legacy `WebGLRenderer` + GLSL `ShaderMaterial` stack.
Models reflexively emit the old API; don't. The single most important habit:
**verify against the installed version's docs/examples**, because this surface
changes most releases.

> Pin reality first: check the project's `three` version (`npm ls three`).
> Current line is **r185 / `three@0.185`**. Entry points, TSL function names, and
> postprocessing class names do shift between revisions — when in doubt, consult
> `threejs.org/examples` (the `webgpu_*` examples) and `threejs.org/docs`, not
> memory. A `webgpu_*` example that matches the task is the most reliable
> reference there is.

## Import from the right entry points
The WebGPU stack is **not** in the default `'three'` export. Getting this wrong
is the #1 error.
```js
import * as THREE from 'three/webgpu';   // WebGPURenderer + all *NodeMaterial
import { Fn, uv, vec2, vec3, vec4, float, texture, positionLocal, normalWorld,
         uniform, mix, sin, time, attribute, varying } from 'three/tsl';
// Addons (controls, loaders, some TSL effects) come from the examples path:
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader }    from 'three/addons/loaders/GLTFLoader.js';
```
- `'three/webgpu'` re-exports core THREE **plus** `WebGPURenderer`, the node
  materials (`MeshStandardNodeMaterial`, `MeshBasicNodeMaterial`,
  `MeshPhysicalNodeMaterial`, `SpriteNodeMaterial`, `PointsNodeMaterial`,
  `LineBasicNodeMaterial`, `NodeMaterial`, …) and `PostProcessing`. Import core
  from here too so you don't end up with two copies of THREE.
- `'three/tsl'` holds the TSL functions. Never hand-write GLSL/WGSL strings
  unless you need the `wgslFn`/`glslFn` escape hatch (see below).
- Set an **import map** (or bundler alias) so `three`, `three/webgpu`,
  `three/tsl`, and `three/addons/` all resolve to the same installed version.

## Renderer setup and the async gotcha
`WebGPURenderer` initializes **asynchronously** (it requests a GPU device). The
clean path is `setAnimationLoop`, which waits for init internally:
```js
const renderer = new THREE.WebGPURenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); // cap DPR for perf
renderer.setClearColor(0x000000, 1);
document.body.appendChild(renderer.domElement);
renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
```
- Rendering **outside** an animation loop requires explicit init first:
  `await renderer.init();` then `renderer.render(...)`, or
  `await renderer.renderAsync(scene, camera)`. A bare `renderer.render()` before
  the device is ready draws nothing — the classic "black canvas" bug.
- **Fallback is built in.** WebGPURenderer transparently uses a WebGL2 backend
  when WebGPU is unavailable, so you usually do **not** need a separate
  `WebGLRenderer` path. Force WebGL to test that path:
  `new THREE.WebGPURenderer({ forceWebGL: true })`. Add an explicit
  `WebGPU.isAvailable()` check (from `three/addons/capabilities/WebGPU.js`) only
  if you want to *refuse* the WebGL2 fallback.
- Other constructor options worth knowing: `antialias`, `alpha`,
  `powerPreference: 'high-performance'`, `stencil`, `samples` (MSAA count).

## Color management & tone mapping (don't skip)
- Color management is on by default. Mark color textures
  `texture.colorSpace = THREE.SRGBColorSpace`; data/normal/roughness maps stay
  `THREE.NoColorSpace` (linear). Getting this wrong is the usual "washed
  out / too dark" complaint.
- Set `renderer.toneMapping` (e.g. `THREE.ACESFilmicToneMapping`) and
  `renderer.toneMappingExposure`. For PBR, give the scene an environment map
  (`scene.environment = envTexture`) — IBL is what makes metals read correctly.

## Materials are node materials now
For anything custom, use a `*NodeMaterial` and drive its **node slots** — do
**not** reach for `ShaderMaterial` or `onBeforeCompile` (the WebGPU path doesn't
run them):
```js
const material = new THREE.MeshStandardNodeMaterial();
material.colorNode     = texture(map).mul(color(0xff8800));      // base color
material.positionNode  = positionLocal.add(vec3(0, sin(time), 0)); // vertex displace
material.normalNode    = /* tangent-space or world normal node */;
material.emissiveNode  = uv().y.mul(2);
material.roughnessNode = texture(roughMap).r;
material.metalnessNode = float(0.0);
material.opacityNode   = float(0.8); material.transparent = true;
```
- **Slot map**: `colorNode` (final albedo/output base), `positionNode` (vertex
  position, local space), `normalNode`, `emissiveNode`, `roughnessNode`,
  `metalnessNode`, `opacityNode`, `aoNode`, `envNode`, and `outputNode`
  (post-lighting final color). Standard PBR lighting, shadows, fog and env maps
  keep working — you're augmenting specific stages, not replacing the pipeline.
- Reusable shader logic goes in `Fn`:
```js
const desaturate = Fn(([ col ]) => {
  const g = dot(col.rgb, vec3(0.299, 0.587, 0.114));
  return vec3(g);
});
material.colorNode = desaturate(texture(map));
```

## TSL is a graph builder, not arithmetic
TSL functions return **nodes** that compile to WGSL (or GLSL on the fallback).
JavaScript can't overload operators, so:
- **Use node methods / functional forms, never `+ - * /` on nodes.**
  `a.add(b)`, `a.mul(2)`, `a.sub(c)`, `a.div(d)` — or `add(a, b)`, `mul(a, b)`.
  `a + b` on two nodes silently coerces to a `"[object Object]"` string and
  produces garbage shaders.
- **Swizzle/components are properties**: `pos.xy`, `col.rgb`, `v.x`, `v.xxx`.
- **Assignment inside compute / Fn**: `node.assign(x)`, `node.addAssign(x)`,
  `node.mulAssign(x)` (not `=`/`+=`).
- **Uniforms are reactive**: `const speed = uniform(1.0);` use `speed` in the
  graph, update from JS via `speed.value = 2.0` — never rebuild the node graph
  per frame.
- **Attributes & varyings**: `attribute('myAttr', 'vec3')` reads geometry
  attributes; `varying(node)` passes a value vertex→fragment.
- **Builtins** (`time`, `uv()`, `positionLocal/World/View`,
  `normalLocal/World/View`, `screenUV`, `screenCoordinate`, `cameraPosition`,
  `modelWorldMatrix`, …) come from `'three/tsl'` — import them, don't redeclare.
- **Control flow on shader values** uses TSL, not JS: `If(cond, () => {...})
  .ElseIf(...).Else(...)`, `Loop(count, ({ i }) => {...})`, `select(cond, a, b)`,
  `Break()`/`Continue()`. JS `if`/`for` only controls graph *construction*.
- A condensed function reference lives in the `tsl-cheatsheet.md` resource.

## Textures
```js
const tex = await new THREE.TextureLoader().loadAsync('albedo.png');
tex.colorSpace = THREE.SRGBColorSpace;
tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
material.colorNode = texture(tex, uv().mul(4));        // tiled sample
```
- `texture(map, uvNode)` samples; `.sample(uvNode)`, `.grad(...)`, `.level(lod)`
  for explicit control. Combine maps in the graph rather than baking offline.
- `cubeTexture(...)` for cubemaps/IBL, `texture3D(...)` for volumes, and
  `VideoTexture` for video. `storageTexture(...)` is read/write for compute.

## Instancing, batching & storage
- Many copies of one mesh → `InstancedMesh`; per-instance data via
  `instancedArray`/storage buffers read with `instanceIndex` in the material or
  a compute pass. Many *different* geometries/materials sharing draw calls →
  `BatchedMesh`. Both cut draw calls dramatically.
- For particles/simulation, drive instances from a **compute pass** (below)
  rather than updating matrices on the CPU each frame.

## Compute shaders (GPU compute via TSL)
```js
import { Fn, instancedArray, instanceIndex, vec3 } from 'three/tsl';

const positions  = instancedArray(count, 'vec3');
const velocities = instancedArray(count, 'vec3');

const update = Fn(() => {
  const pos = positions.element(instanceIndex);
  const vel = velocities.element(instanceIndex);
  vel.addAssign(vec3(0, -0.001, 0));   // gravity
  pos.addAssign(vel);
})().compute(count);

// each frame, before render:
renderer.compute(update);              // or: await renderer.computeAsync(update)
// then read the same buffers as nodes in a PointsNodeMaterial:
pointsMaterial.positionNode = positions.element(instanceIndex);
```
- `instancedArray(count, type)` / `storage(buffer, type, count)` are GPU buffers
  shared between compute and draw — no CPU round-trip.
- One-shot init compute (seed positions) runs once; per-frame compute runs in the
  loop. Use `.setName(...)` to label passes for debugging.

## Postprocessing (node-based)
The modern pipeline composes effects as **nodes**, not stacked `EffectComposer`
GLSL passes. Class/function names here shift between revisions — confirm against
the matching `webgpu_postprocessing_*` example for your version.
```js
import { pass } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';

const post = new THREE.PostProcessing(renderer);
const scenePass = pass(scene, camera);
const color = scenePass.getTextureNode();            // scene color
post.outputNode = color.add(bloom(color, 0.8, 0.3)); // compose effects as a graph
// render via the pipeline instead of renderer.render:
renderer.setAnimationLoop(() => post.renderAsync());
```
- `pass(scene, camera)` exposes color and depth as nodes; many effects (bloom,
  ao, dof, fxaa/smaa, motion blur, outline) live under
  `three/addons/tsl/display/`. **MRT** (`mrt({...})`) lets a pass output multiple
  buffers (color, normal, …) for deferred-style effects.

## Loaders, controls, animation
- Loaders come from addons and have async forms:
  `const gltf = await new GLTFLoader().loadAsync(url);` then
  `scene.add(gltf.scene)`. Use `DRACOLoader`/`KTX2Loader` for compressed assets;
  `KTX2Loader` needs `.detectSupport(renderer)`.
- Skeletal/morph animation: `mixer = new THREE.AnimationMixer(model)`,
  `mixer.clipAction(gltf.animations[0]).play()`, and `mixer.update(delta)` in the
  loop (drive `delta` from `THREE.Clock`).
- `OrbitControls` etc. need `controls.update()` each frame when damping is on.

## Performance
- **Cap draw calls**: instancing/batching over many separate meshes; merge static
  geometry (`BufferGeometryUtils.mergeGeometries`).
- **Cap pixels**: clamp `setPixelRatio` (≤2), lower internal resolution under
  load, and avoid full-screen postprocessing you don't need.
- **Move per-instance work to the GPU** (compute/storage) instead of CPU loops
  updating matrices/attributes each frame.
- **Cull and LOD**: rely on frustum culling; use `THREE.LOD` for distance detail.
- **Don't churn the graph**: build node materials once; animate via `uniform`
  `.value` updates, not by reassigning node slots per frame.
- Dispose aggressively (next section) — GPU resources don't garbage-collect.

## Debugging
- Force the fallback to isolate WebGPU-vs-WebGL2 differences:
  `new THREE.WebGPURenderer({ forceWebGL: true })`.
- Inspect generated code: a node material exposes its built shader after a render
  (e.g. log from `material` / use the renderer's node debugging hooks for your
  version) and browser GPU devtools show pipelines and timings.
- A black screen is almost always: rendered before `init`, wrong import (`three`
  vs `three/webgpu`), or a TSL `+`/`*` on nodes producing a broken shader. Check
  those three first.
- `renderer.info` reports draw calls, triangles, and memory — watch it.

## Hygiene
- Dispose what you create — `geometry.dispose()`, `material.dispose()`,
  `texture.dispose()`, render targets, and `renderer.dispose()` on teardown.
  Remove resize listeners and stop the loop (`setAnimationLoop(null)`).
- Handle resize: update `camera.aspect`, `camera.updateProjectionMatrix()`, and
  `renderer.setSize(w, h)` (and any postprocessing pass sizes).
- Respect `prefers-reduced-motion`; gate heavy compute/postprocessing behind
  capability and performance checks.

## How to respond
- Produce complete, runnable snippets with the **correct imports**
  (`three/webgpu`, `three/tsl`, `three/addons/...`) and an import map when it's a
  standalone page — not fragments that assume the legacy `'three'` import.
- Default to `WebGPURenderer` + node materials + TSL. Use `WebGLRenderer` or
  `ShaderMaterial` only if the user explicitly needs the legacy stack, and say so.
- When an API might have shifted between revisions (postprocessing classes, TSL
  names), state the version you're targeting and point to the matching
  `webgpu_*` example rather than guessing.
- Proactively flag the easy-to-miss traps in context: async init, node-method
  math over JS operators, `three/webgpu` (not `three`) imports, and color-space
  on textures.

<!-- skill:resource name="tsl-cheatsheet.md" -->
# TSL quick reference

All names import from `three/tsl`. Functions return **nodes**; combine with
methods (`.add`, `.mul`, …) or functional forms (`add(a,b)`), never JS operators.

## Constructors & conversion
- `float(x)`, `int(x)`, `uint(x)`, `bool(b)`, `vec2/3/4(...)`, `mat3/4(...)`,
  `color(0xff8800)` — wrap JS numbers before mixing with nodes.
- Swizzle: `v.x`, `v.xy`, `v.rgb`, `v.xxz`. Set via `.assign()` on the swizzle.

## Math (method or functional form)
- Arithmetic: `add sub mul div mod` ; `negate abs sign floor ceil round fract`.
- Powers/exp: `pow pow2 pow3 sqrt inverseSqrt exp exp2 log log2`.
- Trig: `sin cos tan asin acos atan atan2 radians degrees`.
- Vector: `dot cross normalize length distance reflect refract faceforward`.
- Interp/clamp: `mix clamp saturate step smoothstep min max`.
- Components: `all any equal lessThan greaterThan` (vector comparisons).

## Inputs / builtins
- `time`, `deltaTime`, `frameId`.
- UV/screen: `uv()`, `screenUV`, `screenCoordinate`, `viewportUV`.
- Position: `positionLocal positionWorld positionView positionGeometry`.
- Normal: `normalLocal normalWorld normalView`, `tangentLocal`, `bitangent...`.
- Camera/model: `cameraPosition cameraViewMatrix cameraProjectionMatrix
  modelWorldMatrix modelNormalMatrix modelViewMatrix`.
- Geometry: `attribute('name','vec3')`, `varying(node)`, `vertexIndex`,
  `instanceIndex`.

## State & control flow
- `uniform(value)` → reactive; update `.value` from JS.
- `If(cond, () => {...}).ElseIf(cond, () => {...}).Else(() => {...})`.
- `Loop(count, ({ i }) => {...})`, `Break()`, `Continue()`, `select(cond, a, b)`.
- In-place: `.assign() .addAssign() .subAssign() .mulAssign() .divAssign()`.

## Textures & buffers
- `texture(map, uvNode)`, `.sample(uv) .level(lod) .grad(dx,dy) .depth(z)`.
- `cubeTexture(map)`, `texture3D(map)`, `storageTexture(...)`.
- `instancedArray(count, 'vec3')`, `storage(buffer, type, count)`,
  `.element(index)` to index a buffer in compute or material graphs.

## Noise / utility (names vary by version — confirm in examples)
- `hash`, `mx_noise_float`, `mx_fractal_noise_vec3`, `mx_cell_noise_float`,
  `triplanarTexture`, `oscSine/oscSquare/oscSawtooth`, `range`, `remap`,
  `rotate`, SDF helpers (`shapeCircle`, …).

## Compute kernel shape
```js
const kernel = Fn(() => {
  const p = buffer.element(instanceIndex);
  p.addAssign(vec3(0, -0.001, 0));
})().compute(count);
renderer.compute(kernel);   // or computeAsync
```
<!-- /skill:resource -->
