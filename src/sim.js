import { DEMO, secondsToTicks, ticksToSeconds, branchFor } from './config.js';

import { makeTrackLayout, stationRailPath, logisticsPath } from './track-layout.js';

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const isMachine = (id, c) => Boolean(c.stations[id]);
const toolKind = stage => stage >= 2 ? 'PROTECT' : 'ROUGH';
export class ResourceCalendar {
  constructor() { this.intervals = new Map(); }
  clone() {
    const copy = new ResourceCalendar();
    copy.intervals = new Map([...this.intervals].map(([key, rows]) => [key, rows.map(row => ({ ...row }))]));
    return copy;
  }
  overlaps(resource, start, end) {
    return (this.intervals.get(resource) || []).find(x => start < x.end && x.start < end);
  }
  earliest(resources, start, duration) {
    let tick = start;
    for (let n = 0; n < 100000; n++) {
      let next = tick;
      for (const resource of resources) {
        const hit = this.overlaps(resource, tick, tick + duration);
        if (hit) next = Math.max(next, hit.end);
      }
      if (next === tick) return tick;
      tick = next;
    }
    throw new Error('Resource calendar did not converge');
  }
  book(resources, start, end, owner) {
    if (end <= start) throw new Error('Empty reservation');
    for (const resource of resources) {
      if (this.overlaps(resource, start, end)) throw new Error(`Double booking ${resource}`);
    }
    for (const resource of resources) {
      const rows = this.intervals.get(resource) || [];
      rows.push({ start, end, owner });
      rows.sort((a, b) => a.start - b.start);
      this.intervals.set(resource, rows);
    }
  }
  // Plans the complete route before any segment is entered. No waiting in a segment boundary.
  bookRoute(phases, ready, owner) {
    let start = ready;
    for (let n = 0; n < 100000; n++) {
      let cursor = start;
      let pushed = start;
      for (const phase of phases) {
        for (const resource of phase.resources) {
          const hit = this.overlaps(resource, cursor, cursor + phase.ticks);
          if (hit) pushed = Math.max(pushed, hit.end - (cursor - start));
        }
        cursor += phase.ticks;
      }
      if (pushed === start) {
        cursor = start;
        for (const phase of phases) {
          this.book(phase.resources, cursor, cursor + phase.ticks, owner);
          cursor += phase.ticks;
        }
        return start;
      }
      start = pushed;
    }
    throw new Error('Route calendar did not converge');
  }
}

export function routePhases(from, to, config = DEMO, layout = makeTrackLayout(config)) {
  if (from === to) return [];
  const a = branchFor(from, config), b = branchFor(to, config);
  const speed = config.travelSpeedMps;
  const travel = (label, fromPoint, toPoint, resources, extraSeconds = 0, category = 'travel') => ({
    label, from: fromPoint, to: toPoint, resources, category,
    ticks: secondsToTicks(distance(fromPoint, toPoint) / speed + extraSeconds, config),
  });
  const junction = zone => layout.branches.find(branch => branch.id === zone).paths[0].at(-1);
  function dockTravel(start, end, zone) {
    const path = zone==='LOGISTICS' ? logisticsPath(layout,start,end) : stationRailPath(layout,start,end,zone);
    const length = path.slice(1).reduce((sum,p,i) => sum + distance(path[i],p), 0);
    const ring = layout.rings.find(r => r.id === zone);
    const onRing = p => ring && Math.abs(distance(p,ring.center)-ring.radiusM)<1e-6;
    const occupied = new Set();
    for (let i=1; i<path.length; i++) {
      const a=path[i-1], b=path[i];
      if (!onRing(a) || !onRing(b)) continue;
      const angle=Math.atan2((a[1]+b[1])/2-ring.center[1], (a[0]+b[0])/2-ring.center[0]);
      const quadrant=Math.floor(((angle+2*Math.PI)%(2*Math.PI))/(Math.PI/2));
      occupied.add(`ring:${zone}:${quadrant}`);
    }
    // Only one carriage can pass through the common turnout and feeder at a time.
    const resources = [...occupied, `feeder:${zone}`];
    for (const id of [start,end]) if (id !== zone) resources.push(`dock:${id}`);
    return {label: `${start} → ${end} 軌道移動`, category:'travel', resources,
      path, from:path[0], to:path.at(-1), ticks:secondsToTicks(length/speed,config),
      departingDock:start!==zone, frontFrom:config.stations[start] ? start : null, frontTo:config.stations[end] ? end : null};
  }
  if (a === b) return [dockTravel(from,to,a)];
  const phases = [];
  const turn = config.turntable;
  phases.push(dockTravel(from,a,a));
  phases.push(travel(`${a} 支軌出區`, junction(a), config.branchPoints[a], [`branch:${a}`,`turntable:${a}`,`feeder:${a}`], turn.enterS + turn.settleS, 'branch'));
  phases.push({ label: `${a} 轉盤定位與清空`, from: config.branchPoints[a], to: config.branchPoints[a],
    resources: [`branch:${a}`, `turntable:${a}`, `feeder:${a}`], category: 'turntable',
    ticks: secondsToTicks(turn.rotateS + turn.confirmS + turn.clearS, config) });
  const order = config.branchOrder;
  let i = order.indexOf(a), goal = order.indexOf(b);
  if (i < 0 || goal < 0) throw new Error('Unknown branch');
  while (i !== goal) {
    const j = (i + 1) % order.length;
    phases.push(travel(`主環 ${order[i]} → ${order[j]}`, config.branchPoints[order[i]],
      config.branchPoints[order[j]], [`main:${i}`,`turntable:${order[i]}`,`turntable:${order[j]}`]));
    i = j;
  }
  phases.push({ label: `${b} 轉盤進區定位`, from: config.branchPoints[b], to: config.branchPoints[b],
    resources: [`branch:${b}`, `turntable:${b}`, `feeder:${b}`], category: 'turntable',
    ticks: secondsToTicks(turn.enterS + turn.settleS + turn.rotateS + turn.confirmS, config) });
  phases.push(travel(`${b} 支軌進區並清空`, config.branchPoints[b], junction(b),
    [`branch:${b}`,`turntable:${b}`,`feeder:${b}`], turn.clearS, 'branch'));
  phases.push(dockTravel(b,to,b));
  const heading = leg => -Math.atan2(leg.to[1]-leg.from[1],leg.to[0]-leg.from[0]);
  for(const [index,leg] of phases.entries()) if(leg.category==='turntable') {
    leg.yawStart=heading(phases[index-1]);
    const delta=heading(phases[index+1])-leg.yawStart;
    leg.yawTravel=Math.atan2(Math.sin(delta),Math.cos(delta));
  }
  return phases;
}

function actionsFor(id, mode, config) {
  const c = config.cnc, o = config.other, s = config.storage;
  if (!isMachine(id, config)) return mode === 'pick'
    ? [['伸向料槽', s.reachS], ['夾爪夾緊', s.gripS], ['抽出工件', s.extractS], ['退出料槽', s.retreatS]]
    : [['伸向料槽', s.reachS], ['放妥工件', s.placeS], ['夾爪張開', s.releaseS], ['退出料槽', s.retreatS]];
  if (config.stations[id].type !== 'CNC') return mode === 'pick'
    ? [['開護罩', o.guardOpenS], ['鬆開治具', o.fixtureS], ['手臂伸入', o.reachS], ['夾爪夾緊', o.gripS], ['抽出工件', o.extractS], ['手臂退出', o.retreatS], ['關護罩', o.guardCloseS]]
    : [['開護罩', o.guardOpenS], ['手臂伸入', o.reachS], ['放妥工件', o.placeS], ['夾爪張開', o.releaseS], ['手臂退出', o.retreatS], ['夾緊治具', o.fixtureS], ['關護罩', o.guardCloseS]];
  return mode === 'pick'
    ? [['開門', c.doorOpenS], ['治具鬆開', c.fixtureReleaseS], ['手臂伸入', c.reachInS], ['夾爪夾緊', c.gripCloseS], ['抽出工件', c.extractS], ['手臂退出', c.retreatS], ['關門', c.doorCloseS]]
    : [['開門', c.doorOpenS], ['手臂伸入', c.reachInS], ['精定位', c.alignS], ['放置工件', c.placeS], ['夾爪張開', c.gripOpenS], ['手臂退出', c.retreatS], ['治具夾緊', c.fixtureClampS], ['關門', c.doorCloseS]];
}

export function buildSimulation(config = DEMO, options = {}) {
  const quantity = options.quantity ?? config.recipe.quantity;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > config.stockCapacity.RAW) throw new Error('工單件數超出 RAW 示範容量');
  const layout = makeTrackLayout(config);
  const calendar = new ResourceCalendar();
  const spans = [], events = [], tasks = [], agenda = [];
  const pieces = Array.from({ length: quantity }, (_, i) => ({ id: `P${String(i + 1).padStart(2, '0')}`, stage: 0, location: 'RAW', reserved: false, done: false }));
  const machines = Object.fromEntries(Object.keys(config.stations).map(id => [id, { id, piece: null, reserved: false, status: 'idle' }]));
  const stock = { RAW: quantity, WIP: 0, FG: 0 };
  const stockReserved = { RAW: 0, WIP: 0, FG: 0 };
  const arms = Object.fromEntries(['R1', 'R2'].map(id => [id, { id, location: config.armStart[id], tool: null, busy: false }]));
  const tools = config.tools.map(t => ({ ...t, heldBy: null, reservedBy: null }));
  let nextTask = 1, clock = 0, lastTick = 0, dispatches = 0;
  const addEvent = (tick, type, data = {}) => { events.push({ tick, type, ...data }); lastTick = Math.max(lastTick, tick); };
  const addSpan = (span) => { spans.push(span); lastTick = Math.max(lastTick, span.end); };
  const addAgenda = (tick, type, data) => { agenda.push({ tick, type, ...data }); agenda.sort((x, y) => x.tick - y.tick || (x.type === 'task_finish' ? -1 : 1)); };
  const addWait = (start, end, arm, taskId, reason, piece) => {
    if (end > start) addSpan({ start, end, category: 'wait', label: reason, arm, taskId, piece, resources: [] });
  };
  const actionTotalTicks = (id, mode) => actionsFor(id, mode, config)
    .reduce((sum, [, seconds]) => sum + secondsToTicks(seconds, config),
      secondsToTicks(config.dock.approachS + config.dock.reverseS, config));
  function scheduleRoute(arm, task, from, to, ready) {
    const phases = routePhases(from, to, config, layout);
    if (!phases.length) return ready;
    const routeStart = calendar.bookRoute(phases, ready, task.id);
    addWait(ready, routeStart, arm.id, task.id, '通道 / 轉盤資源等待', task.piece);
    let cursor = routeStart;
    for (const phase of phases) {
      addSpan({ ...phase, start: cursor, end: cursor + phase.ticks, arm: arm.id, taskId: task.id, piece: task.piece });
      cursor += phase.ticks;
    }
    return cursor;
  }
  function scheduleActions(id, mode, arm, task, ready) {
    const actions = actionsFor(id, mode, config);
    const total = actionTotalTicks(id, mode);
    const resources = [`dock:${id}`, `sweep:${id}`];
    const start = calendar.earliest(resources, ready, total);
    calendar.book(resources, start, start + total, task.id);
    addWait(ready, start, arm.id, task.id, `${id} 停靠位等待`, task.piece);
    let cursor = start;
    const all = [['前進入停靠位', config.dock.approachS], ...actions, ['原路倒退退出', config.dock.reverseS]];
    for (const [label, seconds] of all) {
      const end = cursor + secondsToTicks(seconds, config);
      addSpan({ start: cursor, end, category: 'action', label: `${id} · ${label}`, arm: arm.id,
        taskId: task.id, piece: task.piece, station: id, action: label, mode, resources });
      cursor = end;
    }
    return { start, end: cursor };
  }
  const availableTool = (dock,kind) => tools.find(t=>t.kind===kind && (!t.dock || t.dock===dock) && !t.heldBy && !t.reservedBy);
  function scheduleTool(arm, task, needed, ready) {
    if (arm.tool?.kind === needed) return ready;
    const dock = arm.id === 'R1' ? 'T1' : 'T2';
    const tool = availableTool(dock,needed);
    if (!tool) throw new Error(`No free ${needed} gripper`);
    const old = arm.tool;
    let cursor = scheduleRoute(arm, task, arm.location, dock, ready);
    const steps = old ? [['卸下舊爪', config.tool.removeS], ['裝上新爪', config.tool.installS], ['工具確認', config.tool.verifyS]]
      : [['首次裝爪', config.tool.installS], ['工具確認', config.tool.verifyS]];
    const total = steps.reduce((sum, [, seconds]) => sum + secondsToTicks(seconds, config), 0);
    const resources = [`dock:${dock}`, `tool:${tool.id}`, `slot:${tool.slot}`];
    if (old) resources.push(`tool:${old.id}`, `slot:${old.slot}`);
    const start = calendar.earliest(resources, cursor, total);
    calendar.book(resources, start, start + total, task.id);
    addWait(cursor, start, arm.id, task.id, '換爪位 / 工具等待', task.piece);
    cursor = start;
    for (const [label, seconds] of steps) {
      const end = cursor + secondsToTicks(seconds, config);
      addSpan({ start: cursor, end, category: 'tool', label: `${dock} · ${label}`, arm: arm.id,
        taskId: task.id, piece: task.piece, station:dock, action:label, tool: tool.id, oldTool: old?.id ?? null, resources });
      cursor = end;
    }
    addEvent(cursor, 'tool_changed', { arm: arm.id, tool: tool.id, oldTool: old?.id ?? null, taskId: task.id });
    if (old) old.heldBy = null;
    tool.reservedBy = arm.id;
    tool.heldBy = arm.id;
    tool.reservedBy = null;
    arm.tool = tool;
    arm.location = dock;
    return cursor;
  }
  function targetFor(piece) {
    if (piece.stage >= config.recipe.route.length) return stock.FG + stockReserved.FG < config.stockCapacity.FG ? 'FG' : null;
    const step = config.recipe.route[piece.stage];
    const available = step.machines.filter(id => !machines[id].piece && !machines[id].reserved);
    return available[0] ?? null;
  }
  function candidates() {
    const result = [];
    for (const piece of pieces) {
      if (piece.done || piece.reserved) continue;
      if (isMachine(piece.location, config) && machines[piece.location].status !== 'ready') continue;
      const dest = targetFor(piece);
      if (dest && dest !== piece.location) result.push({ piece, dest, buffered: false });
      else if (isMachine(piece.location, config) && stock.WIP + stockReserved.WIP < config.stockCapacity.WIP)
        result.push({ piece, dest: 'WIP', buffered: true });
    }
    result.sort((a, b) => b.piece.stage - a.piece.stage || Number(a.buffered) - Number(b.buffered)
      || (a.piece.location === 'WIP' ? -1 : 0) - (b.piece.location === 'WIP' ? -1 : 0)
      || a.piece.id.localeCompare(b.piece.id));
    return result;
  }
  function armEstimate(arm, candidate) {
    const need = toolKind(candidate.piece.stage);
    const trial = calendar.clone();
    let cursor = clock, location = arm.location;
    const trialRoute = (from, to) => {
      const phases = routePhases(from, to, config, layout);
      if (!phases.length) return;
      const start = trial.bookRoute(phases, cursor, `trial:${arm.id}`);
      cursor = start + phases.reduce((sum, phase) => sum + phase.ticks, 0);
    };
    if (arm.tool?.kind !== need) {
      const dock = arm.id === 'R1' ? 'T1' : 'T2';
      trialRoute(location, dock);
      const tool = availableTool(dock,need);
      if (!tool) return { arm, tick: Infinity, changes: 1 };
      const duration = secondsToTicks((arm.tool ? config.tool.removeS : 0) + config.tool.installS + config.tool.verifyS, config);
      const resources = [`dock:${dock}`, `tool:${tool.id}`, `slot:${tool.slot}`];
      if (arm.tool) resources.push(`tool:${arm.tool.id}`, `slot:${arm.tool.slot}`);
      cursor = trial.earliest(resources, cursor, duration);
      trial.book(resources, cursor, cursor + duration, `trial:${arm.id}`);
      cursor += duration;
      location = dock;
    }
    trialRoute(location, candidate.piece.location);
    const resources = [`dock:${candidate.piece.location}`, `sweep:${candidate.piece.location}`];
    const firstActionTick = trial.earliest(resources, cursor, actionTotalTicks(candidate.piece.location, 'pick'));
    return { arm, tick: firstActionTick, changes: arm.tool?.kind === need ? 0 : 1 };
  }
  function scheduleTask(arm, candidate, now) {
    const { piece, dest, buffered } = candidate;
    const source = piece.location;
    const task = { id: `MOVE-${String(nextTask++).padStart(3, '0')}`, arm: arm.id, piece: piece.id,
      source, dest, stage: piece.stage, neededTool: toolKind(piece.stage), accepted: now, buffered };
    piece.reserved = true;
    arm.busy = true;
    if (isMachine(dest, config)) machines[dest].reserved = true;
    else stockReserved[dest]++;
    addEvent(now, 'accepted', { taskId: task.id, arm: arm.id, piece: piece.id, source, dest });
    let cursor = scheduleTool(arm, task, task.neededTool, now);
    cursor = scheduleRoute(arm, task, arm.location, source, cursor);
    const pick = scheduleActions(source, 'pick', arm, task, cursor);
    task.firstAction = pick.start;
    cursor = pick.end;
    addEvent(cursor, 'picked', { taskId: task.id, arm: arm.id, piece: piece.id, source });
    cursor = scheduleRoute(arm, task, source, dest, cursor);
    cursor = scheduleActions(dest, 'place', arm, task, cursor).end;
    task.finished = cursor;
    tasks.push(task);
    const firstSpan = spans.filter(s => s.taskId === task.id && s.category !== 'wait').reduce((min, s) => Math.min(min, s.start), Infinity);
    addEvent(firstSpan, 'execution_started', { taskId: task.id, arm: arm.id, piece: piece.id });
    addAgenda(cursor, 'task_finish', { task, arm, piece });
    // Clear shared storage docks before another carriage can be booked there.
    // The return route is reserved with the transfer, before later tasks plan
    // an arrival at the same WIP or FG dock.
    if (dest==='FG' || dest==='WIP') {
      const park=config.armStart[arm.id];
      const parked=scheduleRoute(arm,task,dest,park,cursor);
      addAgenda(parked,'park_finish',{arm,park});
    }
    return task;
  }
  function dispatch(now) {
    for (let n = 0; n < 2; n++) {
      const idle = Object.values(arms).filter(a => !a.busy);
      const list = candidates();
      if (!idle.length || !list.length) break;
      let chosen = null;
      for (const candidate of list) {
        const estimates = idle.map(a => armEstimate(a, candidate))
          .sort((x, y) => x.tick - y.tick || x.changes - y.changes || x.arm.id.localeCompare(y.arm.id));
        if (estimates.length && Number.isFinite(estimates[0].tick)) { chosen = { candidate, arm: estimates[0].arm }; break; }
      }
      if (!chosen) break;
      scheduleTask(chosen.arm, chosen.candidate, now);
      dispatches++;
    }
  }
  dispatch(0);
  let iterations = 0;
  while (agenda.length) {
    if (++iterations > 10000) throw new Error('Simulation exceeded event limit');
    const next = agenda.shift();
    clock = next.tick;
    if (next.type === 'process_finish') {
      const { machine, piece, step } = next;
      if (machine.piece !== piece || machine.status !== 'processing') throw new Error('Stale process event');
      machine.status = 'ready';
      piece.stage++;
      addEvent(clock, 'process_completed', { piece: piece.id, machine: machine.id, step: step.id, stage: piece.stage });
    } else if (next.type==='park_finish') {
      next.arm.location=next.park; next.arm.busy=false;
    } else if (next.type === 'task_finish') {
      const { task, arm, piece } = next;
      if (piece.location !== task.source || !piece.reserved) throw new Error('Stale transfer event');
      if (isMachine(task.source, config)) {
        const machine = machines[task.source];
        if (machine.piece !== piece || machine.status !== 'ready') throw new Error('Source machine not ready');
        machine.piece = null; machine.status = 'idle';
      } else stock[task.source]--;
      if (isMachine(task.dest, config)) {
        const machine = machines[task.dest];
        if (machine.piece || !machine.reserved) throw new Error('Destination machine unavailable');
        machine.reserved = false; machine.piece = piece; machine.status = 'processing';
        const step = config.recipe.route[piece.stage];
        let cursor = clock;
        for (let i = 0; i < step.seconds.length; i++) {
          const end = cursor + secondsToTicks(step.seconds[i], config);
          addSpan({ start: cursor, end, category: 'process', label: `${machine.id} · ${step.labels[i]}`,
            station: machine.id, piece: piece.id, step: step.id, resources: [`machine:${machine.id}`] });
          cursor = end;
        }
        addAgenda(cursor, 'process_finish', { machine, piece, step });
        addEvent(clock, 'process_started', { piece: piece.id, machine: machine.id, step: step.id });
      } else {
        stockReserved[task.dest]--;
        stock[task.dest]++;
        if (task.dest === 'FG') piece.done = true;
      }
      piece.location = task.dest; piece.reserved = false;
      arm.busy = task.dest==='FG' || task.dest==='WIP'; arm.location = task.dest;
      addEvent(clock, 'placed', { taskId: task.id, arm: arm.id, piece: piece.id, dest: task.dest, done: piece.done });
      addEvent(clock, 'task_completed', { taskId: task.id, arm: arm.id, piece: piece.id });
    }
    dispatch(clock);
  }
  events.sort((a, b) => a.tick - b.tick || a.type.localeCompare(b.type));
  spans.sort((a, b) => a.start - b.start || a.end - b.end);
  const completions = events.filter(e => e.type === 'process_completed');
  const parkYaw=Object.fromEntries(Object.entries(config.armStart).map(([id,park])=>{
    const path=layout.docks.find(d=>d.id===park).path, a=path.at(-2),b=path.at(-1);
    return [id,-Math.atan2(b[1]-a[1],b[0]-a[0])];
  }));
  const completedAtMinutes=ticksToSeconds(events.filter(e=>e.type==='placed' && e.done).at(-1)?.tick ?? lastTick,config)/60;
  const result = { config, options, parkYaw, pieces, machines, arms, tools, stock, tasks, spans, events,
    reservations: Object.fromEntries(calendar.intervals), durationTicks: lastTick,
    stats: { piecesDone: pieces.filter(p => p.done).length, processCompletions: completions.length,
      netProcessMinutes: completions.reduce((sum, e) => sum + config.recipe.route.find(s => s.id === e.step).seconds.reduce((a, b) => a + b, 0) / 60, 0),
      dispatches, waits: spans.filter(s => s.category === 'wait').length,
      completedAtMinutes,
      lateByMinutes: options.dueMinutes == null ? null : Math.max(0, completedAtMinutes - options.dueMinutes) } };
  return result;
}

export function validateSimulation(result) {
  const errors = [];
  const { config, pieces, stock, events, tasks, reservations } = result;
  const quantity = result.options.quantity ?? config.recipe.quantity;
  if (pieces.length !== quantity) errors.push('Unexpected quantity');
  if (pieces.some(p => !p.done || p.stage !== config.recipe.route.length || p.location !== 'FG')) errors.push('Unfinished workpieces');
  if (stock.RAW !== 0 || stock.WIP !== 0 || stock.FG !== quantity) errors.push('Incorrect final stock');
  for (const piece of pieces) {
    const sequence = events.filter(e => e.type === 'process_completed' && e.piece === piece.id).map(e => e.step);
    if (sequence.join(',') !== config.recipe.route.map(step => step.id).join(',')) errors.push(`${piece.id}: invalid route`);
  }
  if (events.filter(e => e.type === 'process_completed').length !== quantity * config.recipe.route.length) errors.push('Incorrect process completion count');
  if (events.filter(e => e.type === 'placed' && e.dest === 'FG').length !== quantity) errors.push('Incorrect FG confirmation count');
  for (const [resource, rows] of Object.entries(reservations)) {
    for (let i = 1; i < rows.length; i++) if (rows[i].start < rows[i - 1].end) errors.push(`Overlap on ${resource}`);
  }
  for (const id of Object.keys(config.stations)) {
    const rows = result.spans.filter(s => s.category === 'process' && s.station === id).sort((a, b) => a.start - b.start);
    for (let i = 1; i < rows.length; i++) if (rows[i].start < rows[i - 1].end) errors.push(`Overlapping process on ${id}`);
  }
  const occupancy = { RAW: quantity, WIP: 0, FG: 0 };
  for (const event of events) {
    if (event.type === 'picked' && Object.hasOwn(occupancy, event.source)) occupancy[event.source]--;
    if (event.type === 'placed' && Object.hasOwn(occupancy, event.dest)) occupancy[event.dest]++;
    for (const key of Object.keys(occupancy)) if (occupancy[key] < 0 || occupancy[key] > config.stockCapacity[key]) errors.push(`${key} capacity violated at ${event.tick}`);
  }
  if (new Set(result.tools.map(t => t.id)).size !== result.tools.length || new Set(result.tools.map(t => t.slot)).size !== result.tools.length) errors.push('Tool or slot IDs are not unique');
  for (const task of tasks) if (task.neededTool !== toolKind(task.stage)) errors.push(`${task.id}: wrong gripper`);
  return errors;
}
