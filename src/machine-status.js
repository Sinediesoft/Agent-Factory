export function machineLampState(status) {
  if (status === 'fault') return 'red';
  if (status === 'processing') return 'orange';
  if (status === 'ready') return 'green';
  return null;
}

export function machineStatusText(status) {
  if (status === 'fault') return '異常';
  if (status === 'processing') return '運行中';
  if (status === 'ready') return '程式完成・等待收料';
  return '待機';
}

const litColors = {red: 0xef3434, orange: 0xff640a, green: 0x20c46a};
const unlitColors = {red: 0x692020, orange: 0x79400f, green: 0x175336};

export function updateMachineLamp(lamps, status) {
  const active = machineLampState(status);
  for (const [name, mesh] of Object.entries(lamps)) {
    if (!mesh) continue;
    // Older single-lens exports display every state on the same lens.
    const color = name === 'beacon' ? active || 'red' : name;
    const lit = color === active;
    mesh.material.color.setHex(lit ? litColors[color] : unlitColors[color]);
    mesh.material.emissive.setHex(lit ? litColors[color] : 0);
    mesh.material.emissiveIntensity = lit ? 0.75 : 0;
  }
}
