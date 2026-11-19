// Adapter-facing command state. An acknowledgement or elapsed time alone never releases occupancy.
export class ExecutionLedger {
  constructor(planVersion) {
    this.planVersion = planVersion;
    this.commands = new Map();
    this.held = new Map();
  }
  accept(command) {
    if (!command?.id || !Array.isArray(command.resources)) throw new Error('Invalid command');
    const existing = this.commands.get(command.id);
    if (existing) return { ...existing, duplicate: true };
    if (command.planVersion !== this.planVersion) throw new Error('Stale plan version');
    const row = { id: command.id, planVersion: command.planVersion, resources: [...new Set(command.resources)], status: 'accepted' };
    this.commands.set(row.id, row);
    return { ...row };
  }
  start(id, planVersion) {
    const row = this.commands.get(id);
    if (!row || row.planVersion !== planVersion || planVersion !== this.planVersion) return false;
    if (row.status === 'executing') return true;
    if (row.status !== 'accepted') return false;
    if (row.resources.some(resource => this.held.has(resource))) return false;
    for (const resource of row.resources) this.held.set(resource, id);
    row.status = 'executing';
    return true;
  }
  unknown(id, planVersion) {
    const row = this.commands.get(id);
    if (!row || row.planVersion !== planVersion || row.status !== 'executing') return false;
    row.status = 'unknown';
    return true;
  }
  settle(id, planVersion, outcome, clearConfirmed = false) {
    const row = this.commands.get(id);
    if (!row || row.planVersion !== planVersion || this.planVersion !== planVersion || !['executing', 'unknown'].includes(row.status)) return false;
    if (!['completed', 'failed'].includes(outcome)) throw new Error('Invalid outcome');
    row.status = outcome;
    if (clearConfirmed) this.confirmClear(id, planVersion);
    return true;
  }
  confirmClear(id, planVersion) {
    const row = this.commands.get(id);
    if (!row || row.planVersion !== planVersion || this.planVersion !== planVersion || !['completed', 'failed'].includes(row.status)) return false;
    for (const resource of row.resources) if (this.held.get(resource) === id) this.held.delete(resource);
    return true;
  }
  updatePlanVersion(version) { this.planVersion = version; }
  snapshot() { return { planVersion: this.planVersion, commands: [...this.commands.values()].map(row => ({ ...row })), held: Object.fromEntries(this.held) }; }
}
