import { createChannelFanout } from "../events/redis-channel-fanout";

// One shared subscriber/publisher for all scoreboard + broadcast channels in
// this process (see redis-channel-fanout for the rationale).
const fanout = createChannelFanout("scoreboard");

export function channelFor(deviceId: string): string {
  return `scoreboard:${deviceId}`;
}

export async function publishSnapshot(
  deviceId: string,
  payload: unknown,
): Promise<void> {
  await fanout.publish(channelFor(deviceId), payload);
}

export async function subscribeSnapshots(
  deviceId: string,
  onMessage: (snapshot: unknown) => void,
): Promise<() => Promise<void>> {
  return fanout.subscribe(channelFor(deviceId), onMessage);
}

export function broadcastChannelFor(deviceId: string): string {
  return `broadcast:${deviceId}`;
}

export async function publishBroadcast(
  deviceId: string,
  payload: unknown,
): Promise<void> {
  await fanout.publish(broadcastChannelFor(deviceId), payload);
}

export async function subscribeBroadcast(
  deviceId: string,
  onMessage: (state: unknown) => void,
): Promise<() => Promise<void>> {
  return fanout.subscribe(broadcastChannelFor(deviceId), onMessage);
}
