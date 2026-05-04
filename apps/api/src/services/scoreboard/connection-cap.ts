const MAX_TOTAL = 1000;
const MAX_PER_DEVICE = 50;

const perDevice = new Map<string, number>();
let total = 0;

export function tryAcquire(deviceId: string): boolean {
  if (total >= MAX_TOTAL) return false;
  const current = perDevice.get(deviceId) ?? 0;
  if (current >= MAX_PER_DEVICE) return false;
  perDevice.set(deviceId, current + 1);
  total += 1;
  return true;
}

export function release(deviceId: string): void {
  const current = perDevice.get(deviceId);
  if (!current) return;
  if (current <= 1) perDevice.delete(deviceId);
  else perDevice.set(deviceId, current - 1);
  total -= 1;
}

export function __snapshotForTests(): { total: number; perDevice: number } {
  return { total, perDevice: perDevice.size };
}
