import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Box3, Raycaster, Triangle, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DEMO } from '../src/config.js';
import { frontTransferPose, poseFrontRobot, gripOffset, frontFixture } from '../src/cnc-front-transfer.js';
import { buildSimulation } from '../src/sim.js';
import { stateAt } from '../src/playback.js';
import { machiningFrame, wheelOnStock, edmDischarging, edmSurfaceProgress, wireSlotLength } from '../src/machining-animation.js';
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

const frontStations = Object.entries(DEMO.stations).filter(([,station]) => frontFixture(station));
for (const [frontStation, station] of frontStations) test(frontStation+' clears the enclosure during front loading and unloading', async () => {
  const cncShell = station.type === 'CNC';
  const tankGate = ['WIRE','EDM'].includes(station.type);
  const modelName = station.type.toLowerCase();
  const {height:fixtureHeight, depth} = frontFixture(station);
  const [shell,group,cnc,track] = await Promise.all([cncShell?'cnc-l01-shell':modelName,'robot','cnc','track'].map(load));
  const meshes=group.getObjectsByProperty('isMesh',true);
  const robot={group,shoulder:group.getObjectByName('Shoulder'),elbow:group.getObjectByName('Elbow'),
    wrist:group.getObjectByName('Wrist'),jaws:meshes.filter(m=>/^(rough|protect)-jaw/.test(m.name))};
  const door=shell.getObjectByName(tankGate?'TankGate':'SlidingDoor');
  assert.ok(door && (cncShell || shell.getObjectByName(modelName+'-depth-enclosure')));
  if (tankGate) assert.equal(door.userData.stroke,.94);
  if (station.type === 'GRIND') assert.equal(door.userData.stroke,1.52);
  const solids=shell.getObjectsByProperty('isMesh',true).map(m=>collider(m,m.parent===door));
  for (const m of cnc.getObjectsByProperty('isMesh',true)) {
    if (cncShell && /^(work-fixture|cross-slide|table-t-slot|spindle-|cutting-tool)/.test(m.name)) solids.push(collider(m,false));
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

  const sim=buildSimulation();
  const pieceId=sim.spans.find(p=>p.station===frontStation && p.mode==='place').piece;
  const transfer=sim.spans.filter(p=>p.station===frontStation && p.piece===pieceId && p.category==='action');
  for (const mode of ['place','pick']) {
    const actions=transfer.filter(s=>s.mode===mode);
    const start=actions[0].start, end=actions.at(-1).end;
    const ticks=Array.from({length:end-start+101},(_,i)=>start-50+i);
    let nearFixture=false, crossedDoor=false;
    for (const tick of ticks) {
      const state=stateAt(sim,tick), arm=state.arms[actions[0].arm], piece=state.pieces[pieceId];
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
      if (Math.abs(tcp.z-depth)<.001 && Math.abs(tcp.y-fixtureHeight)<.001) nearFixture=true;
      const inactive = arm.tool.includes('PROTECT') ? 'rough-' : 'protect-';
      const bounds=meshes.filter(m=>!m.name.startsWith(inactive)).map(m=>[m.name,new Box3().setFromObject(m,true)]);
      const partCenter=piece.carriedBy ? tcp : new Vector3(endX-station.x,fixtureHeight,depth);
      const partBox=new Box3().setFromCenterAndSize(partCenter,new Vector3(.50,.18,.75));
      for (const [name,body] of bounds) {
        assert.ok(!body.intersectsBox(partBox.clone().expandByScalar(-.00005)),`${mode} tick ${tick}: ${name} penetrates ${pieceId}`);
      }
      bounds.push([pieceId,partBox]);
      for (const [name,box] of bounds) {
        for (const solid of solids) {
          // Conservatively test the moving part's entire AABB against the actual CAD triangles.
          const check=box.clone().expandByScalar(-.00005); // allow contact with the fixture at rest
          if (solid.sliding) {
            const axis=tankGate?'y':'x', stroke=cncShell?1.004:door.userData.stroke;
            check.min[axis]+=open*stroke; check.max[axis]+=open*stroke;
          }
          if (!check.intersectsBox(solid.bounds)) continue;
          assert.ok(!solid.triangles.some(t=>check.intersectsTriangle(t)),`${mode} tick ${tick}: ${name} touches ${solid.name}`);
        }
      }
    }
    assert.ok(crossedDoor && nearFixture);
  }
});

test('GRIND-01 sweeps the clamped surface, parks the wheel and unloads with protected jaws', async () => {
  const id = 'GRIND-01', sim = buildSimulation(), model = await load('grind');
  const station = DEMO.stations[id], fixture = frontFixture(station);
  const stock = new Box3().setFromCenterAndSize(new Vector3(0,fixture.height,fixture.depth),new Vector3(.50,.18,.75));
  const bounds = name => new Box3().setFromObject(model.getObjectByName(name),true);
  const wheel = bounds('grinding-wheel'), center = wheel.getCenter(new Vector3());
  const chuck = bounds('magnetic-chuck');
  assert.ok(Math.abs(chuck.max.y-stock.min.y)<.0001);
  assert.ok(wheel.min.y-stock.max.y>.35);
  const guard = bounds('wheel-guard'), hub = bounds('wheel-center'), nozzle = bounds('coolant-nozzle');
  const processes = sim.spans.filter(s=>s.station===id && s.category==='process');
  assert.equal(new Set(processes.map(s=>s.piece)).size,6);
  for (const span of processes) {
    const first = stateAt(sim,span.start), last = stateAt(sim,span.end);
    assert.equal(first.machines[id].status,'processing');
    assert.equal(first.machines[id].doorOpen,false);
    assert.equal(first.pieces[span.piece].location,id);
    assert.equal(last.machines[id].status,'ready');
    const pick = sim.events.find(e=>e.type==='picked' && e.source===id && e.piece===span.piece);
    assert.ok(pick.tick>span.end);
    const unloaded = stateAt(sim,pick.tick);
    assert.match(unloaded.arms[pick.arm].tool,/PROTECT/);
    assert.equal(unloaded.pieces[span.piece].carriedBy,pick.arm);
  }

  // Probe the edges as well as the middle of the top face. Only the abrasive rim may touch it.
  const probes = [-.24,0,.24].flatMap(x=>[-.36,-.18,0,.18,.36].map(z=>({x,z:z+fixture.depth,hit:false})));
  const span = processes[0];
  for (let tick=span.start;tick<=span.end;tick++) {
    const frame = machiningFrame(tick,span,'GRIND','processing');
    const [dx,dy,dz] = frame.offset, gap = wheel.min.y+dy-stock.max.y;
    assert.ok(gap>-.0001 && Math.min(guard.min.y,hub.min.y,nozzle.min.y)+dy>stock.max.y);
    if (frame.active && wheelOnStock(frame.progress)) {
      assert.ok(Math.abs(gap)<.0001);
      for (const probe of probes) {
        if (Math.abs(probe.x-center.x-dx)<.006 && probe.z>wheel.min.z+dz && probe.z<wheel.max.z+dz) probe.hit=true;
      }
    }
    if (tick===span.start || tick===span.end) assert.ok(gap>.35 && dx===0 && dz===0);
  }
  assert.ok(probes.every(p=>p.hit),'grinding passes must reach the edges and center of the blank');
});


test('WIRE-01 advances the electrode through a clamped blank, parks it, and releases each completed part', async () => {
  const sim=buildSimulation(), model=await load('wire'), id='WIRE-01';
  const processes=sim.spans.filter(span=>span.station===id && span.category==='process');
  assert.equal(processes.length,6);
  for (const span of processes) {
    const ready=stateAt(sim,span.end), cutting=stateAt(sim,span.start);
    assert.equal(cutting.machines[id].status,'processing');
    assert.equal(cutting.machines[id].doorOpen,false);
    assert.equal(cutting.pieces[span.piece].location,id);
    assert.equal(ready.machines[id].status,'ready');
    assert.equal(ready.pieces[span.piece].stage,3);
    const pick=sim.events.find(e=>e.type==='picked' && e.source===id && e.piece===span.piece);
    assert.ok(pick.tick>span.end);
    assert.equal(stateAt(sim,pick.tick).pieces[span.piece].carriedBy,pick.arm);
  }
  const {height,depth}=frontFixture(DEMO.stations[id]);
  const blank=new Box3().setFromCenterAndSize(new Vector3(-.30,height,depth),new Vector3(.50,.18,.75));
  const bounds=name=>new Box3().setFromObject(model.getObjectByName(name),true);
  const supports=['wire-bed-left','wire-bed-right'].map(bounds);
  const parts=['wire-filament','upper-wire-head','lower-wire-head','wire-guide-slide'].map(bounds);
  const span=processes[0];
  let contact=false, previousLength=0;
  for (let t=span.start; t<=span.end; t++) {
    const frame=machiningFrame(t,span,'WIRE','processing');
    const offset=new Vector3(...frame.offset);
    const [wire,...guides]=parts.map(box=>box.clone().translate(offset));
    for(const box of [wire,...guides]) assert.ok(supports.every(s=>!s.intersectsBox(box)));
    assert.ok(guides.every(guide=>!guide.intersectsBox(blank)));
    if(t===span.start || t===span.end) assert.ok(!wire.intersectsBox(blank));
    contact ||= wire.intersectsBox(blank);
    const length=wireSlotLength((t-span.start)/(span.end-span.start));
    assert.ok(length>=previousLength && length<=.75);
    previousLength=length;
  }
  assert.ok(contact && previousLength>.5);
});


test('EDM-01 keeps a discharge gap, retracts the ram and unloads all six parts', async () => {
  const sim=buildSimulation(), id='EDM-01', model=await load('edm');
  const processes=sim.spans.filter(s=>s.station===id && s.category==='process');
  assert.equal(processes.length,6);
  for (const span of processes) {
    const cutting=stateAt(sim,span.start), done=stateAt(sim,span.end);
    assert.equal(cutting.machines[id].doorOpen,false);
    assert.equal(cutting.pieces[span.piece].location,id);
    assert.equal(cutting.machines[id].status,'processing');
    assert.equal(done.machines[id].status,'ready');
    assert.equal(done.pieces[span.piece].stage,5);
    const pick=sim.events.find(e=>e.type==='picked' && e.source===id && e.piece===span.piece);
    assert.ok(pick.tick>span.end);
    assert.equal(stateAt(sim,pick.tick).pieces[span.piece].carriedBy,pick.arm);
  }

  const bounds=name=>new Box3().setFromObject(model.getObjectByName(name),true);
  const fixture=frontFixture(DEMO.stations[id]);
  const stock=new Box3().setFromCenterAndSize(new Vector3(0,fixture.height,fixture.depth),new Vector3(.50,.18,.75));
  const tip=bounds('electrode'), holder=bounds('electrode-holder'), ram=bounds('z-ram');
  const sleeves=model.getObjectsByProperty('isMesh',true).filter(m=>m.name.startsWith('ram-sleeve'))
    .map(m=>new Box3().setFromObject(m,true));
  assert.equal(sleeves.length,4);
  assert.ok(Math.abs(bounds('fixture-block').max.y-stock.min.y)<.0001);
  assert.ok(Math.abs(tip.getCenter(new Vector3()).z-fixture.depth)<.0001);
  const span=processes[0];
  let activeTicks=0;
  for(let t=span.start;t<=span.end;t++){
    const frame=machiningFrame(t,span,'EDM','processing'), [x,y,z]=frame.offset;
    assert.equal(x,0);assert.equal(z,0);
    const gap=tip.min.y+y-stock.max.y;
    assert.ok(gap>0 && holder.min.y+y>stock.max.y);
    const movingRam=ram.clone().translate(new Vector3(x,y,z));
    assert.ok(sleeves.every(s=>!s.intersectsBox(movingRam)));
    if(frame.active && edmDischarging(frame.progress)){
      assert.ok(gap>.0049 && gap<.0081);
      activeTicks++;
    }
    if(t===span.start || t===span.end) assert.ok(gap>.50);
  }
  assert.ok(activeTicks>(span.end-span.start)*.70);
  assert.equal(edmSurfaceProgress(0),0);
  assert.equal(edmSurfaceProgress(1),1);
});
