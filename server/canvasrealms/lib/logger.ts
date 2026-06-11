type LogFn = (...args: unknown[]) => void;

export interface Logger {
  info: LogFn;
  warn: LogFn;
  error: LogFn;
  debug: LogFn;
  fatal: LogFn;
  trace: LogFn;
  child: (...args: unknown[]) => Logger;
}

function format(args: unknown[]): unknown[] {
  return args;
}

export const logger: Logger = {
  info: (...args) => console.info("[cr]", ...format(args)),
  warn: (...args) => console.warn("[cr]", ...format(args)),
  error: (...args) => console.error("[cr]", ...format(args)),
  debug: (...args) => console.debug("[cr]", ...format(args)),
  fatal: (...args) => console.error("[cr]", ...format(args)),
  trace: (...args) => console.debug("[cr]", ...format(args)),
  child: () => logger,
};
