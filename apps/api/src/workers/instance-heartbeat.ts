import { ulid } from "ulid";
import { getRedis } from "../config/redis";
import { logger } from "../config/logger";

const log = logger.child({ module: "instance-heartbeat" });

export const INSTANCE_ID = ulid();

const HB_KEY = (id: string) => `worker:hb:${id}`;
const HB_TTL_SEC = 60;
const HB_REFRESH_MS = 20_000;

let timer: ReturnType<typeof setInterval> | null = null;

export async function writeHeartbeat(): Promise<void> {
  await getRedis().set(HB_KEY(INSTANCE_ID), "1", "EX", HB_TTL_SEC);
}

export function startHeartbeat(): void {
  if (timer) return;
  void writeHeartbeat().catch((err) => log.error({ err }, "heartbeat write failed"));
  timer = setInterval(
    () => void writeHeartbeat().catch((err) => log.error({ err }, "heartbeat write failed")),
    HB_REFRESH_MS,
  );
}

export function stopHeartbeat(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

/**
 * Which of `instanceIds` still hold a heartbeat.
 *
 * One pipelined round trip instead of one `EXISTS` per id: the boot-time
 * reclaim asks this about every "running" sync run, and duplicates are common
 * (one instance owns many runs), so the serial version paid a full Redis
 * round trip per row before the worker would accept a job.
 *
 * A command that comes back with an error counts as alive. Reclaiming a run
 * marks it failed, and doing that to a run a live instance is still working on
 * is worse than leaving a genuinely dead run for the next boot to catch.
 */
export async function filterAliveInstances(
  instanceIds: readonly (string | null)[],
): Promise<Set<string>> {
  const unique = [...new Set(instanceIds.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return new Set();

  const pipeline = getRedis().pipeline();
  for (const id of unique) pipeline.exists(HB_KEY(id));
  const results = await pipeline.exec();

  const alive = new Set<string>();
  unique.forEach((id, i) => {
    const entry = results?.[i];
    if (!entry) {
      log.warn({ instanceId: id }, "heartbeat probe returned no result; assuming alive");
      alive.add(id);
      return;
    }
    const [err, value] = entry;
    if (err) {
      log.warn({ err, instanceId: id }, "heartbeat probe failed; assuming alive");
      alive.add(id);
      return;
    }
    if (value === 1) alive.add(id);
  });
  return alive;
}
