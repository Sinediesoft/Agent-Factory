const orderPalette = ['#087fb4', '#b45b08', '#7252be', '#118768', '#b33367', '#766218'];

export function productionStatus(sim, state) {
  const pieces = Object.values(state.pieces);
  const defaultOrderId = sim.config.recipe.id;
  const orderIds = [...new Set(pieces.map(piece => piece.orderId || defaultOrderId))];
  const colors = Object.fromEntries(orderIds.map((id, index) => [id,
    orderPalette[index] || `hsl(${(index * 137.508) % 360} 64% 37%)`]));
  const machineOrders = Object.fromEntries(Object.entries(state.machines).map(([id, machine]) =>
    [id, machine.piece ? (state.pieces[machine.piece]?.orderId || defaultOrderId) : null]));
  const orders = orderIds.map(id => {
    const ownPieces = pieces.filter(piece => (piece.orderId || defaultOrderId) === id);
    const done = ownPieces.filter(piece => piece.done).length;
    const machines = Object.keys(machineOrders).filter(machine => machineOrders[machine] === id);
    return { id, color: colors[id], done, total: ownPieces.length, machines,
      status: done === ownPieces.length ? '已完成' : state.tick === 0 ? '待執行' : '執行中' };
  });
  const faults = Object.entries(state.machines).filter(([, machine]) => machine.faulted)
    .map(([id, machine]) => ({ id, code: machine.faultCode ?? null }));
  return { orders, colors, machineOrders, faults };
}
