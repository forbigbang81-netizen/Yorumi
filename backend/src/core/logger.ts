type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const levelOrder: Record<LogLevel, number> = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
};

const configuredLevel = (process.env.LOG_LEVEL || 'info').toLowerCase() as LogLevel;
const activeLevel = levelOrder[configuredLevel] ?? levelOrder.info;

const canLog = (level: LogLevel) => levelOrder[level] >= activeLevel;

const write = (level: LogLevel, message: string, meta?: unknown) => {
    if (!canLog(level)) return;

    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

    if (meta === undefined) {
        console[level](prefix);
        return;
    }

    console[level](prefix, meta);
};

export const logger = {
    debug: (message: string, meta?: unknown) => write('debug', message, meta),
    info: (message: string, meta?: unknown) => write('info', message, meta),
    warn: (message: string, meta?: unknown) => write('warn', message, meta),
    error: (message: string, meta?: unknown) => write('error', message, meta),
};

export type Logger = typeof logger;
