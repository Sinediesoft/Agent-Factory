// Check the actual two robot instances at every schedule tick, including parked and waiting arms.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Box3,Vector3, Matrix4, Triangle, Quaternion, Euler} from 'three';
import {OBB} from 'three/addons/math/OBB.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DEMO} from '../src/config.js';
import {buildSimulation} from '../src/sim.js';
import {stateAt} from '../src/playback.js';
import {gripOffset,poseFrontRobot} from '../src/cnc-front-transfer.js';
import {armPose,toolSeat,storeSlot} from '../src/robot-motion.js';
import {makeTrackLayout} from '../src/track-layout.js';

const data=Uint8Array.from(await readFile(new URL('../public/models/robot.glb',import.meta.url)));
const template=(await new GLTFLoader().parseAsync(data.buffer,'')).scene;
const ids=['R1','R2'], sim=buildSimulation(), layout=makeTrackLayout();
const rails=[layout.main.path,...layout.rings.map(r=>r.path),...layout.branches.flatMap(b=>b.paths),...layout.docks.map(d=>d.path)]
  .flatMap(p=>p.slice(1).map((b,i)=>{const a=p[i],dx=b[0]-a[0],dz=b[1]-a[1];return {a,dx,dz,l:dx*dx+dz*dz};})).filter(s=>s.l);
function onRail([x,z]) {
  return rails.some(({a,dx,dz,l})=>{
    const px=x-a[0],pz=z-a[1],t=Math.max(0,Math.min(1,(px*dx+pz*dz)/l));
    return (px-dx*t)**2+(pz-dz*t)**2<.014**2;
  });
}

const zero=new Vector3(), one=new Vector3(1,1,1);
function volume(name,size,center,yaw=0) {
  const rot=new Quaternion().setFromEuler(new Euler(0,yaw,0));
  const local=new OBB(zero.clone(),size.clone().multiplyScalar(.5).addScalar(-.0001));
  const matrix=new Matrix4().compose(center,rot,one);
  return {name,box:local.applyMatrix4(matrix)};
}
function part(mesh) {
  mesh.geometry.computeBoundingBox();
  const local=new OBB().fromBox3(mesh.geometry.boundingBox);
  local.halfSize.addScalar(-.0001);
  return {name:mesh.name,mesh,local,box:new OBB()};
}
function updatePart(p) {
  p.box.copy(p.local).applyMatrix4(p.mesh.matrixWorld);
  p.box.center.copy(p.local.center).applyMatrix4(p.mesh.matrixWorld);
}
function robot() {
  const group=template.clone(true), parts=group.getObjectsByProperty('isMesh',true).map(part);
  const get=name=>group.getObjectByName(name);
  for(const [name,parent] of [['upper','Shoulder'],['fore','Elbow'],['wrist','Wrist']])
    assert.equal(get('comfy-'+name+'-shell').parent,get(parent));
  return {group,shoulder:get('Shoulder'),elbow:get('Elbow'),wrist:get('Wrist'),parts,
    jaws:parts.filter(p=>p.name.includes('-jaw')).map(p=>p.mesh)};
}
const rigs=Object.fromEntries(ids.map(id=>[id,robot()]));
const stands=[], tools={};
for (const tool of DEMO.tools) {
  const dock=tool.dock, seat=toolSeat(DEMO,dock,tool.kind);
  const at=(y,along=0)=>new Vector3(seat.x+along*Math.cos(seat.yaw),y,seat.z-along*Math.sin(seat.yaw));
  stands.push(volume(dock+' foot',new Vector3(.46,.20,.46),at(.1,.12)),
    volume(dock+' post',new Vector3(.16,.80,.16),at(.60,.12)),
    volume(tool.id+' cradle',new Vector3(.24,.12,.35),at(seat.y-.20,.12),seat.yaw));
  const rough=tool.kind==='ROUGH', fixture=template.getObjectByName(rough?'ToolRough':'ToolProtect').clone(true);
  fixture.position.copy(at(seat.y));fixture.rotation.y=seat.yaw;
  for(const j of fixture.children.filter(o=>o.name.includes('jaw'))) j.position.z=Math.sign(j.position.z)*(.25+(rough?.055:.06)+.04);
  fixture.updateMatrixWorld(true);
  tools[tool.id]=fixture.getObjectsByProperty('isMesh',true).map(mesh=>{
    const p=part(mesh);updatePart(p);p.name=tool.id+'/'+p.name;return p;
  });
}
const shelves=Object.entries(DEMO.stores).flatMap(([id,s])=>[volume(id,new Vector3(3.9,.74,2.5),new Vector3(s.x,.37,s.z)),
  volume(id+' tier',new Vector3(3.9,.45,.86),new Vector3(s.x,.965,s.z+.52))]);
function solid(mesh) {
  mesh.geometry.computeBoundingBox();
  const points=mesh.geometry.attributes.position;
  const vertices=Array.from({length:points.count},(_,i)=>new Vector3().fromBufferAttribute(points,i).applyMatrix4(mesh.matrixWorld));
  const index=mesh.geometry.index?.array ?? vertices.map((_,i)=>i);
  const faces=[];
  for(let j=0;j<index.length;j+=3)faces.push(new Triangle(vertices[index[j]],vertices[index[j+1]],vertices[index[j+2]]));
  return {name:mesh.name,box:new Box3().setFromPoints(vertices),faces};
}
const localTri=new Triangle(),bounds=new Box3();
function intersectsSolid(body,obstacle) {
  if(!body.box.intersectsBox3(obstacle.box))return false;
  const rotation=body.box.rotation.clone().transpose(),center=body.box.center;
  bounds.min.copy(body.box.halfSize).negate();bounds.max.copy(body.box.halfSize);
  return obstacle.faces.some(face=>{
    for(const k of ['a','b','c'])localTri[k].copy(face[k]).sub(center).applyMatrix3(rotation);
    return bounds.intersectsTriangle(localTri);
  });
}
const machines=[];
for(const [id,station] of Object.entries(DEMO.stations)) {
  const file=station.type==='CNC'?'cnc-l01-shell':station.type.toLowerCase();
  const bytes=Uint8Array.from(await readFile(new URL('../public/models/'+file+'.glb',import.meta.url)));
  const model=(await new GLTFLoader().parseAsync(bytes.buffer,'')).scene;
  model.position.set(station.x,0,station.z);
  const box=new Box3().setFromObject(model,true);
  machines.push({name:id,box:new OBB().fromBox3(box),solids:model.getObjectsByProperty('isMesh',true).map(solid)});
}
const workSize=new Vector3(.75,.18,.50);
const changes={R1:0,R2:0}, counts={R1:{place:0,pick:0},R2:{place:0,pick:0}};
const separation={min:Infinity}, lastMount={R1:null,R2:null};
let tick=0;
function check(a,b) {assert.ok(!a.box.intersectsOBB(b.box,1e-10),`tick ${tick}: ${a.name} overlaps ${b.name}`);}
for (;tick<=sim.durationTicks;tick++) {
  const state=stateAt(sim,tick), shapes={}, cargo={};
  for(const [id,p] of Object.entries(state.pieces)) if(p.carriedBy) cargo[p.carriedBy]=id;
  for(const id of ids) {
    const a=state.arms[id], r=rigs[id], pose=armPose(a,Boolean(cargo[id]));
    assert.ok(onRail(a.position),`${id} left rail at ${tick}`);
    r.group.position.set(a.position[0],0,a.position[1]);
    poseFrontRobot(r,a.railYaw,pose);r.group.updateMatrixWorld(true);
    const visible=r.parts.filter(p=>!(p.name.startsWith('rough-')&&!a.mountedTool?.includes('ROUGH')) &&
      !(p.name.startsWith('protect-')&&!a.mountedTool?.includes('PROTECT')));
    for(const p of visible)updatePart(p);
    // Adjacent pivots are intentionally coupled; compare rigid bodies across nonadjacent joints.
    const nearBase=visible.filter(p=>/^(rail-|rotary-waist|turntable)/.test(p.name));
    const upper=visible.find(p=>p.name==='comfy-upper-shell');
    for(const end of visible.filter(p=>/^(comfy-fore|comfy-wrist|tool-flange|rough-|protect-)/.test(p.name))){
      for (const base of nearBase)check(base,end);
      if(!end.name.startsWith('comfy-fore'))check(upper,end);
    }
    shapes[id]=[...visible];
    const tcp=r.wrist.localToWorld(new Vector3(gripOffset.forward,gripOffset.height,0));
    if(cargo[id]) {
      const stock=volume(cargo[id],workSize,tcp,pose.yaw);
      for(const p of visible) check(p,stock);
      shapes[id].push(stock);
    }
    if(a.mountedTool!==lastMount[id]){
      const tool=a.mountedTool||lastMount[id], seat=toolSeat(DEMO,a.activeStation,tool.includes('ROUGH')?'ROUGH':'PROTECT');
      const flange=r.wrist.localToWorld(new Vector3(.52,-.1,0));
      assert.ok(flange.distanceTo(new Vector3(seat.x,seat.y,seat.z))<.0002,'tool changes away from socket');
      if(a.mountedTool)changes[id]++;
      lastMount[id]=a.mountedTool;
    }
    const equipment=[...stands,...shelves,...Object.entries(tools).filter(([k])=>!ids.some(other=>state.arms[other].mountedTool===k)).flatMap(([,v])=>v)];
    for(const p of shapes[id]) for(const obstacle of equipment) {
      if(p.box.center.distanceToSquared(obstacle.box.center)<16)check(p,obstacle);
    }
    // The matching action is checked against individual machine triangles in cnc-front-transfer.test.js.
    for(const machine of machines) {
      if(a.frontPose && a.activeStation===machine.name)continue;
      if(Math.hypot(a.position[0]-machine.box.center.x,a.position[1]-machine.box.center.z)>7)continue;
      for(const body of shapes[id]) if(body.box.intersectsOBB(machine.box))
        for(const obstacle of machine.solids) assert.ok(!intersectsSolid(body,obstacle),
          `tick ${tick}: ${id}/${body.name} touches ${machine.name}/${obstacle.name}`);
    }
    for(const [piece,p] of Object.entries(state.pieces)){
      if(!DEMO.stores[p.location])continue;
      const slot=storeSlot(DEMO.stores[p.location],piece);
      if(Math.hypot(a.position[0]-slot.x,a.position[1]-slot.z)>4)continue;
      const stock=volume(piece,workSize,new Vector3(slot.x,slot.y,slot.z),slot.yaw);
      for(const body of shapes[id]) check(body,stock);
    }
  }
  const d=rigs.R1.group.position.distanceTo(rigs.R2.group.position);
  separation.min=Math.min(separation.min,d);
  if(d<7.5)for(const p of shapes.R1)for(const q of shapes.R2)check(p,q);
}
for(const s of sim.spans.filter(s=>DEMO.stations[s.station] && s.action==='手臂伸入'))counts[s.arm][s.mode]++;
for(const id of ids)assert.ok(counts[id].place&&counts[id].pick&&changes[id]>1);
const finalState=stateAt(sim,sim.durationTicks);
assert.equal(finalState.stock.FG,DEMO.recipe.quantity);
for(const id of ids) {
  const park=DEMO.service[DEMO.armStart[id]];
  const [x,z]=finalState.arms[id].position;
  assert.ok(Math.hypot(x-park.x,z-park.z)<.001,`${id} ended outside its parking berth`);
}
console.log(JSON.stringify({ticks:tick,minimumCarriageCenterDistance:separation.min,installedTools:changes,frontTransfers:counts,finished:sim.stats.piecesDone}));
