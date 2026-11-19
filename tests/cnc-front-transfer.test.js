import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Box3, Raycaster, Triangle, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DEMO } from '../src/config.js';
import { frontStation, frontTransferPose, poseFrontRobot, gripOffset, fixtureHeight } from '../src/cnc-front-transfer.js';
import { buildSimulation } from '../src/sim.js';
import { stateAt } from '../src/playback.js';
import { makeTrackLayout } from '../src/track-layout.js';

async function load(name) {
  const bytes = await readFile(new URL('../public/models/'+name+'.glb',import.meta.url));
  const {scene} = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  scene.updateMatrixWorld(true);
  return scene;
}

function collider(mesh, sliding) {
  const {index, attributes:{position}} = mesh.geometry;
  const vertices = Array.from({length:position.count},(_,i)=>new Vector3().fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld));
  const triangles=[];
  for (let i=0; i < (index?.count ?? position.count); i+=3) {
    const vertex = j => vertices[index ? index.getX(j) : j];
    triangles.push(new Triangle(vertex(i),vertex(i+1),vertex(i+2)));
  }
  return {name:mesh.name, sliding, triangles, bounds:new Box3().setFromPoints(vertices)};
}

test('CNC-L01 carriage, tool and workpiece clear the CAD enclosure throughout a front transfer', async () => {
  const [shell,group,cnc,track] = await Promise.all(['cnc-l01-shell','robot','cnc','track'].map(load));
  const station=DEMO.stations[frontStation];
  const meshes=group.getObjectsByProperty('isMesh',true).filter(m=>!m.name.startsWith('protect-'));
  const robot={group,shoulder:group.getObjectByName('Shoulder'),elbow:group.getObjectByName('Elbow'),
    wrist:group.getObjectByName('Wrist'),jaws:meshes.filter(m=>m.name.startsWith('rough-jaw'))};
  const door=shell.getObjectByName('SlidingDoor');
  const solids=shell.getObjectsByProperty('isMesh',true).map(m=>collider(m,m.parent===door));
  for (const m of cnc.getObjectsByProperty('isMesh',true)) {
    if (/^(work-fixture|cross-slide|table-t-slot|spindle-|cutting-tool)/.test(m.name)) solids.push(collider(m,false));
  }
  const path=makeTrackLayout().docks.find(d=>d.id===frontStation).path;
  const [endX,endZ]=path.at(-1);
  assert.ok(Math.abs(path.at(-2)[0]-endX)<1e-6 && path.at(-2)[1]>endZ+1.5);
  assert.ok(track.getObjectByName('Dock_'+frontStation).getWorldPosition(new Vector3()).distanceTo(new Vector3(endX,0,endZ))<.001);
  const railHead=DEMO.railHeightM+.065;
  for (const shoe of meshes.filter(m=>m.name.startsWith('rail-shoe'))) {
    assert.ok(Math.abs(new Box3().setFromObject(shoe,true).min.y-railHead)<.001);
    assert.ok(Math.abs(Math.abs(shoe.position.z)-.29)<.001);
    const above = new Vector3(endX+shoe.position.z,1,endZ-shoe.position.x);
    const hits = new Raycaster(above,new Vector3(0,-1,0)).intersectObject(track.getObjectByName('Track_dock_steel'));
    assert.ok(hits.some(hit=>Math.abs(hit.point.y-railHead)<.001), `${shoe.name} has no rail beneath it at the dock`);
  }

  const sim=buildSimulation(), transfer=sim.spans.filter(p=>p.station===frontStation && p.piece==='P01' && p.category==='action');
  for (const mode of ['place','pick']) {
    const actions=transfer.filter(s=>s.mode===mode);
    const start=actions[0].start, end=actions.at(-1).end;
    const ticks=Array.from({length:end-start+101},(_,i)=>start-50+i);
    let nearFixture=false, crossedDoor=false;
    for (const tick of ticks) {
      const state=stateAt(sim,tick), arm=state.arms[actions[0].arm], piece=state.pieces.P01;
      assert.notEqual(arm.frontRailYaw,null);
      const pose=arm.frontPose ?? frontTransferPose(station,null,piece.carriedBy?'place':'pick',0);
      const open=state.machines[frontStation].doorFraction ?? 0;
      group.position.set(arm.position[0]-station.x,0,arm.position[1]-station.z);
      poseFrontRobot(robot,arm.frontRailYaw,pose);
      group.updateMatrixWorld(true);
      const tcp=robot.wrist.localToWorld(new Vector3(gripOffset.forward,gripOffset.height,0));
      if (arm.frontPose) {
        assert.ok(Math.abs(tcp.x-(endX-station.x))<.0001);
        assert.ok(Math.abs(tcp.y-pose.height)<.0001);
        assert.ok(Math.abs(tcp.z-(endZ-station.z-pose.reach))<.0001);
      }
      if (tcp.z<1.70) {assert.equal(open,1);crossedDoor=true;}
      if (Math.abs(tcp.z-.87)<.001 && Math.abs(tcp.y-fixtureHeight)<.001) nearFixture=true;
      const bounds=meshes.map(m=>[m.name,new Box3().setFromObject(m,true)]);
      const partCenter=piece.carriedBy ? tcp : new Vector3(endX-station.x,fixtureHeight,.87);
      const partBox=new Box3().setFromCenterAndSize(partCenter,new Vector3(.50,.18,.75));
      for (const [name,body] of bounds) {
        assert.ok(!body.intersectsBox(partBox.clone().expandByScalar(-.00005)),`${mode} tick ${tick}: ${name} penetrates P01`);
      }
      bounds.push(['P01',partBox]);
      for (const [name,box] of bounds) {
        for (const solid of solids) {
          // Conservatively test the moving part's entire AABB against the actual CAD triangles.
          const check=box.clone().expandByScalar(-.00005); // allow contact with the fixture at rest
          if (solid.sliding) {check.min.x+=open*1.004; check.max.x+=open*1.004;}
          if (!check.intersectsBox(solid.bounds)) continue;
          assert.ok(!solid.triangles.some(t=>check.intersectsTriangle(t)),`${mode} tick ${tick}: ${name} touches ${solid.name}`);
        }
      }
    }
    assert.ok(crossedDoor && nearFixture);
  }
});
