import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DEMO, ticksToSeconds } from './config.js';
import { makeTrackLayout, validateTrackLayout } from './track-layout.js';
import { buildSimulation, validateSimulation } from './sim.js';
import { stateAt, PlaybackClock } from './playback.js';
import { machineLampState, machineStatusText, updateMachineLamp } from './machine-status.js';
import { monitorAreas, monitorAreaPose, monitorInteriorPose, monitorTarget } from './monitor.js';
import { machiningCycle, machiningFrame, wheelOnStock, edmDischarging, edmSurfaceProgress, wireSlotLength } from './machining-animation.js';

import { frontStation, frontTransferPose, poseFrontRobot, gripOffset, frontFixture } from './cnc-front-transfer.js';

const $ = id => document.getElementById(id);
const sim = buildSimulation();
const errors = validateSimulation(sim);
if (errors.length) throw new Error(errors.join('; '));
const playback = new PlaybackClock(sim.durationTicks);
const processSpans=Object.fromEntries(Object.keys(DEMO.stations).map(id=>[id,
  sim.spans.filter(span=>span.category==='process'&&span.station===id)]));
const processSpanAt=(id,tick)=>processSpans[id]?.find(span=>span.start<=tick&&tick<span.end);
const processCycleAt=(id,tick)=>machiningCycle(processSpans[id]||[],tick);
let demoStopTick=null;
let trialMachiningWindow = null;
const format = tick => {
  const seconds = Math.floor(ticksToSeconds(tick));
  const hours = Math.floor(seconds / 3600), minutes = Math.floor(seconds % 3600 / 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};
$('completion-time').textContent = `${sim.stats.completedAtMinutes.toFixed(1)} 分鐘`;
$('time-end').textContent = format(sim.durationTicks);
$('seek').max = String(sim.durationTicks);
$('route-list').innerHTML = DEMO.recipe.route.map((s, i) => `<li data-n="${i + 1}"><b>${s.id === 'ROUGH' ? 'CNC-L01 / R01' : s.machines[0]}</b>${s.labels.join(' → ')} · ${s.seconds.reduce((a,b)=>a+b,0)/60} 分鐘</li>`).join('');

const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);
scene.fog = new THREE.Fog(0xffffff, 48, 95);
const modelRoot = new THREE.Group(); scene.add(modelRoot);
const scaleInput=$('model-scale'),scaleOutput=$('model-scale-value');
let savedScale=0;
try{savedScale=Number(localStorage.getItem('agentFactoryModelScalePercent'));}catch{}
let modelScale=(savedScale>=70&&savedScale<=200?savedScale:110)/100;
scaleInput.value=String(Math.round(modelScale*100));
scaleOutput.value=`${Math.round(modelScale*100)}%`;
modelRoot.scale.setScalar(modelScale);
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 250);
camera.position.set(25, 30, 29);
const controls = new OrbitControls(camera, canvas);
controls.target.set(-1, 0, 0);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI / 2.06;
controls.minDistance = 6; controls.maxDistance = 150;
controls.update();
const overviewView={position:[25,30,29],target:[-1,0,0]};
let monitorMode=false;
let shellTrialView=false;
let trialPieceId=null;
let monitorView='inside';
const monitorButton=$('monitor-mode-btn'),monitorInsideModeButton=$('monitor-inside-mode-btn'),monitorControls=$('monitor-controls');
const monitorZoneSelect=$('monitor-zone'),monitorTargetSelect=$('monitor-target');
const monitorInsideButton=$('monitor-inside'),monitorOutsideButton=$('monitor-outside');
const monitorDemoButton=$('monitor-demo-btn');
const monitorSizeInput=$('monitor-size'),monitorSizeOutput=$('monitor-size-value');
const sceneWrap=$('scene-wrap'),sceneScaleControl=$('scene-scale-control');
const monitorAreaList=monitorAreas(DEMO);
const machineIdsByArea=new Map(monitorAreaList.map(area=>[area.id,
  new Set(area.targets.filter(id=>DEMO.stations[id]))]));
for(const area of monitorAreaList)monitorZoneSelect.add(new Option(area.label,area.id));
function fillMonitorTargets(){
  const area=monitorAreaList.find(item=>item.id===monitorZoneSelect.value);
  monitorTargetSelect.replaceChildren();
  for(const id of area.targets)monitorTargetSelect.add(new Option(monitorTarget(id,DEMO).label,id));
  if(!area.targets.some(id=>DEMO.stations[id]))monitorView='outside';
  syncMonitorViewControls();
  if(monitorMode)setMonitorCamera();
}
function syncMonitorViewControls(){
  monitorInsideButton.disabled=!monitorAreaList.find(area=>area.id===monitorZoneSelect.value)
    .targets.some(id=>DEMO.stations[id]);
  monitorInsideButton.classList.toggle('active',monitorView==='inside');
  monitorOutsideButton.classList.toggle('active',monitorView==='outside');
  monitorInsideButton.setAttribute('aria-pressed',String(monitorView==='inside'));
  monitorOutsideButton.setAttribute('aria-pressed',String(monitorView==='outside'));
  $('monitor-target-control').hidden=monitorView==='outside';
  monitorDemoButton.hidden=monitorView==='outside';
}
fillMonitorTargets();
let savedMonitorSize=0;
try{savedMonitorSize=Number(localStorage.getItem('agentFactoryMonitorSizePercent'));}catch{}
let monitorSize=(savedMonitorSize>=65&&savedMonitorSize<=100?savedMonitorSize:85);
monitorSizeInput.value=String(monitorSize);
monitorSizeOutput.value=`${monitorSize}%`;
sceneWrap.style.setProperty('--monitor-width',`${monitorSize}%`);
function setMonitorCamera(){
  const id=monitorTargetSelect.value;
  const area=monitorAreaList.find(item=>item.id===monitorZoneSelect.value);
  const pose=monitorView==='inside'?monitorInteriorPose(id,modelScale,DEMO)
    :monitorAreaPose(area.id,modelScale,DEMO);
  camera.fov=pose.fov;
  camera.updateProjectionMatrix();
  camera.position.set(...pose.position);
  controls.target.set(...pose.target);
  camera.lookAt(...pose.target);
  $('monitor-feed-name').textContent=monitorView==='inside'?`${id} · 機內全景`:`${area.label} · 全景`;
  document.querySelector('.scene-overlay span:first-child').textContent=monitorOverlayText();
  applyMonitorCutaway();
  if(monitorMode)setFocusButton(monitorView==='inside'?monitorInsideModeButton:monitorButton);
  updatePanel(stateAt(sim,playback.tick));
}
function monitorOverlayText(){
  return monitorView==='outside'
    ?'模擬機外監視 · 點機台狀態燈看機內 · 非實際攝影機'
    :'模擬監視畫面 · 非實際攝影機';
}
function applyMonitorCutaway(){
  const inside=monitorMode&&monitorView==='inside';
  const selectedId=monitorTargetSelect.value;
  const areaTargets=new Set(monitorAreaList.find(area=>area.id===monitorZoneSelect.value).targets);
  const selectedPieces=new Set(Object.entries(stateAt(sim,playback.tick).pieces)
    .filter(([,piece])=>piece.location===selectedId&&!piece.carriedBy).map(([id])=>workpieceMeshes[id]));
  // Isolate the machine interior; in exterior feeds, remove machines from other areas.
  for(const child of modelRoot.children){
    const machineId=Object.entries(machineMeshes).find(([,obj])=>child===obj.group||obj.fallback?.includes(child))?.[0];
    child.visible=inside
      ?machineId===selectedId||selectedPieces.has(child)
      :!monitorMode||!machineId||areaTargets.has(machineId);
    if (shellTrialView && machineId && machineId !== shellStationId) child.visible = false;
  }
  for(const [id,obj] of Object.entries(machineMeshes)){
    if(obj.group){
      const interiorNames=/^(cross-slide|table-t-slot|work-fixture|spindle-housing|spindle-chuck|cutting-tool|grinder-bed|grinder-column|magnetic-chuck|chuck-line.*|wheel-spindle|grinding-wheel|wheel-center|wheel-index|wheel-guard|coolant-nozzle|coolant-line|dielectric-tank|dielectric-basin|tank-rim|wire-guide-.*|wire-bed-.*|lower-wire-head|upper-wire-head|wire-filament|fixture-block|ram-sleeve.*|z-ram|electrode-holder|electrode|machining-.*)$/;
      obj.group.traverse(part=>{
        if(part.isMesh)part.visible=!(inside&&id===selectedId)||interiorNames.test(part.name);
      });
    }else if(obj.roof){
      obj.roof.visible=!(inside&&id===selectedId);
      obj.door.visible=!(inside&&id===selectedId);
    }
  }
}
function setFocusButton(button){
  document.querySelectorAll('.scene-focus button').forEach(item=>item.classList.toggle('active',item===button));
}
for(const button of document.querySelectorAll('.scene-focus button[data-focus]'))button.addEventListener('click',()=>{
  demoStopTick=null;
  shellTrialView=false;
  monitorMode=false;
  applyMonitorCutaway();
  camera.fov=45;camera.updateProjectionMatrix();
  monitorControls.hidden=true;$('monitor-feed-badge').hidden=true;sceneScaleControl.hidden=false;
  sceneWrap.classList.remove('monitor-view');controls.enabled=true;
  document.querySelector('.scene-overlay span:first-child').textContent='Blender 3D · 點機台狀態燈看機內 · 拖曳旋轉 · 滾輪縮放';
  const target=new THREE.Vector3(...overviewView.target).multiplyScalar(modelScale);
  const offset=new THREE.Vector3(...overviewView.position).sub(new THREE.Vector3(...overviewView.target));
  camera.position.copy(target).add(offset);controls.target.copy(target);controls.update();
  setFocusButton(button);resize();
});
function openMonitor(view){
  if(shellTrialView || view!==monitorView)demoStopTick=null;
  shellTrialView=false;
  monitorView=view;
  if(view==='inside'&&!monitorAreaList.find(area=>area.id===monitorZoneSelect.value).targets.some(id=>DEMO.stations[id])){
    monitorZoneSelect.value=monitorAreaList.find(area=>area.targets.some(id=>DEMO.stations[id])).id;
    fillMonitorTargets();
  }
  syncMonitorViewControls();
  monitorMode=true;
  canvas.style.cursor='';
  monitorControls.hidden=false;$('monitor-feed-badge').hidden=false;sceneScaleControl.hidden=true;
  sceneWrap.classList.add('monitor-view');controls.enabled=false;
  document.querySelector('.scene-overlay span:first-child').textContent=monitorOverlayText();
  setMonitorCamera();resize();
  updatePanel(stateAt(sim,playback.tick));
}
function openMachineInterior(id){
  const station=DEMO.stations[id];
  if(!station)return;
  demoStopTick=null;
  monitorMode=false;
  monitorZoneSelect.value=station.zone;
  fillMonitorTargets();
  monitorTargetSelect.value=id;
  openMonitor('inside');
}
monitorButton.addEventListener('click',()=>openMonitor('outside'));
monitorInsideModeButton.addEventListener('click',()=>openMonitor('inside'));
monitorZoneSelect.addEventListener('change',()=>{demoStopTick=null;fillMonitorTargets();});
monitorTargetSelect.addEventListener('change',()=>{demoStopTick=null;setMonitorCamera();});
monitorInsideButton.addEventListener('click',()=>{if(monitorInsideButton.disabled)return;monitorView='inside';syncMonitorViewControls();setMonitorCamera();});
monitorOutsideButton.addEventListener('click',()=>{demoStopTick=null;monitorView='outside';syncMonitorViewControls();setMonitorCamera();});
monitorDemoButton.addEventListener('click',()=>{
  const id=monitorTargetSelect.value;
  const cycle=processCycleAt(id,playback.tick)||processCycleAt(id,processSpans[id]?.[0]?.start);
  if(!cycle)return;
  playback.rate=60;$('speed-select').value='60';
  playback.seek(playback.tick>=cycle.start&&playback.tick<cycle.end?playback.tick:cycle.start);
  demoStopTick=cycle.end;
  playback.play();
  updatePanel(stateAt(sim,playback.tick));
});
monitorSizeInput.addEventListener('input',()=>{
  monitorSize=Number(monitorSizeInput.value);
  monitorSizeOutput.value=`${monitorSize}%`;
  sceneWrap.style.setProperty('--monitor-width',`${monitorSize}%`);
  try{localStorage.setItem('agentFactoryMonitorSizePercent',String(monitorSize));}catch{}
});
scaleInput.addEventListener('input',()=>{
  const nextScale=Number(scaleInput.value)/100;
  if(shellTrialView){
    const ratio=nextScale/modelScale;
    camera.position.multiplyScalar(ratio);controls.target.multiplyScalar(ratio);
  }else if(!monitorMode){
    const shift=new THREE.Vector3(...overviewView.target).multiplyScalar(nextScale-modelScale);
    camera.position.add(shift);controls.target.add(shift);
  }
  modelScale=nextScale;modelRoot.scale.setScalar(modelScale);
  if(monitorMode)setMonitorCamera();
  scaleOutput.value=`${Math.round(modelScale*100)}%`;
  key.shadow.camera.left=-36*modelScale;key.shadow.camera.right=36*modelScale;
  key.shadow.camera.top=32*modelScale;key.shadow.camera.bottom=-32*modelScale;
  key.shadow.camera.updateProjectionMatrix();controls.update();
  try{localStorage.setItem('agentFactoryModelScalePercent',String(Math.round(modelScale*100)));}catch{}
});
scene.add(new THREE.HemisphereLight(0xffffff, 0xaab9c8, 1.6));
const key = new THREE.DirectionalLight(0xffffff, 2.1); key.position.set(-16, 30, 12);
key.castShadow=true;key.shadow.mapSize.set(2048,2048);key.shadow.camera.left=-36*modelScale;key.shadow.camera.right=36*modelScale;
key.shadow.camera.top=32*modelScale;key.shadow.camera.bottom=-32*modelScale;key.shadow.camera.far=90;scene.add(key);
const fill = new THREE.DirectionalLight(0xb8dff1, 0.8); fill.position.set(25, 18, -18); scene.add(fill);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(65, 50), new THREE.MeshStandardMaterial({ color: 0xdce7ed, roughness: 0.95 }));
floor.rotation.x = -Math.PI / 2; floor.position.y = -0.08; floor.receiveShadow=true; modelRoot.add(floor);
const grid = new THREE.GridHelper(64, 32, 0xa7bdcc, 0xc6d6e0); grid.position.y = -0.06; modelRoot.add(grid);
const trackLayout=makeTrackLayout();
const trackErrors=validateTrackLayout(trackLayout);
if(trackErrors.length)throw new Error(trackErrors.join('; '));
const fallbackTrack=new THREE.Group(); modelRoot.add(fallbackTrack);
function box(w,h,d,color,x,y,z,metalness=0.12) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color,metalness,roughness:.65}));
  mesh.position.set(x,y,z); modelRoot.add(mesh); return mesh;
}
function line(points,color,width=0.12,y=DEMO.railHeightM) {
  for(let i=0;i<points.length-1;i++) {
    const a=points[i],b=points[i+1];
    const length=Math.hypot(b[0]-a[0],b[1]-a[1]);
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(width,.09,length),new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.32,metalness:.55,roughness:.4}));
    mesh.position.set((a[0]+b[0])/2,y,(a[1]+b[1])/2);
    mesh.rotation.y=Math.atan2(b[0]-a[0],b[1]-a[1]); fallbackTrack.add(mesh);
  }
}
line(trackLayout.main.path,0x48aff0,.24);
for(const ring of trackLayout.rings)line(ring.path,0x9585df,.08);
for(const branch of trackLayout.branches)for(const path of branch.paths)line(path,0xe5b767,.12);
for(const dock of trackLayout.docks)line(dock.railEnd ? [...dock.path.slice(dock.railStartIndex),dock.railEnd] : dock.path,0x60a9a4,.08);
for(const branch of DEMO.branchOrder) {
  const turn=new THREE.Mesh(new THREE.CylinderGeometry(DEMO.turntable.radiusM,DEMO.turntable.radiusM,.2,32),new THREE.MeshStandardMaterial({color:0x5b7390,metalness:.6,roughness:.35}));
  turn.position.set(DEMO.branchPoints[branch][0],DEMO.railHeightM-.12,DEMO.branchPoints[branch][1]);fallbackTrack.add(turn);
}
const machineMeshes={};
const lampPickTargets=[];
const lampPickGeometry=new THREE.SphereGeometry(.49,16,12);
const lampPickMaterial=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0,depthWrite:false,colorWrite:false});
function addLampPickTarget(parent,id,center){
  const pick=new THREE.Mesh(lampPickGeometry,lampPickMaterial);
  pick.name=`LampPick_${id}`;pick.position.copy(center);pick.userData.machineId=id;
  parent.add(pick);lampPickTargets.push(pick);
  return pick;
}
function makeFallbackLamp(x,z){
  const group=new THREE.Group();group.position.set(x,3.03,z);
  for(const [name,height] of [['green',.13],['orange',.34],['red',.55]]){
    const lens=new THREE.Mesh(new THREE.CylinderGeometry(.21,.21,.19,20),
      new THREE.MeshStandardMaterial({color:0x45535c,emissive:0x000000,roughness:.25}));
    lens.name=`Status${name[0].toUpperCase()}${name.slice(1)}`;lens.position.y=height;group.add(lens);
  }
  modelRoot.add(group);
  return {group,lamps:Object.fromEntries(['red','orange','green'].map(name=>[name,group.getObjectByName(`Status${name[0].toUpperCase()}${name.slice(1)}`)]))};
}
for(const [id,m] of Object.entries(DEMO.stations)) {
  const body=box(m.type==='CNC'?3.5:3.8,2.7,m.type==='CNC'?3:3.3,0x3a596b,m.x,1.35,m.z);
  const roof=box(2.5,.18,2.1,m.type==='CNC'?0x2a8db2:0x5d849b,m.x,2.78,m.z);
  const door=box(2.6,1.45,.18,0x88c8d8,m.x,.95,m.z+1.55,.35);
  machineMeshes[id]={door,roof,fallback:[body,roof,door]};
  const status=makeFallbackLamp(m.x+1.35,m.z-.6);
  machineMeshes[id].lamps=status.lamps;
  machineMeshes[id].lampPick=addLampPickTarget(status.group,id,new THREE.Vector3(0,.34,0));
  machineMeshes[id].fallback.push(status.group);
}
for(const [id,s] of Object.entries(DEMO.stores)) {
  box(3.8,.6,2.4,id==='RAW'?0x4e819b:id==='FG'?0x41795f:0x796b9f,s.x,.3,s.z);
  box(3.9,.12,2.5,0x6a8799,s.x,.68,s.z);
}
for(const [id,s] of Object.entries(DEMO.service)) {
  if(id.startsWith('I')) continue;
  box(2,.45,1.8,0x7c6b99,s.x,.23,s.z);
}
const armMeshes={};
for(const [id,color] of [['R1',0x60d4fa],['R2',0xf8bd70]]) {
  const group=new THREE.Group(); modelRoot.add(group);
  const mat=new THREE.MeshStandardMaterial({color,metalness:.65,roughness:.3});
  const base=new THREE.Mesh(new THREE.CylinderGeometry(.55,.7,.4,16),mat);base.position.y=DEMO.railHeightM+.2;group.add(base);
  const column=new THREE.Mesh(new THREE.CylinderGeometry(.16,.2,2.1,12),mat);column.position.y=DEMO.railHeightM+1.3;group.add(column);
  const boom=new THREE.Mesh(new THREE.BoxGeometry(1.75,.22,.24),mat);boom.position.set(.85,DEMO.railHeightM+2.3,0);group.add(boom);
  const claw=new THREE.Mesh(new THREE.BoxGeometry(.5,.5,.5),new THREE.MeshStandardMaterial({color:0xddebf3,metalness:.7,roughness:.25}));claw.position.set(1.7,DEMO.railHeightM+1.97,0);group.add(claw);
  armMeshes[id]={group,claw};
}
const gltfLoader=new GLTFLoader();
const loadModel=url=>new Promise((resolve,reject)=>gltfLoader.load(url,resolve,undefined,reject));
let shellStationId = frontStation;
const trialPicker = $('cnc-trial-station');
for (const [id, station] of Object.entries(DEMO.stations)) {
  if (frontFixture(station)) trialPicker.add(new Option(id, id));
}
trialPicker.value = shellStationId;

function installCadShell(group, template, machine) {
  const shell = template.clone(true);
  shell.name = 'CadShell';
  shell.traverse(part => {
    if (!part.isMesh) return;
    part.castShadow = !part.material.transparent;
    part.receiveShadow = true;
    part.material.shadowSide = THREE.BackSide;
    if (part.material.transparent) part.material.depthWrite = false;
  });
  if (shell.getObjectByName('CNC-L01-enclosure')) {
    // Earlier exports contain only the fixed enclosure. Keep the Blender doors and controls.
    const fixed = /^(rear-enclosure|roof|left-side|right-side|front-header|front-sill|interior-black|side-vent-\d+)$/;
    for (const part of [...group.getObjectByName('MachineRoot').children]) {
      if (fixed.test(part.name)) part.removeFromParent();
    }
  } else {
    installRobodrillExterior(group, shell, machine);
  }
  group.add(shell);
}

function installRobodrillExterior(group, shell, machine) {
  const door = shell.getObjectByName('SlidingDoor');
  const doorPanel = shell.getObjectByName('DoorPanel');
  const lamps = {
    red: shell.getObjectByName('StackRed'),
    orange: shell.getObjectByName('StackOrange'),
    green: shell.getObjectByName('StackGreen'),
  };
  const hasStack = Object.values(lamps).some(Boolean);
  const lenses = hasStack ? lamps : {beacon: shell.getObjectByName('BeaconLens')};
  if (!door || !doorPanel || Object.values(lenses).some(mesh => !mesh?.isMesh)) {
    throw new Error('Incomplete CNC exterior');
  }
  // STEP paint can also be shared by the emergency stop and lettering.
  for (const mesh of Object.values(lenses)) mesh.material = mesh.material.clone();
  const panelSize = new THREE.Box3().setFromObject(doorPanel).getSize(new THREE.Vector3());
  machine.slidingDoor = door;
  machine.doorStroke = panelSize.x - .120;
  machine.lamps = lenses;
  const middle = hasStack ? lamps.orange : lenses.beacon;
  machine.lampPick.position.copy(new THREE.Box3().setFromObject(middle).getCenter(new THREE.Vector3()));
  if (hasStack) machine.lampPick.scale.setScalar(.5);
  const original = group.getObjectByName('MachineRoot');
  for (const part of [...original.children]) {
    if (!/^(cross-slide|table-t-slot|work-fixture|spindle-housing|spindle-chuck|cutting-tool)/.test(part.name)) {
      part.removeFromParent();
    }
  }
}

$('cnc-shell-demo').addEventListener('click', () => {
  shellStationId = trialPicker.value;
  const loading = sim.spans.find(s => s.station === shellStationId && s.mode === 'place');
  if (!loading) return;
  const unloading = sim.events.find(e => e.type === 'picked' && e.source === shellStationId &&
    e.piece === loading.piece && e.tick > loading.end);
  if (!unloading) return;
  const station = DEMO.stations[shellStationId];
  document.querySelector('[data-focus="all"]').click();
  shellTrialView = true;
  trialPieceId = loading.piece;
  applyMonitorCutaway();
  controls.target.set(station.x + .05, 1.52, station.z + 1.95).multiplyScalar(modelScale);
  camera.position.copy(controls.target).add(new THREE.Vector3(-6.8, 2.9, 6.2).multiplyScalar(modelScale));
  controls.update();
  setFocusButton($('cnc-shell-demo'));
  document.querySelector('.scene-overlay span:first-child').textContent =
    [shellStationId, {CNC:'ROBODRILL',GRIND:'平面研磨 · FANUC 控制器風格 · ComfyUI 外殼',WIRE:'ROBOCUT · ComfyUI 外殼',EDM:'成形放電 · ComfyUI 外殼'}[station.type], loading.piece].join(' · ');
  const arrival = sim.spans.find(span => span.taskId === loading.taskId && span.frontTo === shellStationId);
  playback.seek(arrival ? Math.max(arrival.start, loading.start - 50) : loading.start);
  const cutting = processSpans[shellStationId].filter(span => span.piece === loading.piece);
  const pickup = sim.spans.find(span => span.taskId === unloading.taskId && span.station === shellStationId && span.mode === 'pick');
  trialMachiningWindow = {start:cutting[0].start, end:cutting.at(-1).end, pickup:pickup.start};
  playback.rate = 2;
  $('speed-select').value = '2';
  demoStopTick = unloading.tick;
  playback.play();
  updatePanel(stateAt(sim, playback.tick));
});
const modelFiles={CNC:'cnc',GRIND:'grind',WIRE:'wire',EDM:'edm'};
const movingParts={
  CNC:['spindle-housing','spindle-chuck','cutting-tool'],
  GRIND:['grinding-wheel','wheel-center','wheel-spindle','wheel-guard','coolant-nozzle'],
  WIRE:['wire-guide-slide','upper-wire-head','wire-filament','lower-wire-head'],
  EDM:['z-ram','electrode-holder','electrode'],
};
const machiningContacts={CNC:[0,1.32,.87],GRIND:[-.245,1.82,.59],WIRE:[-.30,1.44,-.20],EDM:[0,2.08,.7]};
const machiningColors={CNC:0xd97423,GRIND:0xf09524,WIRE:0x138fb2,EDM:0x7447c4};
const spinAxis=new THREE.Vector3(0,1,0),spinQuaternion=new THREE.Quaternion(),motionOffset=new THREE.Vector3();
function attachMachiningAnimation(group,type){
  const parts=movingParts[type].map(name=>group.getObjectByName(name)).filter(Boolean)
    .map(mesh=>({mesh,position:mesh.position.clone(),quaternion:mesh.quaternion.clone(),
      spin:(type==='CNC'&&mesh.name!=='cutting-tool')||(type==='GRIND'&&['grinding-wheel','wheel-center'].includes(mesh.name))}));
  const effect=new THREE.Group();effect.name='machining-effect';
  effect.position.set(...machiningContacts[type]);effect.visible=false;
  if(type!=='CNC') effect.scale.setScalar(.38);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(.14,.014,7,32),
    new THREE.MeshBasicMaterial({color:machiningColors[type],transparent:true,opacity:.72,depthWrite:false}));
  ring.name='machining-contact-ring';ring.rotation.x=Math.PI/2;effect.add(ring);
  const sparks=Array.from({length:8},(_,i)=>{
    const mesh=new THREE.Mesh(new THREE.OctahedronGeometry(.035+(i%3)*.009),
      new THREE.MeshBasicMaterial({color:machiningColors[type],transparent:true,opacity:.8,depthWrite:false}));
    mesh.name=`machining-spark-${i}`;effect.add(mesh);return mesh;
  });
  group.add(effect);
  return {parts,effect,ring,sparks,contact:new THREE.Vector3(...machiningContacts[type])};
}
const turntableRotors={};
const turntableSpans=Object.fromEntries(DEMO.branchOrder.map(id=>[id,sim.spans
  .filter(span=>span.category==='turntable'&&span.resources.includes(`turntable:${id}`))
  .sort((a,b)=>a.start-b.start)]));
Promise.all([...Object.values(modelFiles),'robot','track'].map(name=>loadModel(`/models/${name}.glb`).then(gltf=>[name,gltf.scene])))
  .then(async entries=>{
    const templates=Object.fromEntries(entries);
    const track=templates.track;
    track.traverse(node=>{if(node.isMesh){node.castShadow=true;node.receiveShadow=true;}});
    modelRoot.remove(fallbackTrack);modelRoot.add(track);
    for(const id of DEMO.branchOrder)turntableRotors[id]=track.getObjectByName(`Rotor_${id}`);
    for(const [id,m] of Object.entries(DEMO.stations)){
      const previous=machineMeshes[id];
      const group=templates[modelFiles[m.type]].clone(true);
      group.traverse(node=>{if(node.isMesh){node.castShadow=true;node.receiveShadow=true;if(node.material)node.material=node.material.clone();}});
      group.position.set(m.x,0,m.z);modelRoot.add(group);
      const pickIndex=lampPickTargets.indexOf(previous.lampPick);
      if(pickIndex>=0)lampPickTargets.splice(pickIndex,1);
      for(const old of previous.fallback)modelRoot.remove(old);
      const doorL=group.getObjectByName('Door_L'),doorR=group.getObjectByName('Door_R');
      const yellowLamp=group.getObjectByName('StatusYellow');
      group.updateWorldMatrix(true,true);
      const lampCenter=yellowLamp?group.worldToLocal(yellowLamp.getWorldPosition(new THREE.Vector3()))
        :new THREE.Vector3(1.5,3.65,.7);
      const slidingDoor = group.getObjectByName('SlidingDoor');
      machineMeshes[id]={group,slidingDoor,doorStroke:slidingDoor?.userData.stroke,gate:group.getObjectByName('TankGate'),doorL,doorR,closedL:doorL?.position.x,closedR:doorR?.position.x,
        lamps:{red:group.getObjectByName('StatusRed'),orange:yellowLamp,green:group.getObjectByName('StatusGreen')},
        lampPick:addLampPickTarget(group,id,lampCenter),machining:attachMachiningAnimation(group,m.type)};
    }
    applyMonitorCutaway();
    for(const id of ['R1','R2']){
      const previous=armMeshes[id];
      const group=templates.robot.clone(true);
      group.traverse(node=>{if(node.isMesh){node.castShadow=true;node.receiveShadow=true;if(node.material)node.material=node.material.clone();}});
      modelRoot.remove(previous.group);modelRoot.add(group);
      armMeshes[id]={group,shoulder:group.getObjectByName('Shoulder'),elbow:group.getObjectByName('Elbow'),
        wrist:group.getObjectByName('Wrist'),toolRough:group.getObjectByName('ToolRough'),
        toolProtect:group.getObjectByName('ToolProtect'),
        jaws:group.getObjectsByProperty('isMesh',true).filter(mesh=>/^(rough|protect)-jaw/.test(mesh.name))};
      for (const jaw of armMeshes[id].jaws) jaw.userData.restZ=jaw.position.z;
    }
    try {
      const {scene: shell} = await loadModel('/models/cnc-l01-shell.glb');
      for (const [id, station] of Object.entries(DEMO.stations)) {
        if (station.type === 'CNC') installCadShell(machineMeshes[id].group, shell, machineMeshes[id]);
      }
      applyMonitorCutaway();
      $('cnc-shell-demo').disabled = false;
    } catch (error) {
      console.error('CNC shell load failed', error);
      $('cnc-shell-demo').title = '試播外殼載入失敗';
    }
    document.querySelector('.scene-overlay span:first-child').textContent=monitorMode
      ?monitorOverlayText():'Blender 3D · 點機台狀態燈看機內 · 拖曳旋轉 · 滾輪縮放';
  }).catch(error=>{console.error('Blender model load failed',error);
    document.querySelector('.scene-overlay span:first-child').textContent='3D 模型載入失敗，顯示簡化備援模型';});
const workpieceMeshes={};
const wireStage = DEMO.recipe.route.findIndex(step=>step.id==='WIRE')+1;
const edmStage = DEMO.recipe.route.findIndex(step=>step.id==='EDM')+1;
const sinkMarkGeometry = new THREE.PlaneGeometry(.23,.22);
const kerfGeometry = new THREE.PlaneGeometry(1,.012);
const kerfMaterial = new THREE.MeshBasicMaterial({color:0x343a3d});
for(let i=0;i<6;i++) {
  const material=new THREE.MeshStandardMaterial({color:0xb5c8d2,metalness:.76,roughness:.28});
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(.75,.18,.5),material);modelRoot.add(mesh);
  const kerf = new THREE.Mesh(kerfGeometry,kerfMaterial);
  kerf.rotation.x=-Math.PI/2;
  kerf.visible=false;
  mesh.add(kerf);
  mesh.userData.kerf=kerf;
  const mark = new THREE.Mesh(sinkMarkGeometry, new THREE.MeshBasicMaterial({
    color:0x524237, transparent:true, depthWrite:false
  }));
  mark.rotation.x=-Math.PI/2;
  mark.position.y=.091;
  mark.visible=false;
  mesh.add(mark);
  mesh.userData.sinkMark=mark;
  workpieceMeshes[`P${String(i+1).padStart(2,'0')}`]=mesh;
}
const labelPoints={...Object.fromEntries(Object.entries(DEMO.stations).map(([k,v])=>[k,[v.x,4.25,v.z]])),
  ...Object.fromEntries(Object.entries(DEMO.stores).map(([k,v])=>[k,[v.x,1.7,v.z]]))};
for(const id of ['R1','R2'])labelPoints[id]=[0,2,0];
for(const id of Object.keys(labelPoints)) {const el=document.createElement('span');el.className='scene-label';
  if(DEMO.stations[id]){
    const dot=document.createElement('i');dot.className='machine-light off';el.append(dot);
    el.dataset.machine=id;el.setAttribute('role','button');el.tabIndex=0;
    el.setAttribute('aria-label',`查看 ${id} 機內監視`);
  }
  el.append(document.createTextNode(id));$('labels').append(el);labelPoints[id].el=el;}
$('labels').addEventListener('click',event=>{
  const label=event.target.closest('[data-machine]');
  if(lampNavigationEnabled()&&label)openMachineInterior(label.dataset.machine);
});
$('labels').addEventListener('keydown',event=>{
  if(event.key!=='Enter'&&event.key!==' ')return;
  const label=event.target.closest('[data-machine]');
  if(lampNavigationEnabled()&&label){event.preventDefault();openMachineInterior(label.dataset.machine);}
});
function lampNavigationEnabled(){return !monitorMode||monitorView==='outside';}
const lampRaycaster=new THREE.Raycaster(),lampPointer=new THREE.Vector2();
function lampAt(event){
  const bounds=canvas.getBoundingClientRect();
  lampPointer.set((event.clientX-bounds.left)/bounds.width*2-1,
    -(event.clientY-bounds.top)/bounds.height*2+1);
  lampRaycaster.setFromCamera(lampPointer,camera);
  const targets=monitorMode
    ?lampPickTargets.filter(pick=>DEMO.stations[pick.userData.machineId].zone===monitorZoneSelect.value)
    :shellTrialView ? lampPickTargets.filter(pick=>pick.userData.machineId===shellStationId) : lampPickTargets;
  return lampRaycaster.intersectObjects(targets,false)[0]?.object.userData.machineId;
}
let lampPointerDown=null;
canvas.addEventListener('pointerdown',event=>{
  if(event.button===0&&lampNavigationEnabled())lampPointerDown=[event.clientX,event.clientY];
});
canvas.addEventListener('pointerup',event=>{
  const start=lampPointerDown;lampPointerDown=null;
  if(!lampNavigationEnabled()||event.button!==0||!start||Math.hypot(event.clientX-start[0],event.clientY-start[1])>5)return;
  const id=lampAt(event);
  if(id)openMachineInterior(id);
});
canvas.addEventListener('pointercancel',()=>{lampPointerDown=null;});
canvas.addEventListener('pointermove',event=>{canvas.style.cursor=lampNavigationEnabled()&&lampAt(event)?'pointer':'';});
canvas.addEventListener('pointerleave',()=>{canvas.style.cursor='';});
function resize(){const w=canvas.clientWidth,h=canvas.clientHeight;if(canvas.width!==Math.round(w*renderer.getPixelRatio())||canvas.height!==Math.round(h*renderer.getPixelRatio())){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}}
const resizeObserver=new ResizeObserver(resize);resizeObserver.observe($('scene-wrap'));resize();
function updateLabels(){
  const width=canvas.clientWidth,height=canvas.clientHeight;
  const exterior=monitorMode&&monitorView==='outside';
  const areaMachines=exterior?machineIdsByArea.get(monitorZoneSelect.value):null;
  for(const [id,p] of Object.entries(labelPoints)){
    if(id==='R1'||id==='R2'){
      const g=armMeshes[id].group;p[0]=g.position.x;p[2]=g.position.z;
    }
    const v=new THREE.Vector3(p[0],p[1],p[2]).multiplyScalar(modelScale).project(camera);
    p.el.style.left=`${(v.x*.5+.5)*width}px`;
    p.el.style.top=`${(-v.y*.5+.5)*height}px`;
    const outsideTrial = shellTrialView && id !== shellStationId && !armMeshes[id];
    p.el.style.display=outsideTrial||(monitorMode&&!exterior)||(exterior&&!areaMachines.has(id))||v.z>1?'none':'block';
  }
}
function updateScene(state){
  for(const id of DEMO.branchOrder){
    const rotor=turntableRotors[id];
    if(!rotor)continue;
    let turns=0;
    for(const span of turntableSpans[id]){
      if(state.tick>=span.end)turns++;
      else if(state.tick>span.start)turns+=(state.tick-span.start)/(span.end-span.start);
      else break;
    }
    rotor.rotation.y=turns*Math.PI/2;
  }
  for(const [id,arm] of Object.entries(state.arms)){
    const obj=armMeshes[id];obj.group.position.set(arm.position[0],0,arm.position[1]);
    const target=DEMO.stations[arm.activeStation]||DEMO.stores[arm.activeStation];
    if (arm.frontRailYaw != null && obj.wrist) {
      const carrying=Object.values(state.pieces).some(p=>p.carriedBy===id);
      const pose=arm.frontPose ?? frontTransferPose(DEMO.stations[arm.frontStationId],null,carrying?'place':'pick',0);
      poseFrontRobot(obj,arm.frontRailYaw,pose);
    } else {
      if (obj.shoulder) {
        obj.shoulder.rotation.z=obj.elbow.rotation.z=obj.wrist.rotation.z=0;
        for (const jaw of obj.jaws) jaw.position.z=jaw.userData.restZ;
      }
      if(target){
        const angle=-Math.atan2(target.z-arm.position[1],target.x-arm.position[0]);
        obj.group.rotation.y=THREE.MathUtils.lerp(obj.group.rotation.y,angle,.12);
      }
      if(obj.shoulder){
        const working=arm.status==='action';
        obj.shoulder.rotation.y=THREE.MathUtils.lerp(obj.shoulder.rotation.y,working?-.35:0,.09);
        obj.elbow.rotation.y=THREE.MathUtils.lerp(obj.elbow.rotation.y,working ? .45 : -.12,.09);
        obj.wrist.rotation.y=THREE.MathUtils.lerp(obj.wrist.rotation.y,working ? .15 : 0,.09);
      }
    }
    if(obj.claw)obj.claw.material.color.set(arm.tool?.includes('PROTECT')?0xa8e5c7:0xe9d9a6);
    if(obj.toolRough)obj.toolRough.visible=Boolean(arm.tool?.includes('ROUGH'));
    if(obj.toolProtect)obj.toolProtect.visible=Boolean(arm.tool?.includes('PROTECT'));
  }
  for(const [id,m] of Object.entries(state.machines)){
    const obj=machineMeshes[id];
    if(obj.gate){
      obj.gate.position.y=-obj.gate.userData.stroke*(m.doorFraction ?? Number(m.doorOpen));
    }else if(obj.slidingDoor){
      obj.slidingDoor.position.x=-obj.doorStroke*(m.doorFraction ?? Number(m.doorOpen));
    }else if(obj.doorL){obj.doorL.position.x=THREE.MathUtils.lerp(obj.doorL.position.x,obj.closedL+(m.doorOpen?-.55:0),.15);
      obj.doorR.position.x=THREE.MathUtils.lerp(obj.doorR.position.x,obj.closedR+(m.doorOpen ? .55 : 0),.15);}
    else obj.door.position.y=m.doorOpen?1.8:.95;
    updateMachineLamp(obj.lamps,m.status);
    if(obj.machining){
      const animation=obj.machining;
      const frame=machiningFrame(state.tick,processSpanAt(id,state.tick),DEMO.stations[id].type,m.status);
      motionOffset.set(...frame.offset);
      for(const part of animation.parts){
        part.mesh.position.copy(part.position).add(motionOffset);
        part.mesh.quaternion.copy(part.quaternion);
        if(part.spin){
          spinQuaternion.setFromAxisAngle(spinAxis,frame.phase*4);
          part.mesh.quaternion.multiply(spinQuaternion);
        }
      }
      const grind = DEMO.stations[id].type==='GRIND';
      const wire = DEMO.stations[id].type==='WIRE';
      const edm = DEMO.stations[id].type==='EDM';
      const inView = (monitorMode&&monitorView==='inside'&&monitorTargetSelect.value===id) ||
        ((grind||wire||edm)&&shellTrialView&&shellStationId===id);
      animation.effect.visible=frame.active && inView && (!grind || wheelOnStock(frame.progress)) && (!edm || edmDischarging(frame.progress)) &&
        (!wire || animation.contact.z+motionOffset.z >= frontFixture(DEMO.stations[id]).depth-.375);
      if(animation.effect.visible){
        animation.effect.position.copy(animation.contact).add(motionOffset);
        if(edm){
          // Show a local discharge at the perimeter of the square copper electrode.
          animation.effect.position.x+=.105*Math.sin(frame.phase*2);
          animation.effect.position.z+=.116;
        }
        animation.ring.material.opacity=.52+frame.pulse*.24;
        for(const [index,spark] of animation.sparks.entries()){
          const angle=frame.phase*3+index*Math.PI/4;
          const radius=.09+(index%3)*.04;
          spark.position.set(Math.cos(angle)*radius,.04+.15*Math.abs(Math.sin(angle*1.3)),Math.sin(angle)*radius*.7);
          spark.material.opacity=.4+.55*Math.abs(Math.sin(angle+frame.phase));
        }
      }
    }
    labelPoints[id].el.firstElementChild.className=`machine-light ${machineLampState(m.status)||'off'}`;
  }
  for(const [id,p] of Object.entries(state.pieces)){
    const mesh=workpieceMeshes[id];
    mesh.visible=(!shellTrialView || id===trialPieceId) &&
      (!monitorMode||monitorView!=='inside'||(p.location===monitorTargetSelect.value&&!p.carriedBy));
    mesh.rotation.y=0;
    if(p.carriedBy){const obj=armMeshes[p.carriedBy];
      if(obj.wrist && state.arms[p.carriedBy].frontRailYaw != null){
        mesh.position.set(gripOffset.forward,gripOffset.height,0);
        obj.wrist.localToWorld(mesh.position);modelRoot.worldToLocal(mesh.position);mesh.rotation.y=Math.PI/2;
      }
      else if(obj.wrist){obj.wrist.getWorldPosition(mesh.position);modelRoot.worldToLocal(mesh.position);mesh.position.y-=.25;}
      else {const a=obj.group.position;mesh.position.set(a.x+1.7,DEMO.railHeightM+1.5,a.z);}}
    else if(DEMO.stations[p.location]){
      const s=DEMO.stations[p.location];
      const fixture=frontFixture(s);
      mesh.position.set(s.dock[0],fixture.height,s.z+fixture.depth);
      mesh.rotation.y=Math.PI/2;
    }
    else {const s=DEMO.stores[p.location];const index=Number(id.slice(1))-1;mesh.position.set(s.x-1.25+(index%3)*1.25,.84,s.z-.47+Math.floor(index/3)*.9);}
    const cutting=p.location==='WIRE-01' && processSpanAt(p.location,state.tick);
    const progress=p.stage>=wireStage ? 1 : cutting ? (state.tick-cutting.start)/(cutting.end-cutting.start) : 0;
    const length=wireSlotLength(progress), kerf=mesh.userData.kerf;
    kerf.visible=length>0;
    kerf.position.set(.375-length/2,.0905,0);
    kerf.scale.x=length;
    const sinking=p.location==='EDM-01' && processSpanAt(p.location,state.tick);
    const burn=p.stage>=edmStage ? 1 : sinking ? edmSurfaceProgress((state.tick-sinking.start)/(sinking.end-sinking.start)) : 0;
    mesh.userData.sinkMark.visible=burn>0;
    mesh.userData.sinkMark.material.opacity=.72*burn;
    mesh.material.color.set(p.done?0x8bd5ad:p.stage>=2?0xc2d9ee:0xc6a982);
  }
}
const ganttRows=[...Object.keys(DEMO.stations),'R1','R2'];
for(const id of ganttRows){const row=document.createElement('div');row.className='gantt-row';row.innerHTML=`<label>${id}</label><div class="gantt-track"></div>`;const track=row.querySelector('.gantt-track');const bars=id.startsWith('R')?sim.tasks.filter(t=>t.arm===id).map(t=>({start:t.accepted,end:t.finished,category:'travel',label:`${t.piece} ${t.source} → ${t.dest}`})):sim.spans.filter(s=>s.category==='process'&&s.station===id);for(const s of bars){const bar=document.createElement('i');bar.className=`gantt-bar ${s.category}`;bar.style.left=`${s.start/sim.durationTicks*100}%`;bar.style.width=`${Math.max(.3,(s.end-s.start)/sim.durationTicks*100)}%`;bar.title=`${s.label} · ${format(s.start)}–${format(s.end)}`;track.append(bar);}const cursor=document.createElement('i');cursor.className='gantt-cursor';track.append(cursor);$('gantt').append(row);}
const eventName={accepted:'接單',execution_started:'放行執行',tool_changed:'工具確認',picked:'取件完成',placed:'放件確認',task_completed:'任務完成',process_started:'加工開始',process_completed:'加工完成',machine_faulted:'機台異常',machine_recovered:'異常解除'};
let machineStatusMarkup='';
$('machine-status-list').addEventListener('click',event=>{
  const row=event.target.closest('[data-machine]');
  if(row)openMachineInterior(row.dataset.machine);
});
function updatePanel(state){
  $('clock-big').firstChild.textContent=format(state.tick);
  $('scene-tick').textContent=`T + ${format(state.tick)}`;
  $('time-current').textContent=format(state.tick);
  $('seek').value=String(state.tick);
  $('metric-done').textContent=`${Object.values(state.pieces).filter(p=>p.done).length} / 6`;
  $('metric-steps').textContent=`${sim.events.filter(e=>e.type==='process_completed'&&e.tick<=state.tick).length} / 36`;
  $('stock-list').innerHTML=Object.entries(state.stock).map(([id,n])=>`<div class="stock-row" data-store="${id}"><div class="stock-head"><span>${id}</span><b>${n} / 6</b></div><div class="stock-cells">${Array.from({length:6},(_,i)=>`<i class="${i<n?'filled':''}"></i>`).join('')}</div></div>`).join('');
  const nextMachineStatusMarkup=Object.entries(state.machines).map(([id,m])=>{
    const lamp=machineLampState(m.status)||'off';
    return `<button type="button" class="machine-status-row" data-machine="${id}" title="查看 ${id} 機內監視"><b>${id}</b><span class="machine-status-value"><i class="machine-light ${lamp}"></i>${machineStatusText(m.status)}</span></button>`;
  }).join('');
  if(nextMachineStatusMarkup!==machineStatusMarkup){
    $('machine-status-list').innerHTML=nextMachineStatusMarkup;
    machineStatusMarkup=nextMachineStatusMarkup;
  }
  if(monitorMode){
    const id=monitorTargetSelect.value;
    const machine=state.machines[id];
    const cycle=monitorView==='inside'?processCycleAt(id,state.tick):null;
    const frame=cycle&&machine
      ?machiningFrame(state.tick,cycle.span,DEMO.stations[id].type,machine.status)
      :{active:false};
    $('machining-hud').hidden=!frame.active;
    if(frame.active){
      const titles={CNC:'主軸切削',GRIND:'砂輪研磨',WIRE:'線割加工',EDM:'放電加工'};
      const progress=Math.round((state.tick-cycle.start)/(cycle.end-cycle.start)*100);
      $('machining-hud-title').textContent=titles[DEMO.stations[id].type];
      $('machining-hud-progress').textContent=`${progress}%`;
      $('machining-hud-fill').style.width=`${progress}%`;
    }
    $('monitor-feed-status').textContent=monitorView==='inside'?machineStatusText(machine.status)
      :`${monitorAreaList.find(area=>area.id===monitorZoneSelect.value).targets.length} 個監視位置`;
  }else $('machining-hud').hidden=true;
  $('arms-list').innerHTML=Object.values(state.arms).map(a=>`<div class="arm-card"><div class="arm-head"><b>${a.id}</b><span>${a.status}</span></div><small>${a.activeLabel||'待機'}<br>${a.tool||'未裝夾爪'}${a.task?` · ${a.task}`:''}</small></div>`).join('');
  $('event-list').innerHTML=state.recent.slice().reverse().map(e=>`<div class="event-row"><time>${format(e.tick)}</time>${eventName[e.type]||e.type} · ${e.piece||e.arm||''} ${e.machine||e.dest||e.source||e.tool||''}</div>`).join('');
  for(const cursor of document.querySelectorAll('.gantt-cursor'))cursor.style.left=`${state.tick/sim.durationTicks*100}%`;
  $('run-status').textContent=playback.playing?'模擬回放中':state.tick===sim.durationTicks?'六件完成 · 排程限制通過':state.tick===0?'排程限制通過 · 等待回放':'已暫停 · 手動繼續';
  $('play-btn').textContent=playback.playing?'❚❚ 暫停':'▶ 繼續回放';
}
$('play-btn').addEventListener('click',()=>{if(playback.playing)playback.pause();else {if(playback.tick>=sim.durationTicks)playback.seek(0);playback.play();}updatePanel(stateAt(sim,playback.tick));});
$('reset-btn').addEventListener('click',()=>{demoStopTick=null;playback.pause();playback.seek(0);updatePanel(stateAt(sim,0));});
$('seek').addEventListener('input',e=>{demoStopTick=null;playback.pause();playback.seek(Number(e.target.value));updatePanel(stateAt(sim,playback.tick));});
$('speed-select').addEventListener('change',e=>{trialMachiningWindow=null;playback.rate=Number(e.target.value);});
$('interpret-btn').addEventListener('click',async()=>{
  const btn=$('interpret-btn'),result=$('request-result');btn.disabled=true;result.textContent='正在呼叫本機 LLM 服務…';
  try{const response=await fetch('/api/interpret',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:$('request-text').value})});const body=await response.json();if(!response.ok)throw new Error(body.error||`HTTP ${response.status}`);result.replaceChildren();const title=document.createElement('strong');title.textContent='LLM 摘要 · 需確認後才排程';result.append(title);const detail=document.createElement('div');detail.textContent=`配方 ${body.recipeId||'未匹配'} · 數量 ${body.quantity??'未指定'} · 交期 ${body.dueMinutes??'未指定'} 分鐘 · ${body.notes||''}`;result.append(detail);}
  catch(error){result.textContent=`LLM 尚無法使用：${error.message.replace(/[。.!！]+$/,'')}。目前仍可回放固定六件示範。`;}
  finally{btn.disabled=false;}
});
let lastPanel=-Infinity;
function frame(now){
  requestAnimationFrame(frame);
  if (shellTrialView && demoStopTick !== null && trialMachiningWindow) {
    const {start, end, pickup} = trialMachiningWindow;
    const boundary = [start,end,pickup].find(tick => tick > playback.tick);
    const rate = playback.tick < start || playback.tick >= pickup ? 2 : playback.tick < end ? 60 : 600;
    playback.rate = rate;
    $('speed-select').value = String(rate);
    playback.advance(now);
    if (boundary != null && playback.tick > boundary) playback.seek(boundary);
  } else playback.advance(now);
  if (demoStopTick!==null && playback.tick>=demoStopTick) {
    playback.seek(demoStopTick); playback.pause(); demoStopTick=null;
  }
  const state=stateAt(sim,playback.tick);
  updateScene(state);
  if(!monitorMode)controls.update();
  updateLabels();
  if(now-lastPanel>110){updatePanel(state);lastPanel=now;}
  renderer.render(scene,camera);
}
updatePanel(stateAt(sim,0));requestAnimationFrame(frame);
