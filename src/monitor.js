import { DEMO } from './config.js';

export function monitorAreas(config = DEMO) {
  return [
    { id: 'CNC', label: 'CNC／品檢區', targets: Object.keys(config.stations).filter(id => config.stations[id].zone === 'CNC') },
    { id: 'GRIND', label: '研磨區', targets: Object.keys(config.stations).filter(id => config.stations[id].zone === 'GRIND') },
    { id: 'WIRE', label: '線割區', targets: Object.keys(config.stations).filter(id => config.stations[id].zone === 'WIRE') },
    { id: 'EDM', label: '放電區', targets: Object.keys(config.stations).filter(id => config.stations[id].zone === 'EDM') },
    { id: 'LOGISTICS', label: '料倉區', targets: Object.keys(config.stores) },
    { id: 'SERVICE', label: '雙臂 / 換爪區', targets: Object.keys(config.service) },
  ];
}

export function monitorTarget(id, config = DEMO) {
  const machine = config.stations[id];
  if (machine) return { id, label: `${id} · ${machine.label}`, point: [machine.x, 1.38, machine.z] };
  const store = config.stores[id];
  if (store) return { id, label: `${id} · ${store.label}`, point: [store.x, .84, store.z] };
  const service = config.service[id];
  if (service) return { id, label: `${id} · ${id.startsWith('T') ? '換爪位' : '待機位'}`, point: [service.x, 1.3, service.z] };
  throw new Error(`Unknown monitor target ${id}`);
}

export function monitorInteriorPose(id, modelScale = 1, config = DEMO) {
  if (!config.stations[id]) throw new Error(`No machine interior for ${id}`);
  const { x, z } = config.stations[id];
  // The working parts sit toward the front of the enclosure. Keep the whole bay in frame.
  const target = [x, 1.55, z + .72].map(value => value * modelScale);
  const dx = 1.3 * modelScale, dz = 3.1 * modelScale;
  return { target, position: [target[0] + dx, target[1] + Math.hypot(dx, dz), target[2] + dz], fov: 34 };
}

export function monitorAreaPose(areaId, modelScale = 1, config = DEMO) {
  const area = monitorAreas(config).find(item => item.id === areaId);
  if (!area) throw new Error(`Unknown monitor area ${areaId}`);
  const points = area.targets.map(id => monitorTarget(id, config).point);
  const xs = points.map(point => point[0]), zs = points.map(point => point[2]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const target = [(minX + maxX) / 2, areaId === 'LOGISTICS' ? .9 : 1.4, (minZ + maxZ) / 2]
    .map(value => value * modelScale);
  // Face the front (+Z) of each work area at 45° elevation.
  const side = Math.max(4.5, (Math.max(maxX - minX, maxZ - minZ) + 5) * .85) * modelScale;
  return { target, position: [target[0], target[1] + side, target[2] + side], fov: 45 };
}
