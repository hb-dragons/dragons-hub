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

export async function isInstanceAlive(instanceId: string | null): Promise<boolean> {
  if (!instanceId) return false;
  return (await getRedis().exists(HB_KEY(instanceId))) === 1;
}
