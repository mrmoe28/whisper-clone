// Import modules using require to avoid type declaration issues
const winston = require('winston');
import path from 'path';
import { app } from 'electron';

// Define log levels
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  verbose: 4,
  debug: 5,
  silly: 6
};

export class LoggingService {
  private static instance: LoggingService;
  private logger: any; // Use any type for winston logger
  
  private constructor() {
    const logDir = app.getPath('userData');
    
    // Create Winston logger
    this.logger = winston.createLogger({
      levels: logLevels,
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        winston.format.splat(),
        winston.format.json()
      ),
      defaultMeta: { service: 'whisper-clone' },
      transports: [
        // Write all logs with level 'error' and below to error.log
        new winston.transports.File({ 
          filename: path.join(logDir, 'error.log'), 
          level: 'error' 
        }),
        // Write all logs with level 'info' and below to combined.log
        new winston.transports.File({ 
          filename: path.join(logDir, 'combined.log') 
        }),
        // Console output for development
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        })
      ]
    });
  }
  
  public static getInstance(): LoggingService {
    if (!LoggingService.instance) {
      LoggingService.instance = new LoggingService();
    }
    return LoggingService.instance;
  }
  
  public info(message: string, meta?: any): void {
    this.logger.info(message, meta);
  }
  
  public error(message: string, error?: Error | any): void {
    if (error instanceof Error) {
      this.logger.error(`${message}: ${error.message}`, { 
        stack: error.stack,
        ...error
      });
    } else {
      this.logger.error(message, error);
    }
  }
  
  public warn(message: string, meta?: any): void {
    this.logger.warn(message, meta);
  }
  
  public debug(message: string, meta?: any): void {
    this.logger.debug(message, meta);
  }
  
  public http(message: string, meta?: any): void {
    this.logger.http(message, meta);
  }
}

// Export a singleton instance
export const logger = LoggingService.getInstance(); 