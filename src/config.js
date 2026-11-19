// All dimensions and non-cutting times are synthetic demonstration values.
const cncStation = (x, label) => ({
  zone: 'CNC', type: 'CNC', label, x, z: -19, dock: [x + .16, -14.95],
});

export const DEMO = Object.freeze({
  kind: 'synthetic_demo',
  version: 'mvp-0.1',
  quantumSeconds: 0.1,
  travelSpeedMps: 0.5,
  sharedArcRadiusM: 2,
  railHeightM: 0.2,
  mainSegmentM: 11,
  areaSegmentM: 2,
  branchLengthM: 4,
  turntable: { enterS: 2, settleS: 1, rotateS: 5, confirmS: 1, clearS: 2, radiusM: 1.1 },
  dock: { approachS: 2, reverseS: 2 },
  cnc: { doorOpenS: 3, doorCloseS: 3, reachInS: 4, retreatS: 4,
    gripCloseS: 2, gripOpenS: 2, fixtureClampS: 2, fixtureReleaseS: 2,
    alignS: 2, placeS: 3, extractS: 3 },
  other: { guardOpenS: 2, guardCloseS: 2, reachS: 3, retreatS: 3,
    gripS: 2, releaseS: 2, placeS: 3, extractS: 3, fixtureS: 2 },
  storage: { reachS: 3, retreatS: 3, gripS: 2, releaseS: 2, placeS: 3, extractS: 3 },
  tool: { installS: 7, removeS: 5, verifyS: 2 },
  stockCapacity: { RAW: 6, WIP: 6, FG: 6 },
  initialStock: { RAW: 6, WIP: 0, FG: 0 },
  armStart: { R1: 'I1', R2: 'I2' },
  branchOrder: ['CNC', 'GRIND', 'WIRE', 'EDM', 'LOGISTICS', 'SERVICE'],
  branchPoints: {
    CNC: [-11, -7], GRIND: [0, -10], WIRE: [11, -7],
    EDM: [11, 7], LOGISTICS: [0, 10], SERVICE: [-11, 7],
  },
  stations: {
    'CNC-L01': cncStation(-17, '粗加工 A'),
    'CNC-R01': cncStation(-10.5, '粗加工 B'),
    'CNC-L02': cncStation(-23, '最終精加工'),
    'CNC-R02': cncStation(-4.8, '特徵加工'),
    'GRIND-01': { zone: 'GRIND', x: 2, z: -21, dock: [2, -17], type: 'GRIND', label: '平面研磨' },
    'WIRE-01': { zone: 'WIRE', x: 16.30, z: -15.5, dock: [16, -11.5], type: 'WIRE', label: '線割' },
    'EDM-01': { zone: 'EDM', x: 16, z: -1, dock: [16, 3], type: 'EDM', label: '放電' },
  },
  stores: {
    RAW: { zone: 'RAW', branch: 'LOGISTICS', x: -5, z: 16, dock: [-2.8, 14.4], label: '原料 6 格' },
    WIP: { zone: 'WIP', branch: 'LOGISTICS', x: 0, z: 17, dock: [0, 14.5], label: '在製品 6 槽' },
    FG: { zone: 'FG', branch: 'LOGISTICS', x: 5, z: 16, dock: [2.8, 14.4], label: '成品 6 格' },
  },
  service: {
    T1: { zone: 'SERVICE', x: -17, z: 5 }, T2: { zone: 'SERVICE', x: -17, z: 8 },
    I1: { zone: 'SERVICE', x: -20, z: 5 }, I2: { zone: 'SERVICE', x: -20, z: 8 },
  },
  tools: [
    { id: 'GRIP-ROUGH-01', kind: 'ROUGH', slot: 'S-ROUGH-01' },
    { id: 'GRIP-ROUGH-02', kind: 'ROUGH', slot: 'S-ROUGH-02' },
    { id: 'GRIP-PROTECT-01', kind: 'PROTECT', slot: 'S-PROTECT-01' },
    { id: 'GRIP-PROTECT-02', kind: 'PROTECT', slot: 'S-PROTECT-02' },
  ],
  recipe: {
    id: 'PHONE-MOLD-6', version: '1.74-synthetic', title: '手機外殼模具工件', quantity: 6,
    route: [
      { id: 'ROUGH', machines: ['CNC-L01', 'CNC-R01'], seconds: [240, 480], labels: ['外形 / 平面', '型腔 / 大量減料'] },
      { id: 'GRIND', machines: ['GRIND-01'], seconds: [240], labels: ['平面研磨'] },
      { id: 'WIRE', machines: ['WIRE-01'], seconds: [480], labels: ['線割'] },
      { id: 'R02', machines: ['CNC-R02'], seconds: [360], labels: ['指定特徵加工'] },
      { id: 'EDM', machines: ['EDM-01'], seconds: [600], labels: ['放電'] },
      { id: 'L02', machines: ['CNC-L02'], seconds: [420], labels: ['最終指定精加工'] },
    ],
  },
});

export const secondsToTicks = (seconds, config = DEMO) => Math.ceil(seconds / config.quantumSeconds);
export const ticksToSeconds = (ticks, config = DEMO) => ticks * config.quantumSeconds;

export function stationZone(id, config = DEMO) {
  if (config.stations[id]) return config.stations[id].zone;
  if (config.stores[id]) return id;
  if (config.service[id]) return 'SERVICE';
  throw new Error(`Unknown location ${id}`);
}

export function branchFor(id, config = DEMO) {
  const zone = stationZone(id, config);
  return ['RAW', 'WIP', 'FG'].includes(zone) ? 'LOGISTICS' : zone;
}

export function pointFor(id, config = DEMO) {
  const item = config.stations[id] || config.stores[id] || config.service[id];
  if (!item) throw new Error(`Unknown point ${id}`);
  if (item.dock) return item.dock;
  return [item.x, item.z];
}
