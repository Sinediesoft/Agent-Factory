import test from 'node:test';
import assert from 'node:assert/strict';
import { DEMO, secondsToTicks, pointFor } from '../src/config.js';
import { ResourceCalendar, routePhases, buildSimulation, validateSimulation } from '../src/sim.js';
import { stateAt, PlaybackClock } from '../src/playback.js';
import { interpretRequest } from '../src/agent-server.js';
import { readFileSync } from 'node:fs';
import { makeTrackLayout, validateTrackLayout } from '../src/track-layout.js';
import { machineLampState, machineStatusText } from '../src/machine-status.js';
import { monitorAreas, monitorAreaPose, monitorInteriorPose } from '../src/monitor.js';
import { machiningCycle, machiningFrame } from '../src/machining-animation.js';
import { robotTrial } from '../src/robot-motion.js';

test('each robot trial exchanges a mounted gripper and retrieves the same finished workpiece', () => {
  const sim = buildSimulation();
  for (const arm of ['R1', 'R2']) {
    const trial = robotTrial(sim, arm);
    const { exchange, load, piece, station } = trial;
    const install = sim.spans.find(s => s.taskId === load.id && s.action === '裝上新爪');
    const unlock = Math.ceil((exchange.start + exchange.end) / 2);
    const lock = Math.ceil((install.start + install.end) / 2);
    const mounted = tick => stateAt(sim, tick).arms[arm].mountedTool;
    assert.equal(mounted(unlock - 1), exchange.oldTool);
    assert.equal(mounted(unlock), null);
    assert.equal(mounted(lock - 1), null);
    assert.equal(mounted(lock), install.tool);
    assert.notEqual(install.tool, exchange.oldTool);
    assert.equal(stateAt(sim, trial.machining).machines[station].status, 'processing');
    assert.equal(stateAt(sim, trial.done).machines[station].status, 'ready');
    assert.ok(trial.done <= trial.pickup && trial.pickup < trial.stop);
    assert.equal(stateAt(sim, trial.stop).pieces[piece].carriedBy, arm);
  }
});

test('machining animation follows process spans and freezes at the same simulation tick', () => {
  const sim = buildSimulation();
  for (const [id, station] of Object.entries(DEMO.stations)) {
    const span = sim.spans.find(item => item.category === 'process' && item.station === id);
    assert.ok(span, id);
    assert.equal(machiningFrame(span.start - 1, span, station.type, 'processing').active, false);
    assert.equal(machiningFrame(span.start + 1, span, station.type, 'fault').active, false);
    const tick = Math.floor((span.start + span.end) / 2);
    const frame = machiningFrame(tick, span, station.type, 'processing');
    assert.deepEqual(frame, machiningFrame(tick, span, station.type, 'processing'));
    assert.ok(frame.active && frame.progress > 0 && frame.progress < 1);
    assert.ok(frame.offset.some(value => Math.abs(value) > 0));
    assert.equal(machiningFrame(span.end, span, station.type, 'ready').active, false);
  }
});

test('machining demo covers contiguous operations for one workpiece', () => {
  const spans=buildSimulation().spans.filter(item=>item.category==='process'&&item.station==='CNC-L01');
  const cycle=machiningCycle(spans,spans[0].start);
  assert.equal(cycle.start,spans[0].start);
  assert.equal(cycle.end,spans[1].end);
  assert.equal(machiningCycle(spans,spans[1].start).end,cycle.end);
  assert.equal(machiningCycle(spans,cycle.end),null);
});

test('interior monitor centers each machining bay; exterior monitor frames each work area', () => {
  const areas = monitorAreas(DEMO);
  const targets = areas.flatMap(area => area.targets);
  assert.ok(areas.every(area => area.targets.length > 0));
  assert.deepEqual(new Set(targets), new Set([...Object.keys(DEMO.stations), ...Object.keys(DEMO.stores), ...Object.keys(DEMO.service)]));
  for (const id of Object.keys(DEMO.stations)) {
    assert.ok(targets.includes(id), id);
    const pose = monitorInteriorPose(id, 1.1, DEMO);
    const station = DEMO.stations[id];
    assert.deepEqual(pose.target, [station.x * 1.1, 1.55 * 1.1, (station.z + .72) * 1.1]);
    assert.equal(pose.fov, 34);
    const [dx, dy, dz] = pose.position.map((value, index) => value - pose.target[index]);
    assert.ok(dx > 0 && dz > 0);
    assert.ok(Math.abs(Math.atan2(dy, Math.hypot(dx, dz)) - Math.PI / 4) < 1e-10);
  }
  for (const area of areas) {
    const pose = monitorAreaPose(area.id, 1.1, DEMO);
    assert.equal(pose.fov, 45);
    const points = area.targets.map(id => DEMO.stations[id] || DEMO.stores[id] || DEMO.service[id]);
    assert.equal(pose.target[0], (Math.min(...points.map(p => p.x)) + Math.max(...points.map(p => p.x))) / 2 * 1.1);
    assert.equal(pose.target[2], (Math.min(...points.map(p => p.z)) + Math.max(...points.map(p => p.z))) / 2 * 1.1);
    assert.ok(pose.position[0] > pose.target[0] && pose.position[2] > pose.target[2]);
  }
  assert.throws(() => monitorInteriorPose('RAW', 1, DEMO), /No machine interior/);
});

test('Blender rail layout stays connected to the simulation geometry', () => {
  const layout = makeTrackLayout(DEMO);
  assert.deepEqual(validateTrackLayout(layout, DEMO), []);
  assert.deepEqual(JSON.parse(readFileSync(new URL('../tools/track-layout.json', import.meta.url))), layout);
  assert.equal(layout.main.path.length, 7);
  assert.equal(layout.rings.length, 8);
  assert.equal(layout.branches.length, 6);
  assert.equal(layout.docks.length, Object.keys(DEMO.stations).length + Object.keys(DEMO.stores).length + Object.keys(DEMO.service).length);
});

test('six mold workpieces complete six ordered steps and six FG confirmations', () => {
  const result = buildSimulation();
  assert.deepEqual(validateSimulation(result), []);
  assert.equal(result.stats.processCompletions, 36);
  assert.equal(result.stats.netProcessMinutes, 282);
  assert.deepEqual(result.stock, { RAW: 0, WIP: 0, FG: 6 });
  assert.equal(result.pieces.length, 6);
  assert.equal(result.events.filter(e => e.type === 'placed' && e.dest === 'FG').length, 6);
  assert.ok(result.tasks.some(t => t.arm === 'R1'));
  assert.ok(result.tasks.some(t => t.arm === 'R2'));
  assert.ok(result.spans.some(s => s.category === 'wait'));
});

test('grinder unload is the first transport that requires PROTECT', () => {
  const result = buildSimulation();
  const transfers = result.tasks;
  assert.ok(transfers.filter(t => t.source === 'RAW' || t.source.startsWith('CNC-L01') || t.source.startsWith('CNC-R01')).every(t => t.neededTool === 'ROUGH'));
  assert.ok(transfers.filter(t => t.source === 'GRIND-01').every(t => t.neededTool === 'PROTECT'));
  assert.equal(result.events.filter(e => e.type === 'tool_changed' && !e.oldTool).length, 2);
  assert.equal(new Set(result.tools.map(t => t.id)).size, 4);
});

test('whole branch and route phase reservations cannot overlap', () => {
  const result = buildSimulation();
  for (const resource of Object.keys(result.reservations)) {
    const rows = result.reservations[resource];
    for (let i = 1; i < rows.length; i++) assert.ok(rows[i].start >= rows[i - 1].end, resource);
  }
  const phases = routePhases('RAW', 'WIRE-01');
  assert.ok(phases.some(p => p.resources.includes('branch:LOGISTICS')));
  assert.ok(phases.some(p => p.resources.includes('branch:WIRE')));
  assert.ok(phases.some(p => p.resources.includes('turntable:WIRE')));
  assert.equal(phases.filter(p => p.category === 'travel' && p.label.startsWith('主環')).length, 4);
  for (const [id, station] of Object.entries(DEMO.stations)) {
    if (station.type !== 'CNC') continue;
    const arrival = routePhases('RAW', id).at(-1);
    const departure = routePhases(id, 'RAW')[0];
    for (const phase of [arrival, departure]) {
      assert.ok(phase.resources.includes('dock:'+id) && phase.resources.includes('feeder:CNC'));
      assert.ok(phase.resources.some(r => r.startsWith('ring:CNC:')));
    }
    assert.deepEqual([...arrival.path].reverse(), departure.path);
  }
});

test('resource calendar keeps full reservation and rejects double booking', () => {
  const cal = new ResourceCalendar();
  cal.book(['branch:X'], 10, 100, 'A');
  assert.equal(cal.earliest(['branch:X'], 20, 5), 100);
  assert.throws(() => cal.book(['branch:X'], 99, 101, 'B'), /Double booking/);
  const phases = [{ resources: ['main:0'], ticks: 10 }, { resources: ['branch:X'], ticks: 20 }];
  assert.equal(cal.bookRoute(phases, 0, 'B'), 90);
});

test('playback pause remains paused after seek and state matches final stock', () => {
  const result = buildSimulation();
  const clock = new PlaybackClock(result.durationTicks);
  clock.rate = 2;
  clock.play();
  for (let ms=1000; ms<=2000; ms+=10) clock.advance(ms);
  assert.equal(clock.tick, 20);
  assert.ok(clock.tick > 0);
  clock.pause(); const pausedTick = clock.tick; clock.advance(3000);
  assert.equal(clock.tick, pausedTick);
  clock.seek(result.durationTicks);
  assert.deepEqual(stateAt(result, clock.tick).stock, { RAW: 0, WIP: 0, FG: 6 });
  assert.equal(clock.playing, false);
});

test('machine lamps show orange while running, green until pickup, and red on a fault', () => {
  const result = buildSimulation();
  const started = result.events.find(event => event.type === 'process_started');
  const completed = result.events.find(event => event.type === 'process_completed' && event.machine === started.machine);
  assert.equal(machineLampState(stateAt(result, started.tick).machines[started.machine].status), 'orange');
  assert.equal(machineLampState(stateAt(result, completed.tick).machines[completed.machine].status), 'green');
  assert.equal(machineStatusText('ready'), '程式完成・等待收料');
  const faultEvents = [...result.events, { tick: 1, type: 'machine_faulted', machine: 'EDM-01' },
    { tick: 2, type: 'machine_recovered', machine: 'EDM-01' }].sort((a, b) => a.tick - b.tick);
  const faultRun = { ...result, events: faultEvents };
  assert.equal(machineLampState(stateAt(faultRun, 1).machines['EDM-01'].status), 'red');
  assert.equal(machineLampState(stateAt(faultRun, 2).machines['EDM-01'].status), null);
  const persistentFault = { ...result, events: [...result.events,
    { tick: started.tick + 1, type: 'machine_faulted', machine: started.machine },
    { tick: completed.tick + 1, type: 'machine_recovered', machine: started.machine }]
    .sort((a, b) => a.tick - b.tick) };
  assert.equal(machineLampState(stateAt(persistentFault, completed.tick).machines[started.machine].status), 'red');
  assert.equal(machineLampState(stateAt(persistentFault, completed.tick + 1).machines[started.machine].status), 'green');
  assert.equal(machineLampState('idle'), null);
});

test('time quantum and invalid quantity are hard constraints', () => {
  assert.equal(secondsToTicks(3, DEMO), 30);
  assert.throws(() => buildSimulation(DEMO, { quantity: 7 }), /RAW/);
  assert.notDeepEqual(pointFor('CNC-L01'), [DEMO.stations['CNC-L01'].x, DEMO.stations['CNC-L01'].z]);
});

test('LLM path requires key and validates model output before recipe matching', async () => {
  await assert.rejects(() => interpretRequest('六件模具'), /OPENAI_API_KEY/);
  const fetchFn = async () => ({ ok: true, json: async () => ({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ recipeId: 'UNAPPROVED', quantity: 7, dueMinutes: -1, notes: 'unknown' }) }] }] }) });
  assert.deepEqual(await interpretRequest('六件模具', { apiKey: 'fake-test-key', fetchFn }), {
    recipeId: null, quantity: null, dueMinutes: null, notes: 'unknown', source: 'openai_responses_api',
  });
});

test('adapter ledger is idempotent and retains unknown occupancy until clear confirmation', async () => {
  const { ExecutionLedger } = await import('../src/execution-ledger.js');
  const ledger = new ExecutionLedger('plan-1');
  const command = { id: 'load-1', planVersion: 'plan-1', resources: ['branch:WIRE', 'dock:WIRE-01'] };
  assert.equal(ledger.accept(command).status, 'accepted');
  assert.equal(ledger.accept(command).duplicate, true);
  assert.equal(ledger.start(command.id, 'plan-1'), true);
  assert.equal(ledger.unknown(command.id, 'plan-1'), true);
  ledger.accept({ id: 'load-2', planVersion: 'plan-1', resources: ['branch:WIRE'] });
  assert.equal(ledger.start('load-2', 'plan-1'), false);
  assert.equal(ledger.settle(command.id, 'old-plan', 'completed', true), false);
  assert.equal(ledger.settle(command.id, 'plan-1', 'completed', false), true);
  assert.equal(ledger.snapshot().held['branch:WIRE'], 'load-1');
  assert.equal(ledger.start('load-2', 'plan-1'), false);
  assert.equal(ledger.confirmClear(command.id, 'old-plan'), false);
  assert.equal(ledger.confirmClear(command.id, 'plan-1'), true);
  assert.equal(ledger.start('load-2', 'plan-1'), true);
});

test('full FG blocks completion without creating overflow or seventh piece', () => {
  const config = structuredClone(DEMO);
  config.stockCapacity.FG = 2;
  const result = buildSimulation(config);
  assert.equal(result.stock.FG, 2);
  assert.equal(result.pieces.length, 6);
  assert.ok(validateSimulation(result).includes('Unfinished workpieces'));
  assert.ok(result.events.filter(e => e.type === 'placed' && e.dest === 'FG').length === 2);
});

test('late due date warns but does not block a feasible run', () => {
  const result = buildSimulation(DEMO, { dueMinutes: 150 });
  assert.deepEqual(validateSimulation(result), []);
  assert.ok(result.stats.lateByMinutes > 40);
});
