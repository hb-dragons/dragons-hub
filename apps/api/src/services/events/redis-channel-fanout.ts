import type { Redis } from "ioredis";
import { createRedisClient } from "../../config/redis";
import { logger } from "../../config/logger";

/**
 * One shared Redis subscriber per process, fanning out messages to in-memory
 * handlers keyed by channel. Replaces the per-connection `new Redis()` +
 * SUBSCRIBE pattern that let each SSE connection allocate its own Redis client
 * (a client-exhaustion DoS). Each named fanout owns exactly one subscriber and
 * one publisher connection regardless of how many channels or listeners attach.
 */
export interface ChannelFanout {
  publish(channel: string, payload: unknown): Promise<void>;
  /** Attach a listener; resolves to an unsubscribe fn that detaches it. */
  subscribe(
    channel: string,
    onMessage: (payload: unknown) => void,
  ): Promise<() => Promise<void>>;
}

export function createChannelFanout(name: string): ChannelFanout {
  const log = logger.child({ service: `pubsub:${name}` });
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
        log.warn({ channel }, "pubsub: invalid JSON payload, dropping");
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

  return {
    async publish(channel, payload) {
      await getPublisher().publish(channel, JSON.stringify(payload));
    },
    async subscribe(channel, onMessage) {
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
    },
  };
}
