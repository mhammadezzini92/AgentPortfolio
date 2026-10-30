import "server-only";

type Level = "info" | "warn" | "error";
type Fields = Record<string, unknown>;

function serializeError(error: unknown): unknown {
  if (!(error instanceof Error)) return error;
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    cause: error.cause === undefined ? undefined : serializeError(error.cause),
  };
}

// One JSON object per line so Vercel's log drain can filter on fields.
// Callers must not pass secrets or document contents in fields.
function write(level: Level, message: string, fields: Fields = {}) {
  const entry = {
    level,
    message,
    time: new Date().toISOString(),
    ...fields,
    ...(fields.error === undefined ? {} : { error: serializeError(fields.error) }),
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

export const logger = {
  info: (message: string, fields?: Fields) => write("info", message, fields),
  warn: (message: string, fields?: Fields) => write("warn", message, fields),
  error: (message: string, fields?: Fields) => write("error", message, fields),
};
