/* eslint-disable no-console */
// Scratch probe for issue #143: where does pino apply `redact`, and which
// hooks see the same surface? Not part of the build.
import pino from "pino";

function capture(options: pino.LoggerOptions) {
  const written: string[] = [];
  const log = pino(options, {
    write: (c: string) => {
      written.push(c);
    },
  });
  return { log, written };
}

console.log("--- does redact cover child bindings? ---");
{
  const { log, written } = capture({
    redact: { paths: ["password", "*.password"], censor: "[R]" },
  });
  log.child({ password: "child-binding-secret" }).info("hi");
  console.log(written.join("").trim());
}

console.log("\n--- does formatters.log see child bindings? ---");
{
  const seen: unknown[] = [];
  const { log, written } = capture({
    formatters: {
      log: (o) => {
        seen.push(Object.keys(o));
        return o;
      },
    },
  });
  const child = log.child({ password: "child-binding-secret" });
  child.info({ token: "arg-secret" }, "hi");
  console.log("formatters.log saw:", JSON.stringify(seen));
  console.log(written.join("").trim());
}

console.log("\n--- does hooks.logMethod see child bindings? ---");
{
  const seen: unknown[] = [];
  const { log, written } = capture({
    hooks: {
      logMethod(args, method) {
        seen.push(args.map((a) => (typeof a === "object" ? Object.keys(a as object) : a)));
        return method.apply(this, args);
      },
    },
  });
  const child = log.child({ password: "child-binding-secret" });
  child.info({ token: "arg-secret" }, "hi");
  console.log("logMethod saw:", JSON.stringify(seen));
  console.log(written.join("").trim());
}

console.log("\n--- does redact cover mixin output? ---");
{
  const { log, written } = capture({
    redact: { paths: ["password"], censor: "[R]" },
    mixin: () => ({ password: "mixin-secret" }),
  });
  log.info("hi");
  console.log(written.join("").trim());
}

console.log("\n--- does formatters.log see mixin output? ---");
{
  const seen: unknown[] = [];
  const { log, written } = capture({
    mixin: () => ({ password: "mixin-secret" }),
    formatters: {
      log: (o) => {
        seen.push(Object.keys(o));
        return o;
      },
    },
  });
  log.info("hi");
  console.log("formatters.log saw:", JSON.stringify(seen));
  console.log(written.join("").trim());
}

console.log("\n--- does redact mutate the caller's object? ---");
{
  const { log } = capture({
    redact: { paths: ["*.password"], censor: "[R]" },
  });
  const payload = { creds: { password: "orig" } };
  log.info(payload, "hi");
  console.log("after log:", JSON.stringify(payload));
}

console.log("\n--- does formatters.log see an Error argument? ---");
{
  const seen: unknown[] = [];
  const { log, written } = capture({
    formatters: {
      log: (o) => {
        seen.push(Object.keys(o));
        return o;
      },
    },
  });
  const err = Object.assign(new Error("boom"), { token: "err-secret" });
  log.error({ err }, "failed");
  console.log("formatters.log saw:", JSON.stringify(seen));
  console.log(written.join("").trim());
}

console.log("\n--- redact vs an Error's own props ---");
{
  const { log, written } = capture({
    redact: { paths: ["*.token", "*.*.token"], censor: "[R]" },
  });
  const err = Object.assign(new Error("boom"), { token: "err-secret" });
  log.error({ err }, "failed");
  console.log(written.join("").trim());
}
