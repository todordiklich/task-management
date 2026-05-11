import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// Ensure logs directory exists
const logsDir = join(process.cwd(), 'logs');
if (!existsSync(logsDir)) {
  mkdirSync(logsDir, { recursive: true });
}

// Create write streams for different log levels
const errorStream = createWriteStream(join(logsDir, 'error.log'), { flags: 'a' });
const infoStream = createWriteStream(join(logsDir, 'info.log'), { flags: 'a' });
const warnStream = createWriteStream(join(logsDir, 'warn.log'), { flags: 'a' });
const accessStream = createWriteStream(join(logsDir, 'access.log'), { flags: 'a' });

// Logger class with structured logging
class Logger {
  constructor() {
    this.isProduction = process.env.NODE_ENV === 'production';
  }

  formatMessage(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      ...meta,
    };

    return JSON.stringify(logEntry) + '\n';
  }

  error(message, meta = {}) {
    const formattedMessage = this.formatMessage('error', message, meta);
    errorStream.write(formattedMessage);
    
    if (!this.isProduction) {
      console.error(`[ERROR] ${message}`, meta);
    }
  }

  warn(message, meta = {}) {
    const formattedMessage = this.formatMessage('warn', message, meta);
    warnStream.write(formattedMessage);
    
    if (!this.isProduction) {
      console.warn(`[WARN] ${message}`, meta);
    }
  }

  info(message, meta = {}) {
    const formattedMessage = this.formatMessage('info', message, meta);
    infoStream.write(formattedMessage);
    
    if (!this.isProduction) {
      console.info(`[INFO] ${message}`, meta);
    }
  }

  access(req, res, responseTime) {
    const logData = {
      method: req.method,
      url: req.originalUrl,
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent'),
      statusCode: res.statusCode,
      responseTime: `${responseTime}ms`,
      timestamp: new Date().toISOString(),
    };

    const formattedMessage = JSON.stringify(logData) + '\n';
    accessStream.write(formattedMessage);

    if (!this.isProduction) {
      console.info(`[ACCESS] ${req.method} ${req.originalUrl} - ${res.statusCode} (${responseTime}ms)`);
    }
  }

  security(message, meta = {}) {
    this.warn(`SECURITY: ${message}`, { ...meta, category: 'security' });
  }

  database(message, meta = {}) {
    this.info(`DATABASE: ${message}`, { ...meta, category: 'database' });
  }

  performance(message, meta = {}) {
    this.info(`PERFORMANCE: ${message}`, { ...meta, category: 'performance' });
  }
}

// Create singleton instance
const logger = new Logger();

// Request logging middleware
export const requestLogger = (req, res, next) => {
  const startTime = Date.now();

  res.on('finish', () => {
    const responseTime = Date.now() - startTime;
    logger.access(req, res, responseTime);
  });

  next();
};

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('Application shutting down gracefully');
  errorStream.end();
  infoStream.end();
  warnStream.end();
  accessStream.end();
});

process.on('SIGINT', () => {
  logger.info('Application shutting down gracefully');
  errorStream.end();
  infoStream.end();
  warnStream.end();
  accessStream.end();
});

export default logger;
