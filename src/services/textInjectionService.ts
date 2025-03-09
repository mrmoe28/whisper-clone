import * as applescript from 'applescript';
import { EventEmitter } from 'events';
import { logger } from './loggingService';
import path from 'path';
import { app } from 'electron';

// Define text injection events
export enum TextInjectionEvent {
  SUCCESS = 'success',
  ERROR = 'error',
  STATUS = 'status'
}

export class TextInjectionService extends EventEmitter {
  private static instance: TextInjectionService;
  private isInjecting: boolean = false;
  private injectionQueue: string[] = [];
  private injectionDelay: number = 100; // ms
  private processingQueue: boolean = false;
  
  private constructor() {
    super();
    logger.info('TextInjectionService initialized');
  }
  
  public static getInstance(): TextInjectionService {
    if (!TextInjectionService.instance) {
      TextInjectionService.instance = new TextInjectionService();
    }
    return TextInjectionService.instance;
  }
  
  /**
   * Inject text into the active text field
   * @param text Text to inject
   * @param immediate If true, inject immediately, otherwise add to queue
   */
  public async injectText(text: string, immediate: boolean = false): Promise<void> {
    if (!text || text.trim() === '') {
      logger.debug('Empty text provided, skipping injection');
      return;
    }
    
    logger.info('Injecting text', { text, immediate });
    
    if (immediate) {
      await this.performTextInjection(text);
    } else {
      // Add to queue and process
      this.injectionQueue.push(text);
      
      if (!this.processingQueue) {
        this.processInjectionQueue();
      }
    }
  }
  
  /**
   * Process the injection queue
   */
  private async processInjectionQueue(): Promise<void> {
    if (this.injectionQueue.length === 0 || this.processingQueue) {
      return;
    }
    
    this.processingQueue = true;
    
    try {
      while (this.injectionQueue.length > 0) {
        const text = this.injectionQueue.shift();
        
        if (text) {
          await this.performTextInjection(text);
          
          // Add delay between injections
          await new Promise(resolve => setTimeout(resolve, this.injectionDelay));
        }
      }
    } catch (error) {
      logger.error('Error processing injection queue', error);
      this.emit(TextInjectionEvent.ERROR, error);
    } finally {
      this.processingQueue = false;
    }
  }
  
  /**
   * Perform the actual text injection
   * @param text Text to inject
   */
  private async performTextInjection(text: string): Promise<void> {
    this.isInjecting = true;
    
    try {
      // Determine platform and use appropriate injection method
      const platform = process.platform;
      
      if (platform === 'darwin') {
        await this.injectTextMacOS(text);
      } else if (platform === 'win32') {
        await this.injectTextWindows(text);
      } else if (platform === 'linux') {
        await this.injectTextLinux(text);
      } else {
        throw new Error(`Unsupported platform: ${platform}`);
      }
      
      this.emit(TextInjectionEvent.SUCCESS, text);
      logger.info('Text injection successful', { text });
    } catch (error) {
      logger.error('Text injection failed', error);
      this.emit(TextInjectionEvent.ERROR, error);
    } finally {
      this.isInjecting = false;
    }
  }
  
  /**
   * Inject text on macOS using AppleScript
   * @param text Text to inject
   */
  private async injectTextMacOS(text: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Escape single quotes in the text for AppleScript
      const escapedText = text.replace(/'/g, "\\'");
      
      // Create AppleScript to type the text
      const script = `
        tell application "System Events"
          set frontApp to name of first application process whose frontmost is true
          tell application process frontApp
            keystroke "${escapedText}"
          end tell
        end tell
      `;
      
      applescript.execString(script, (err, result) => {
        if (err) {
          logger.error('AppleScript execution failed', { error: err });
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
  
  /**
   * Inject text on Windows
   * @param text Text to inject
   */
  private async injectTextWindows(text: string): Promise<void> {
    try {
      // Use PowerShell to send keys
      const scriptPath = path.join(app.getPath('userData'), 'inject-text.ps1');
      const { execFile } = require('child_process');
      
      // Create a simple PowerShell script to send keys
      const psScript = `
        Add-Type -AssemblyName System.Windows.Forms
        [System.Windows.Forms.SendKeys]::SendWait('${text.replace(/'/g, "''")}')
      `;
      
      // Write the script to a file
      const fs = require('fs');
      fs.writeFileSync(scriptPath, psScript);
      
      // Execute the script
      return new Promise((resolve, reject) => {
        execFile('powershell', ['-ExecutionPolicy', 'Bypass', '-File', scriptPath], (error: any) => {
          if (error) {
            logger.error('PowerShell execution failed', { error });
            reject(error);
          } else {
            resolve();
          }
        });
      });
    } catch (error) {
      logger.error('Windows text injection failed', error);
      throw error;
    }
  }
  
  /**
   * Inject text on Linux
   * @param text Text to inject
   */
  private async injectTextLinux(text: string): Promise<void> {
    try {
      // Use xdotool to type text
      const { exec } = require('child_process');
      
      return new Promise((resolve, reject) => {
        exec(`xdotool type "${text.replace(/"/g, '\\"')}"`, (error: any) => {
          if (error) {
            logger.error('xdotool execution failed', { error });
            reject(error);
          } else {
            resolve();
          }
        });
      });
    } catch (error) {
      logger.error('Linux text injection failed', error);
      throw error;
    }
  }
  
  /**
   * Set the delay between injections
   * @param delay Delay in milliseconds
   */
  public setInjectionDelay(delay: number): void {
    this.injectionDelay = delay;
    logger.info('Injection delay updated', { delay });
  }
  
  /**
   * Check if text injection is currently active
   */
  public isActive(): boolean {
    return this.isInjecting;
  }
  
  /**
   * Clear the injection queue
   */
  public clearQueue(): void {
    this.injectionQueue = [];
    logger.info('Injection queue cleared');
  }
  
  /**
   * Clean up resources
   */
  public cleanup(): void {
    this.clearQueue();
    this.removeAllListeners();
    logger.info('TextInjectionService cleaned up');
  }
}

// Export a singleton instance
export const textInjectionService = TextInjectionService.getInstance(); 