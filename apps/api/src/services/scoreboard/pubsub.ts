import type { Redis } from "ioredis";
import { createRedisClient } from "../../config/redis";

let publisher: Redis | undefined;

function getPublisher(): Redis {
  publisher ??= createRedisClient();
  return publisher;
}

export function channelFor(deviceId: string): string {
  return `scoreboard:${deviceId}`;
}

export async function publishSnapshot(
  deviceId: string,
  payload: unknown,
): Promise<void> {
  await getPublisher().publish(channelFor(deviceId), JSON.stringify(payload));
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

export function broadcastChannelFor(deviceId: string): string {
  return `broadcast:${deviceId}`;
}

export async function publishBroadcast(
  deviceId: string,
  payload: unknown,
): Promise<void> {
  await getPublisher().publish(
    broadcastChannelFor(deviceId),
    JSON.stringify(payload),
  );
}

export async function subscribeBroadcast(
  deviceId: string,
  onMessage: (state: unknown) => void,
): Promise<() => Promise<void>> {
  const subscriber = createRedisClient();
  const channel = broadcastChannelFor(deviceId);
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
