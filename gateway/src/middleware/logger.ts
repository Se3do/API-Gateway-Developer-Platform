import winston from 'winston';

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'debug',
  format: logFormat,
  defaultMeta: { service: 'gateway' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length > 1 ? ` ${JSON.stringify(meta)}` : '';
          return `${timestamp} [${level}]: ${message}${metaStr}`;
        }),
      ),
    }),
  ],
});

export function createRequestLogger() {
  return (req: any, res: any, next: any) => {
    req.context = req.context || {};
    req.context.startTime = Date.now();

    res.on('finish', () => {
      const latency = Date.now() - req.context.startTime;
      logger.http(`${req.method} ${req.originalUrl} ${res.statusCode} ${latency}ms`, {
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        latency,
        ip: req.ip,
        userId: req.context?.user?.userId,
      });
    });

    next();
  };
}
