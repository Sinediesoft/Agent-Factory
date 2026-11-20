import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSimulation } from '../src/sim.js';
import { stateAt } from '../src/playback.js';
import { productionStatus } from '../src/production-status.js';

test('one order keeps the same color across machines and follows playback progress', () => {
  const sim = buildSimulation();
  const starts = sim.events.filter(event => event.type === 'process_started');
  const first = starts[0];
  const later = starts.find(event => event.machine !== first.machine);
  const initial = productionStatus(sim, stateAt(sim, 0));
  const active = productionStatus(sim, stateAt(sim, first.tick));
  const next = productionStatus(sim, stateAt(sim, later.tick));
  const finished = productionStatus(sim, stateAt(sim, sim.durationTicks));
  assert.equal(initial.orders[0].status, '待執行');
  assert.equal(active.machineOrders[first.machine], sim.config.recipe.id);
  assert.equal(next.machineOrders[later.machine], sim.config.recipe.id);
  assert.equal(active.colors[sim.config.recipe.id], next.colors[sim.config.recipe.id]);
  assert.deepEqual([finished.orders[0].done, finished.orders[0].total, finished.orders[0].status],
    [6, 6, '已完成']);
});

test('separate orders get distinct colors and active fault codes clear on recovery', () => {
  const base = buildSimulation();
  const sim = { ...base, pieces: base.pieces.map((piece, index) => ({ ...piece,
    orderId: index < 3 ? 'ORDER-A' : 'ORDER-B' })) };
  const before = productionStatus(sim, stateAt(sim, 0));
  assert.notEqual(before.colors['ORDER-A'], before.colors['ORDER-B']);
  const machine = 'EDM-01';
  sim.events = [...base.events,
    { tick: 1, type: 'machine_faulted', machine, code: 'E-042' },
    { tick: 2, type: 'machine_recovered', machine }].sort((a, b) => a.tick - b.tick);
  assert.deepEqual(productionStatus(sim, stateAt(sim, 1)).faults, [{ id: machine, code: 'E-042' }]);
  assert.deepEqual(productionStatus(sim, stateAt(sim, 2)).faults, []);
  sim.events = [...base.events, { tick: 1, type: 'machine_faulted', machine }]
    .sort((a, b) => a.tick - b.tick);
  assert.deepEqual(productionStatus(sim, stateAt(sim, 1)).faults, [{ id: machine, code: null }]);
});
