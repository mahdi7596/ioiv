type LogLevel = "debug" | "info" | "warn" | "error";
type LogMetadata = Record<string, unknown>;

function sanitize(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(sanitize).filter((item) => item !== undefined);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as LogMetadata)
        .map(([key, nestedValue]) => [key, sanitize(nestedValue)] as const)
        .filter(([, nestedValue]) => nestedValue !== undefined),
    );
  }

  return value;
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return { message: String(error) };
}

function write(level: LogLevel, event: string, metadata: LogMetadata = {}) {
  if (level === "debug" && process.env.NODE_ENV === "production") {
    return;
  }

  const payload = JSON.stringify(sanitize({ level, event, ...metadata }));

  if (level === "error") {
    console.error(payload);
    return;
  }

  if (level === "warn") {
    console.warn(payload);
    return;
  }

  console.info(payload);
}

export function maskMobile(mobile: string | null | undefined) {
  if (!mobile || mobile.length < 7) {
    return mobile;
  }

  return `${mobile.slice(0, 3)}****${mobile.slice(-4)}`;
}

export const logger = {
  debug(event: string, metadata?: LogMetadata) {
    write("debug", event, metadata);
  },
  info(event: string, metadata?: LogMetadata) {
    write("info", event, metadata);
  },
  warn(event: string, metadata?: LogMetadata) {
    write("warn", event, metadata);
  },
  error(event: string, error: unknown, metadata?: LogMetadata) {
    write("error", event, {
      ...metadata,
      error: serializeError(error),
    });
  },
};
