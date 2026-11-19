import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Box3, Raycaster, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

test('CNC shell mounts on the plinth in metres and leaves the front opening clear', async () => {
  const data = await readFile(new URL('../public/models/cnc-l01-shell.glb', import.meta.url));
  const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  const {scene} = await new GLTFLoader().parseAsync(buffer, '');
  scene.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(scene);
  const tolerance = 0.001;
  assert.ok(bounds.min.distanceTo(new Vector3(-1.92, 0.32, -1.61)) < tolerance);
  assert.ok(bounds.max.distanceTo(new Vector3(1.92, 3.06, 1.61)) < tolerance);

  // Probe the front panel through its full thickness without reaching the back of the cabinet.
  function hitsFrontPanel(x, y) {
    const ray = new Raycaster(new Vector3(x, y, 2), new Vector3(0, 0, -1), 0, 0.6);
    return ray.intersectObject(scene, true).length > 0;
  }
  for (const x of [-1.24, 0, 1.24]) {
    for (const y of [0.74, 1.52, 2.30]) assert.equal(hitsFrontPanel(x, y), false);
  }
  for (const [x, y] of [[-1.26, 1.52], [1.26, 1.52], [0, 0.72], [0, 2.32]]) {
    assert.equal(hitsFrontPanel(x, y), true);
  }
});
