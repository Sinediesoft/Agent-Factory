import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Box3, Raycaster, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { updateMachineLamp } from '../src/machine-status.js';

async function loadShell() {
  const data = await readFile(new URL('../public/models/cnc-l01-shell.glb', import.meta.url));
  const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  const {scene} = await new GLTFLoader().parseAsync(buffer, '');
  scene.updateMatrixWorld(true);
  return scene;
}

test('ROBODRILL exterior retains the CAD scale, glazing and clear left-sliding loading port', async () => {
  const scene = await loadShell();
  const bounds = new Box3().setFromObject(scene);
  const tol = 0.001;
  assert.ok(bounds.min.distanceTo(new Vector3(-1.46, 0, -1.05)) < tol);
  assert.ok(bounds.max.distanceTo(new Vector3(1.53, 3.817, 1.704)) < tol);
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

test('three lenses stack vertically on the front-right header above the console', async () => {
  const scene = await loadShell();
  const bounds = name => new Box3().setFromObject(scene.getObjectByName(name));
  const base = bounds('StackBase');
  const header = bounds('HeaderCap');
  const consolePanel = bounds('Console');
  assert.ok(Math.abs(base.min.y - header.max.y) < .001);
  assert.ok(base.min.x >= consolePanel.min.x && base.max.x <= consolePanel.max.x);
  assert.ok(base.min.z >= header.min.z && base.max.z <= header.max.z);
  const anchor = base.getCenter(new Vector3());
  let top = base.max.y;
  for (const name of ['StackMast', 'StackHousing', 'StackGreen', 'StackRingLower',
                      'StackOrange', 'StackRingUpper', 'StackRed', 'StackCap']) {
    const box = bounds(name);
    const center = box.getCenter(new Vector3());
    assert.ok(Math.abs(center.x - anchor.x) < .001 && Math.abs(center.z - anchor.z) < .001, name);
    assert.ok(Math.abs(box.min.y - top) < .001, name);
    top = box.max.y;
  }
  assert.equal(scene.getObjectByName('BeaconLens'), undefined);
});

test('only the lens for the current machine state emits light, including after a fault', async () => {
  const scene = await loadShell();
  const lamps = {red: scene.getObjectByName('StackRed'), orange: scene.getObjectByName('StackOrange'),
                 green: scene.getObjectByName('StackGreen')};
  for (const [status, expected] of [
    ['processing', 'green'], ['fault', 'red'], ['ready', 'orange'], ['idle', null],
  ]) {
    updateMachineLamp(lamps, status);
    for (const [name, mesh] of Object.entries(lamps)) {
      assert.equal(mesh.material.emissiveIntensity > 0, name === expected);
      assert.equal(mesh.material.emissive.getHex() !== 0, name === expected);
    }
  }
});
