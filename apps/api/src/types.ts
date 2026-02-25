import type { Logger } from "pino";
import type { auth } from "./config/auth";

type AuthSession = typeof auth.$Infer.Session;

export type AppEnv = {
  Variables: {
    logger: Logger;
    requestId: string;
    user: AuthSession["user"];
    session: AuthSession["session"];
  };
};
