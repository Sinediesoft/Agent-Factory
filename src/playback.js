import { DEMO, pointFor } from './config.js';

import { frontStation, frontTransferPose, railSample } from './cnc-front-transfer.js';

export function stateAt(sim, tick) {
  const config = sim.config || DEMO;
  const quantity = sim.options.quantity ?? config.recipe.quantity;
  const piece = Object.fromEntries(Array.from({ length: quantity }, (_, i) => {
    const id = `P${String(i + 1).padStart(2, '0')}`;
    return [id, { id, stage: 0, location: 'RAW', carriedBy: null, done: false }];
  }));
  const machines = Object.fromEntries(Object.keys(config.stations).map(id => [id, { status: 'idle', faulted: false, piece: null, doorOpen: false }]));
  const arms = Object.fromEntries(['R1', 'R2'].map(id => [id, { id, location: config.armStart[id], tool: null,
    position: pointFor(config.armStart[id], config), task: null, status: 'idle' }]));
  const stock = { RAW: quantity, WIP: 0, FG: 0 };
  const recent = [];
  for (const event of sim.events) {
    if (event.tick > tick) break;
    recent.push(event);
    if (event.type === 'accepted') { arms[event.arm].task = event.taskId; arms[event.arm].status = 'accepted'; }
    else if (event.type === 'execution_started') arms[event.arm].status = 'executing';
    else if (event.type === 'tool_changed') arms[event.arm].tool = event.tool;
    else if (event.type === 'picked') {
      const p = piece[event.piece];
      p.location = null; p.carriedBy = event.arm;
      if (machines[event.source]) { machines[event.source].piece = null; machines[event.source].status = 'idle'; }
      else stock[event.source]--;
    } else if (event.type === 'placed') {
      const p = piece[event.piece];
      p.location = event.dest; p.carriedBy = null; p.done = Boolean(event.done);
      if (machines[event.dest]) machines[event.dest].piece = p.id;
      else stock[event.dest]++;
    } else if (event.type === 'process_started') {
      machines[event.machine].status = 'processing'; machines[event.machine].piece = event.piece;
    } else if (event.type === 'process_completed') {
      piece[event.piece].stage = event.stage;
      machines[event.machine].status = 'ready';
    } else if (event.type === 'machine_faulted' && machines[event.machine]) {
      machines[event.machine].faulted = true;
    } else if (event.type === 'machine_recovered' && machines[event.machine]) {
      machines[event.machine].faulted = false;
    } else if (event.type === 'task_completed') { arms[event.arm].task = null; arms[event.arm].status = 'idle'; }
  }
  for (const span of sim.spans) {
    if (span.start > tick) break;
    if (span.station && machines[span.station] && span.category === 'action') {
      if (span.label.includes('開門') || span.label.includes('開護罩')) machines[span.station].doorOpen = true;
      if (span.end <= tick && (span.label.includes('關門') || span.label.includes('關護罩'))) machines[span.station].doorOpen = false;
    }
    if (!span.arm) continue;
    const arm = arms[span.arm];
    if (span.from && span.to) {
      const fraction = Math.min(1,(tick-span.start)/(span.end-span.start));
      if (span.path) {
        const sample = railSample(span.path,fraction);
        arm.position = sample.point;
        const onFrontRail = span.frontRail === 'enter' || (span.frontRail === 'exit' && tick < span.end);
        arm.frontRailYaw = onFrontRail ? sample.yaw + (span.frontRail === 'exit' ? Math.PI : 0) : null;
      } else {
        arm.frontRailYaw = null;
        arm.position = [span.from[0]+(span.to[0]-span.from[0])*fraction,
                        span.from[1]+(span.to[1]-span.from[1])*fraction];
      }
    }
    if (span.start <= tick && tick < span.end) {
      arm.status = span.category;
      arm.activeLabel = span.label;
      arm.activeStation = span.station || null;
      if (span.station === frontStation && span.category === 'action') {
        const action = span.action ?? span.label.split(' · ').at(-1);
        const pose = frontTransferPose(config.stations[frontStation],action,span.mode,(tick-span.start)/(span.end-span.start));
        arm.frontPose = pose;
        arm.frontRailYaw = Math.PI/2;
        machines[frontStation].doorFraction = pose.door;
        // The gripper hands off at the fixture; task confirmation follows once the carriage can leave.
        piece[span.piece].location = pose.onFixture ? frontStation : null;
        piece[span.piece].carriedBy = pose.onFixture ? null : span.arm;
      }
    }
  }
  for (const machine of Object.values(machines)) if (machine.faulted) machine.status = 'fault';
  return { tick, pieces: piece, machines, arms, stock, recent: recent.slice(-12) };
}

export class PlaybackClock {
  constructor(durationTicks) { this.durationTicks = durationTicks; this.tick = 0; this.playing = false; this.rate = 120; this.lastReal = null; }
  play() { this.playing = true; this.lastReal = null; }
  pause() { this.playing = false; this.lastReal = null; }
  seek(tick) { this.tick = Math.max(0, Math.min(this.durationTicks, Math.round(tick))); this.lastReal = null; }
  advance(realNow, quantumSeconds = 0.1) {
    if (!this.playing) return this.tick;
    if (this.lastReal !== null) this.seek(this.tick + (realNow - this.lastReal) / 1000 * this.rate / quantumSeconds);
    this.lastReal = realNow;
    if (this.tick >= this.durationTicks) this.pause();
    return this.tick;
  }
}
