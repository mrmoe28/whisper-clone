import { logger } from './loggingService';
import { app, dialog } from 'electron';
import nodeNotifier from 'node-notifier';
import path from 'path';

// Define error types
export enum ErrorType {
  AUDIO_CAPTURE = 'audio_capture',
  SPEECH_RECOGNITION = 'speech_recognition',
  TEXT_INJECTION = 'text_injection',
  CONFIGURATION = 'configuration',
  SYSTEM = 'system',
  UNKNOWN = 'unknown'
}

// Define error severity
export enum ErrorSeverity {
  FATAL = 'fatal',
  ERROR = 'error',
  WARNING = 'warning',
  INFO = 'info'
}

// Define error interface
export interface AppError {
  type: ErrorType;
  severity: ErrorSeverity;
  message: string;
  originalError?: Error | any;
  timestamp: Date;
  handled: boolean;
}

export class ErrorHandlingService {
  private static instance: ErrorHandlingService;
  private errors: AppError[] = [];
  private maxErrorsStored: number = 100;
  private showNotifications: boolean = true;
  
  private constructor() {
    // Set up global error handlers
    this.setupGlobalErrorHandlers();
    
    logger.info('ErrorHandlingService initialized');
  }
  
  public static getInstance(): ErrorHandlingService {
    if (!ErrorHandlingService.instance) {
      ErrorHandlingService.instance = new ErrorHandlingService();
    }
    return ErrorHandlingService.instance;
  }
  
  /**
   * Set up global error handlers for uncaught exceptions and unhandled rejections
   */
  private setupGlobalErrorHandlers(): void {
    process.on('uncaughtException', (error: Error) => {
      this.handleError({
        type: ErrorType.SYSTEM,
        severity: ErrorSeverity.FATAL,
        message: 'Uncaught exception',
        originalError: error,
        timestamp: new Date(),
        handled: false
      });
    });
    
    process.on('unhandledRejection', (reason: any) => {
      this.handleError({
        type: ErrorType.SYSTEM,
        severity: ErrorSeverity.ERROR,
        message: 'Unhandled promise rejection',
        originalError: reason,
        timestamp: new Date(),
        handled: false
      });
    });
    
    // Handle Electron app errors
    app.on('render-process-gone', (event, webContents, details) => {
      this.handleError({
        type: ErrorType.SYSTEM,
        severity: ErrorSeverity.FATAL,
        message: `Render process gone: ${details.reason}`,
        originalError: details,
        timestamp: new Date(),
        handled: false
      });
    });
    
    app.on('child-process-gone', (event, details) => {
      this.handleError({
        type: ErrorType.SYSTEM,
        severity: ErrorSeverity.ERROR,
        message: `Child process gone: ${details.type} - ${details.reason}`,
        originalError: details,
        timestamp: new Date(),
        handled: false
      });
    });
  }
  
  /**
   * Handle an error
   * @param error The error to handle
   * @returns True if the error was handled successfully
   */
  public handleError(error: AppError): boolean {
    try {
      // Log the error
      this.logError(error);
      
      // Store the error
      this.storeError(error);
      
      // Show notification if enabled and error is severe enough
      if (this.showNotifications && 
          (error.severity === ErrorSeverity.FATAL || error.severity === ErrorSeverity.ERROR)) {
        this.showErrorNotification(error);
      }
      
      // Show dialog for fatal errors
      if (error.severity === ErrorSeverity.FATAL) {
        this.showErrorDialog(error);
      }
      
      // Mark as handled
      error.handled = true;
      
      return true;
    } catch (handlingError) {
      // If error handling fails, log to console as a last resort
      console.error('Error handling failed:', handlingError);
      console.error('Original error:', error);
      return false;
    }
  }
  
  /**
   * Log an error using the logging service
   * @param error The error to log
   */
  private logError(error: AppError): void {
    const { type, severity, message, originalError } = error;
    
    const logData = {
      type,
      severity,
      timestamp: error.timestamp,
      originalError: originalError instanceof Error ? {
        name: originalError.name,
        message: originalError.message,
        stack: originalError.stack
      } : originalError
    };
    
    switch (severity) {
      case ErrorSeverity.FATAL:
      case ErrorSeverity.ERROR:
        logger.error(message, logData);
        break;
      case ErrorSeverity.WARNING:
        logger.warn(message, logData);
        break;
      case ErrorSeverity.INFO:
        logger.info(message, logData);
        break;
    }
  }
  
  /**
   * Store an error in the error history
   * @param error The error to store
   */
  private storeError(error: AppError): void {
    this.errors.push(error);
    
    // Limit the number of stored errors
    if (this.errors.length > this.maxErrorsStored) {
      this.errors.shift();
    }
  }
  
  /**
   * Show a notification for an error
   * @param error The error to show a notification for
   */
  private showErrorNotification(error: AppError): void {
    const title = `${this.getSeverityLabel(error.severity)}: ${this.getTypeLabel(error.type)}`;
    
    nodeNotifier.notify({
      title,
      message: error.message,
      icon: path.join(__dirname, '../../assets/error-icon.png')
    });
  }
  
  /**
   * Show a dialog for a fatal error
   * @param error The error to show a dialog for
   */
  private showErrorDialog(error: AppError): void {
    const title = `${this.getSeverityLabel(error.severity)}: ${this.getTypeLabel(error.type)}`;
    const detail = error.originalError instanceof Error ? 
      error.originalError.stack : 
      JSON.stringify(error.originalError, null, 2);
    
    dialog.showErrorBox(title, `${error.message}\n\n${detail}`);
  }
  
  /**
   * Get a human-readable label for an error type
   * @param type The error type
   * @returns A human-readable label
   */
  private getTypeLabel(type: ErrorType): string {
    switch (type) {
      case ErrorType.AUDIO_CAPTURE:
        return 'Audio Capture Error';
      case ErrorType.SPEECH_RECOGNITION:
        return 'Speech Recognition Error';
      case ErrorType.TEXT_INJECTION:
        return 'Text Injection Error';
      case ErrorType.CONFIGURATION:
        return 'Configuration Error';
      case ErrorType.SYSTEM:
        return 'System Error';
      case ErrorType.UNKNOWN:
      default:
        return 'Unknown Error';
    }
  }
  
  /**
   * Get a human-readable label for an error severity
   * @param severity The error severity
   * @returns A human-readable label
   */
  private getSeverityLabel(severity: ErrorSeverity): string {
    switch (severity) {
      case ErrorSeverity.FATAL:
        return 'Fatal Error';
      case ErrorSeverity.ERROR:
        return 'Error';
      case ErrorSeverity.WARNING:
        return 'Warning';
      case ErrorSeverity.INFO:
        return 'Information';
      default:
        return 'Unknown';
    }
  }
  
  /**
   * Get all stored errors
   * @returns All stored errors
   */
  public getErrors(): AppError[] {
    return [...this.errors];
  }
  
  /**
   * Clear all stored errors
   */
  public clearErrors(): void {
    this.errors = [];
    logger.info('Error history cleared');
  }
  
  /**
   * Set whether to show notifications for errors
   * @param show Whether to show notifications
   */
  public setShowNotifications(show: boolean): void {
    this.showNotifications = show;
    logger.info('Error notifications', { enabled: show });
  }
  
  /**
   * Set the maximum number of errors to store
   * @param max The maximum number of errors to store
   */
  public setMaxErrorsStored(max: number): void {
    this.maxErrorsStored = max;
    logger.info('Max stored errors updated', { max });
    
    // Trim errors if needed
    if (this.errors.length > max) {
      this.errors = this.errors.slice(-max);
    }
  }
  
  /**
   * Create an error object
   * @param type The error type
   * @param severity The error severity
   * @param message The error message
   * @param originalError The original error
   * @returns An AppError object
   */
  public createError(
    type: ErrorType,
    severity: ErrorSeverity,
    message: string,
    originalError?: Error | any
  ): AppError {
    return {
      type,
      severity,
      message,
      originalError,
      timestamp: new Date(),
      handled: false
    };
  }
  
  /**
   * Clean up resources
   */
  public cleanup(): void {
    // Nothing to clean up currently
    logger.info('ErrorHandlingService cleaned up');
  }
}

// Export a singleton instance
export const errorHandlingService = ErrorHandlingService.getInstance(); 