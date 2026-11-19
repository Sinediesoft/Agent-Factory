export function machineLampState(status) {
  if (status === 'fault') return 'red';
  if (status === 'processing') return 'yellow';
  if (status === 'ready') return 'green';
  return null;
}

export function machineStatusText(status) {
  if (status === 'fault') return '異常';
  if (status === 'processing') return '運行中';
  if (status === 'ready') return '程式完成・等待收料';
  return '待機';
}
