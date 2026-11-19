import { DEMO, pointFor } from './config.js';

const hubs = {
  CNC: [-14, -10], GRIND: [0, -13], WIRE: [14, -7], EDM: [14, 7],
  RAW: [-5, 16], WIP: [0, 17], FG: [5, 16], SERVICE: [-15, 7],
};
const near = (center, target, radius) => {
  const dx = target[0] - center[0], dz = target[1] - center[1];
  const length = Math.hypot(dx, dz) || 1;
  return [center[0] + dx / length * radius, center[1] + dz / length * radius];
};
const circle = (center, radius, sides = 48) => Array.from({ length: sides + 1 }, (_, i) => {
  const a = Math.PI * 2 * i / sides;
  return [center[0] + radius * Math.cos(a), center[1] + radius * Math.sin(a)];
});

export function makeTrackLayout(config = DEMO) {
  const radius = config.sharedArcRadiusM;
  const ring = Object.fromEntries(Object.entries(hubs).map(([zone, center]) => [zone, {
    id: zone, center, radiusM: radius, path: circle(center, radius),
  }]));
  const mainPath = config.branchOrder.map(id => config.branchPoints[id]);
  mainPath.push(mainPath[0]);
  const branches = [];
  for (const zone of ['CNC', 'GRIND', 'WIRE', 'EDM']) {
    const start = config.branchPoints[zone];
    branches.push({ id: zone, paths: [[start, near(hubs[zone], start, radius)]] });
  }
  const logisticsNode = config.branchPoints.LOGISTICS;
  const trunk = [0, 13];
  branches.push({ id: 'LOGISTICS', paths: [
    [logisticsNode, trunk],
    ...['RAW', 'WIP', 'FG'].map(zone => [trunk, near(hubs[zone], trunk, radius)]),
  ] });
  branches.push({ id: 'SERVICE', paths: [[config.branchPoints.SERVICE,
    near(hubs.SERVICE, config.branchPoints.SERVICE, radius)]] });
  const docks = [];
  for (const [id, machine] of Object.entries(config.stations)) {
    const dock = pointFor(id, config);
    docks.push({ id, zone: machine.zone, path: [near(hubs[machine.zone], dock, radius), dock] });
  }
  for (const id of ['RAW', 'WIP', 'FG']) {
    const dock = pointFor(id, config);
    docks.push({ id, zone: id, path: [near(hubs[id], dock, radius), dock] });
  }
  for (const id of ['T1', 'T2', 'I1', 'I2']) {
    const dock = pointFor(id, config);
    docks.push({ id, zone: 'SERVICE', path: [near(hubs.SERVICE, dock, radius), dock] });
  }
  return {
    kind: 'synthetic_demo_track', version: config.version, railHeightM: config.railHeightM,
    gaugeM: 0.58, sleeperSpacingM: 0.9, sharedArcRadiusM: radius,
    turntableRadiusM: config.turntable.radiusM,
    main: { id: 'MAIN', path: mainPath },
    rings: Object.values(ring), branches, docks,
  };
}

export function validateTrackLayout(layout, config = DEMO) {
  const errors = [];
  const close = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6;
  const onRing = (point, zone) => Math.abs(Math.hypot(point[0] - hubs[zone][0], point[1] - hubs[zone][1]) - layout.sharedArcRadiusM) < 1e-6;
  if (layout.rings.length !== 8) errors.push('Expected 8 area rings');
  if (layout.branches.length !== 6) errors.push('Expected 6 branch groups');
  if (layout.docks.length !== 14) errors.push('Expected 14 docking spurs');
  if (layout.gaugeM <= 0 || layout.sleeperSpacingM <= 0) errors.push('Rail gauge or sleeper spacing invalid');
  if (!close(layout.main.path[0], layout.main.path.at(-1))) errors.push('Main ring is open');
  for (const ring of layout.rings) {
    if (!close(ring.path[0], ring.path.at(-1))) errors.push(`${ring.id} ring is open`);
    if (ring.radiusM !== layout.sharedArcRadiusM) errors.push(`${ring.id} radius differs`);
  }
  for (const branch of layout.branches) {
    if (!close(branch.paths[0][0], config.branchPoints[branch.id])) errors.push(`${branch.id} branch disconnected`);
    if (branch.id === 'LOGISTICS') {
      for (const [index, zone] of ['RAW', 'WIP', 'FG'].entries()) {
        if (!close(branch.paths[index + 1][0], branch.paths[0].at(-1)) || !onRing(branch.paths[index + 1].at(-1), zone)) errors.push(`${zone} logistics fork disconnected`);
      }
    } else if (!onRing(branch.paths[0].at(-1), branch.id)) errors.push(`${branch.id} branch misses ring`);
  }
  for (const dock of layout.docks) {
    if (!onRing(dock.path[0], dock.zone)) errors.push(`${dock.id} dock misses ring`);
    if (!close(dock.path.at(-1), pointFor(dock.id, config))) errors.push(`${dock.id} dock disconnected`);
  }
  if (layout.railHeightM !== config.railHeightM) errors.push('Rail height differs');
  return errors;
}
