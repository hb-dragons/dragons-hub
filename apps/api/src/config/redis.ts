import Redis from "ioredis";
import { env } from "./env";
import { logger } from "./logger";

/**
 * How many reconnection attempts a request-path command may sit through before
 * ioredis rejects it. This is the setting that makes "fail open" reachable: with
 * `maxRetriesPerRequest: null` a command issued while Redis is unreachable stays
 * in the offline queue forever — it neither resolves nor rejects — so every
 * `catch` that logs "failing open" is dead code and the request hangs until the
 * client or load balancer times out. A small finite value keeps a brief blip
 * transparent (the offline queue still buffers across a fast reconnect) while
 * bounding a real outage to a fast rejection the caller can degrade on.
 */
const REQUEST_MAX_RETRIES_PER_REQUEST = 2;

/**
 * A client for connections that must never give up on an in-flight command:
 * BullMQ requires `maxRetriesPerRequest: null` on the connections it owns
 * (a blocking read has to survive a reconnect), and the pub/sub pair is
 * long-lived for the same reason. Never use this on the request path.
 */
export function createRedisClient(): Redis {
  return attachErrorLogging(
    new Redis(env.REDIS_URL, { maxRetriesPerRequest: null }),
    "blocking",
  );
}

/**
 * ioredis surfaces connection failures as `error` events. An ioredis client
 * with no `error` listener lets the underlying socket rejection escape as an
 * unhandled rejection, which fails the whole vitest run even when every test
 * passes — and in production would be an unhandled rejection on a Redis blip
 * rather than the reconnect ioredis is already doing for us. Every client this
 * module hands out gets a listener; callers may add their own on top.
 */
function attachErrorLogging(client: Redis, kind: string): Redis {
  client.on("error", (err) => {
    logger.error({ err, kind }, "Redis connection error");
  });
  return client;
}

/**
 * A client for the request path: rate limiters, the sign-in lockout, session
 * secondary storage, health probes. Commands reject once Redis has been
 * unreachable for a couple of reconnect attempts, so callers can fail open.
 */
function createRequestRedisClient(): Redis {
  return attachErrorLogging(
    new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: REQUEST_MAX_RETRIES_PER_REQUEST,
    }),
    "request",
  );
}

let _redis: Redis | undefined;

/** The shared request-path client. */
export function getRedis(): Redis {
  if (!_redis) {
    _redis = createRequestRedisClient();

    _redis.on("connect", () => {
      logger.info("Redis connected");
    });
  }
  return _redis;
}

/**
 * Bump a fixed-window counter and guarantee it carries a TTL, atomically.
 *
 * `INCR` followed by a separate `EXPIRE` is two round trips with a gap in the
 * middle: a process crash, a failover or a dropped connection after the INCR
 * leaves the counter with no expiry, and a key that never expires never resets.
 * For a rate limiter that means the caller stays limited until someone deletes
 * the key by hand; for the sign-in failure counter it means failures accumulate
 * across all time and eventually lock out a legitimate user. One script runs
 * both in a single atomic round trip.
 *
 * The `TTL < 0` arm also repairs a key that already lost its expiry, so
 * counters stranded by the previous non-atomic code heal on their next request
 * instead of needing a manual flush.
 */
const INCR_WITH_TTL = `
local count = redis.call('INCR', KEYS[1])
if count == 1 or redis.call('TTL', KEYS[1]) < 0 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
`;

export async function incrementWithTtl(
  key: string,
  ttlSeconds: number,
): Promise<number> {
  return Number(await getRedis().eval(INCR_WITH_TTL, 1, key, String(ttlSeconds)));
}

/**
 * Quit the shared request-path client. Called from the graceful-shutdown
 * sequence after the HTTP server and the workers are done, so no in-flight
 * request loses its Redis connection mid-command. Clients handed out by
 * `createRedisClient()` belong to BullMQ and are closed by `shutdownWorkers`.
 */
export async function closeRedis(): Promise<void> {
  if (_redis) {
    await _redis.quit();
    _redis = undefined;
  }
}
