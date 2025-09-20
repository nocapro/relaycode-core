// A simple logger for debugging within the core package.
// To enable debug logs, set LOG_LEVEL=debug in the environment.
const levels = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};
type LogLevelName = keyof typeof levels;

const isValidLogLevel = (level: string): level is LogLevelName => {
    return level in levels;
}

const getLogLevel = (): LogLevelName => {
    const envLogLevel = process.env.LOG_LEVEL?.toLowerCase() || 'info';
    return isValidLogLevel(envLogLevel) ? envLogLevel : 'info';
}

let currentLogLevelName: LogLevelName = getLogLevel();
let currentLevel = levels[currentLogLevelName];


const log = (level: number, prefix: string, ...args: any[]) => {
  if (level >= currentLevel) {
    if (level === levels.debug) {
        console.log(`\x1b[90m${prefix}\x1b[0m`, ...args); // Gray for debug
    } else {
        console.log(prefix, ...args);
    }
  }
};

export const logger = {
  setLevel: (level: LogLevelName) => {
      if (isValidLogLevel(level)) {
        currentLogLevelName = level;
        currentLevel = levels[level];
      }
  },
  debug: (...args: any[]) => log(levels.debug, '[DEBUG]', ...args),
  info: (...args: any[]) => log(levels.info, '[INFO]', ...args),
  warn: (...args: any[]) => log(levels.warn, '[WARN]', ...args),
  error: (...args: any[]) => log(levels.error, '[ERROR]', ...args),
};