import type { Redis } from "ioredis";
import { createRedisClient } from "../../config/redis";
import { logger } from "../../config/logger";

const log = logger.child({ service: "scoreboard-pubsub" });

let publisher: Redis | undefined;
let subscriber: Redis | undefined;
const handlers = new Map<string, Set<(payload: unknown) => void>>();
const pendingSubs = new Map<string, Promise<void>>();

function getPublisher(): Redis {
  publisher ??= createRedisClient();
  return publisher;
}

function getSubscriber(): Redis {
  if (subscriber) return subscriber;
  subscriber = createRedisClient();
  subscriber.on("message", (channel: string, message: string) => {
    const set = handlers.get(channel);
    if (!set || set.size === 0) return;
    let payload: unknown;
    try {
      payload = JSON.parse(message);
    } catch {
      log.warn({ channel }, "scoreboard pubsub: invalid JSON payload, dropping");
      return;
    }
    for (const handler of set) handler(payload);
  });
  return subscriber;
}

async function ensureSubscribed(channel: string): Promise<void> {
  const sub = getSubscriber();
  let pending = pendingSubs.get(channel);
  if (!pending) {
    pending = (async () => {
      await sub.subscribe(channel);
    })();
    pendingSubs.set(channel, pending);
  }
  await pending;
}

async function unsubscribeIfEmpty(channel: string): Promise<void> {
  const set = handlers.get(channel);
  if (set && set.size > 0) return;
  handlers.delete(channel);
  pendingSubs.delete(channel);
  if (subscriber) await subscriber.unsubscribe(channel);
}

async function attach(
  channel: string,
  onMessage: (payload: unknown) => void,
): Promise<() => Promise<void>> {
  let set = handlers.get(channel);
  if (!set) {
    set = new Set();
    handlers.set(channel, set);
  }
  set.add(onMessage);
  await ensureSubscribed(channel);
  return async () => {
    set.delete(onMessage);
    await unsubscribeIfEmpty(channel);
  };
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
  return attach(channelFor(deviceId), onMessage);
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
  return attach(broadcastChannelFor(deviceId), onMessage);
}
