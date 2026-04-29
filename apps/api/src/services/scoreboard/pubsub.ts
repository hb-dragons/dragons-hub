import { createRedisClient } from "../../config/redis";

export function channelFor(deviceId: string): string {
  return `scoreboard:${deviceId}`;
}

const publisher = createRedisClient();

export async function publishSnapshot(
  deviceId: string,
  payload: unknown,
): Promise<void> {
  await publisher.publish(channelFor(deviceId), JSON.stringify(payload));
}

export async function subscribeSnapshots(
  deviceId: string,
  onMessage: (snapshot: unknown) => void,
): Promise<() => Promise<void>> {
  const subscriber = createRedisClient();
  const channel = channelFor(deviceId);
  await subscriber.subscribe(channel);
  subscriber.on("message", (received: string, message: string) => {
    if (received !== channel) return;
    try {
      onMessage(JSON.parse(message));
    } catch {
      // discard non-JSON
    }
  });
  return async () => {
    await subscriber.unsubscribe(channel);
    await subscriber.quit();
  };
}
