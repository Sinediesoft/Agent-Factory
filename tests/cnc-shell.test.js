import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Box3, Raycaster, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

test('ROBODRILL exterior retains the CAD scale, glazing and clear left-sliding loading port', async () => {
  const data = await readFile(new URL('../public/models/cnc-l01-shell.glb', import.meta.url));
  const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  const {scene} = await new GLTFLoader().parseAsync(buffer, '');
  scene.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(scene);
  const tol = 0.001;
  assert.ok(bounds.min.distanceTo(new Vector3(-1.46, 0, -1.05)) < tol);
  assert.ok(bounds.max.distanceTo(new Vector3(1.53, 3.44, 1.704)) < tol);
  const door = scene.getObjectByName('SlidingDoor');
  assert.deepEqual(door.children.map(p => p.name).sort(), ['DoorGlass','DoorHandle','DoorPanel']);
  assert.equal(scene.getObjectByName('DoorGlass').material.transparent, true);
  assert.equal(scene.getObjectByName('SideGlass').material.transparent, true);
  const cabinet = scene.getObjectByName('Cabinet');
  function hits(part, x, y) {
    const ray = new Raycaster(new Vector3(x, y, 2), new Vector3(0, 0, -1), 0, .60);
    return ray.intersectObject(part, true).length > 0;
  }
  for (const x of [-.38, 0, .71]) {
    for (const y of [.82, 1.52, 3.09]) assert.equal(hits(cabinet, x, y), false);
  }
  for (const [x,y] of [[-.40,1.52],[.73,1.52],[0,.80],[0,3.11]]) {
    assert.equal(hits(cabinet, x, y), true);
  }
  assert.ok(hits(door, 0, 1.52));
  door.position.x = -1.004;
  scene.updateMatrixWorld(true);
  for (const x of [-.26, 0, .55]) assert.equal(hits(scene, x, 1.52), false);
});
