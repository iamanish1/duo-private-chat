// Minimal operational logger. Never pass message text, media, tokens or
// request bodies to it — this app is private by design.
const levels = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };
const threshold = levels[process.env.LOG_LEVEL] ?? (process.env.NODE_ENV === 'test' ? levels.silent : levels.info);

function write(level, message, meta) {
  if (levels[level] < threshold) return;
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${message}`;
  const out = level === 'error' || level === 'warn' ? console.error : console.log;
  if (meta && Object.keys(meta).length) out(line, JSON.stringify(meta));
  else out(line);
}

export const logger = {
  debug: (msg, meta) => write('debug', msg, meta),
  info: (msg, meta) => write('info', msg, meta),
  warn: (msg, meta) => write('warn', msg, meta),
  error: (msg, meta) => write('error', msg, meta),
};
