// Reach and height refer to the gripper center. Three.js uses +X forward and +Y up.
import { gripOffset } from './cnc-front-transfer.js';

function smooth(value) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

const mix = (from, to, fraction) => from + (to - from) * fraction;
const carryPose = { reach: 1.78, height: 1.70, jaw: 0 };
const dockYaw = dock => dock === 'T1' ? Math.PI / 2 : -Math.PI / 2;

export function toolSeat(config, dock, kind) {
  const base = config.service[dock];
  const yaw = dockYaw(dock) + (kind === 'ROUGH' ? -.29 : .29);
  const radius = 2.10;
  const y = 1.26;
  return {
    x: base.x + radius * Math.cos(yaw), y, z: base.z - radius * Math.sin(yaw), yaw,
    reach: radius + gripOffset.forward - .52, height: y + gripOffset.height + .10,
  };
}

export function exchangePose(config, span, fraction) {
  const tool = span.action === '卸下舊爪' ? span.oldTool : span.tool;
  const kind = tool.includes('PROTECT') ? 'PROTECT' : 'ROUGH';
  const seat = toolSeat(config, span.station, kind);
  // Swivel toward the socket, extend to the handoff at 50%, then reverse the approach.
  const approach = span.action === '工具確認' ? 0 : Math.min(1, 2 * fraction, 2 * (1 - fraction));
  const swivel = smooth(approach / .32);
  const stroke = smooth((approach - .32) / .68);
  return {
    reach: mix(carryPose.reach, seat.reach, stroke),
    height: mix(carryPose.height, seat.height, stroke),
    yaw: mix(dockYaw(span.station), seat.yaw, swivel),
    jaw: 1,
  };
}

export function storeSlot(store, piece) {
  const index = Number(piece.slice(1)) - 1, row = Math.floor(index / 3);
  const x = store.x - 1.12 + (index % 3) * 1.12, z = store.z - .50 + row;
  const dx = x - store.dock[0], dz = z - store.dock[1];
  return { x, z, y: .83 + .45 * row, yaw: -Math.atan2(dz, dx), reach: Math.hypot(dx, dz) };
}

export function storeTransferPose(store, span, fraction) {
  const slot = storeSlot(store, span.piece);
  const pick = span.mode === 'pick', t = smooth(fraction);
  let { reach, height } = carryPose;
  let yaw = -Math.PI / 2, gripped = !pick, jaw = pick ? 1 : 0;
  switch (span.action) {
    case '伸向料槽':
      yaw = mix(yaw, slot.yaw, smooth(fraction / .2));
      reach = mix(reach, slot.reach, smooth((fraction - .2) / .55));
      height = mix(height, slot.y, smooth((fraction - .75) / .25));
      break;
    case '夾爪夾緊':
    case '放妥工件':
    case '夾爪張開':
      yaw = slot.yaw;
      reach = slot.reach;
      height = slot.y;
      jaw = pick ? 1 - t : span.action === '夾爪張開' ? t : 0;
      gripped = pick ? fraction >= 1 : span.action !== '夾爪張開';
      break;
    case '抽出工件':
      yaw = slot.yaw;
      reach = slot.reach;
      height = mix(slot.y, carryPose.height, t);
      gripped = true;
      jaw = 0;
      break;
    case '退出料槽':
      yaw = mix(slot.yaw, yaw, smooth((fraction - .74) / .26));
      height = pick ? carryPose.height : mix(slot.y, carryPose.height, smooth(fraction / .30));
      reach = mix(slot.reach, carryPose.reach, smooth((fraction - .30) / .44));
      gripped = pick;
      jaw = pick ? 0 : 1;
      break;
    case '原路倒退退出':
      gripped = pick;
      jaw = pick ? 0 : 1;
      break;
  }
  return { yaw, reach, height, jaw, gripped };
}

export function armPose(arm, carrying) {
  if (arm.frontPose) return { ...arm.frontPose, yaw: Math.PI / 2 };
  if (arm.workPose) return arm.workPose;
  return { ...carryPose, yaw: arm.railYaw, jaw: carrying ? 0 : 1 };
}

// Follow one scheduled workpiece through an exchange, loading and pickup by the same arm.
export function robotTrial(sim, armId) {
  for (const load of sim.tasks.filter(t => t.arm === armId && sim.config.stations[t.dest])) {
    const exchange = sim.spans.find(s => s.taskId === load.id && s.action === '卸下舊爪');
    if (!exchange) continue;
    const unload = sim.tasks.find(t => t.source === load.dest && t.piece === load.piece && t.accepted >= load.finished);
    if (unload?.arm !== armId) continue;
    const stop = sim.events.find(e => e.type === 'picked' && e.taskId === unload.id).tick;
    const work = sim.spans.filter(s => s.piece === load.piece && s.station === load.dest && s.category === 'process');
    return {
      armId, piece: load.piece, station: load.dest, load, unload, exchange, start: load.accepted,
      machining: work[0].start, done: work.at(-1).end, pickup: unload.firstAction, stop,
    };
  }
  return null;
}
