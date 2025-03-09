import { EventEmitter } from 'events';
import { desktopCapturer, ipcMain, BrowserWindow } from 'electron';
import path from 'path';
import { logger } from './loggingService';
import { AudioProcessor, AudioProcessingConfig } from './audioProcessor';

// Define audio capture types
export enum AudioCaptureType {
  DESKTOP = 'desktop',
  MICROPHONE = 'microphone',
  BOTH = 'both'
}

// Define audio capture settings
export interface AudioCaptureSettings {
  type: AudioCaptureType;
  deviceId?: string;
  noiseReduction: boolean;
  echoCancellation: boolean;
  autoGainControl: boolean;
  sampleRate: number;
  channels: number;
}

// Define audio capture events
export enum AudioCaptureEvent {
  DATA = 'data',
  ERROR = 'error',
  STATUS = 'status',
  STARTED = 'started',
  STOPPED = 'stopped'
}

export class AudioCaptureService extends EventEmitter {
  private static instance: AudioCaptureService;
  private audioProcessor: AudioProcessor;
  private captureWindow: BrowserWindow | null = null;
  private isCapturing: boolean = false;
  private settings: AudioCaptureSettings = {
    type: AudioCaptureType.MICROPHONE,
    noiseReduction: true,
    echoCancellation: true,
    autoGainControl: true,
    sampleRate: 16000,
    channels: 1
  };

  private constructor() {
    super();
    
    // Initialize audio processor
    const processingConfig: AudioProcessingConfig = {
      noiseReduction: this.settings.noiseReduction,
      echoCancellation: this.settings.echoCancellation,
      autoGainControl: this.settings.autoGainControl,
      sampleRate: this.settings.sampleRate,
      channels: this.settings.channels
    };
    
    this.audioProcessor = new AudioProcessor(processingConfig);
    
    // Set up IPC handlers
    this.setupIpcHandlers();
    
    logger.info('AudioCaptureService initialized');
  }

  public static getInstance(): AudioCaptureService {
    if (!AudioCaptureService.instance) {
      AudioCaptureService.instance = new AudioCaptureService();
    }
    return AudioCaptureService.instance;
  }

  private setupIpcHandlers(): void {
    try {
      // Set up IPC handler for desktop sources
      if (!ipcMain.listeners('get-desktop-sources').length) {
        ipcMain.handle('get-desktop-sources', async () => {
          try {
            // Verify that desktopCapturer is available
            if (!desktopCapturer) {
              const error = new Error('desktopCapturer API is not available');
              logger.error('Desktop capturer unavailable', error);
              throw error;
            }
            
            logger.info('Requesting screen sources from desktopCapturer');
            const sources = await desktopCapturer.getSources({ types: ['screen'] });
            logger.info(`Found ${sources.length} screen sources`);
            return sources;
          } catch (error) {
            logger.error('Error getting desktop sources', error);
            throw error;
          }
        });
      }
      
      // Listen for audio data from the renderer process
      ipcMain.on('audio-data', (event, audioData) => {
        if (this.isCapturing) {
          const processedData = this.audioProcessor.processAudioChunk(new Float32Array(audioData));
          this.emit(AudioCaptureEvent.DATA, processedData);
        }
      });
      
      // Listen for errors from the renderer process
      ipcMain.on('audio-error', (event, errorMessage) => {
        logger.error('Error from audio capture window', { message: errorMessage });
        this.emit(AudioCaptureEvent.ERROR, new Error(errorMessage));
        
        // Try to restart with alternative method if desktop audio fails
        if (this.settings.type === AudioCaptureType.DESKTOP || this.settings.type === AudioCaptureType.BOTH) {
          logger.info('Attempting to fall back to microphone-only capture');
          this.stopCapture();
          this.settings.type = AudioCaptureType.MICROPHONE;
          this.startCapture(this.settings);
        }
      });
      
      // Listen for status updates from the renderer process
      ipcMain.on('audio-status', (event, status) => {
        logger.info('Audio capture status update', { status });
        this.emit(AudioCaptureEvent.STATUS, status);
      });
      
    } catch (error) {
      logger.error('Error setting up IPC handlers', error);
    }
  }

  public async startCapture(settings?: Partial<AudioCaptureSettings>): Promise<void> {
    try {
      // Update settings if provided
      if (settings) {
        this.settings = { ...this.settings, ...settings };
        
        // Update audio processor settings
        this.audioProcessor.updateConfig({
          noiseReduction: this.settings.noiseReduction,
          echoCancellation: this.settings.echoCancellation,
          autoGainControl: this.settings.autoGainControl,
          sampleRate: this.settings.sampleRate,
          channels: this.settings.channels
        });
      }
      
      logger.info('Starting audio capture', { settings: this.settings });
      
      // Create a hidden browser window for audio capture
      this.captureWindow = new BrowserWindow({
        width: 400,
        height: 300,
        show: false,
        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false
        }
      });
      
      // Load the audio capture HTML file
      const htmlPath = path.join(__dirname, '../windows/audio-capture.html');
      logger.debug('Loading audio capture HTML', { path: htmlPath });
      
      await this.captureWindow.loadFile(htmlPath);
      
      // When the window is ready, start the appropriate capture method
      this.captureWindow.webContents.on('did-finish-load', () => {
        logger.info('Audio capture window loaded');
        
        if (this.settings.type === AudioCaptureType.DESKTOP || this.settings.type === AudioCaptureType.BOTH) {
          // Start desktop audio capture
          this.captureWindow?.webContents.send('start-audio-capture', {
            settings: this.settings
          });
        } else {
          // Start microphone audio capture
          this.captureWindow?.webContents.send('start-microphone-capture', {
            settings: this.settings
          });
        }
        
        this.isCapturing = true;
        this.emit(AudioCaptureEvent.STARTED);
      });
      
      // Handle window errors
      this.captureWindow.webContents.on('did-fail-load', (
        event: Electron.Event,
        errorCode: number,
        errorDescription: string
      ) => {
        logger.error('Failed to load audio capture window', { errorCode, errorDescription });
        this.emit(AudioCaptureEvent.ERROR, new Error(`Failed to load audio capture window: ${errorDescription}`));
        this.tryFallbackCapture();
      });
      
      // Handle window close
      this.captureWindow.on('closed', () => {
        logger.info('Audio capture window closed');
        this.captureWindow = null;
        this.isCapturing = false;
      });
      
    } catch (error) {
      logger.error('Error starting audio capture', error);
      this.emit(AudioCaptureEvent.ERROR, error);
      this.tryFallbackCapture();
    }
  }

  public stopCapture(): void {
    try {
      logger.info('Stopping audio capture');
      
      if (this.captureWindow) {
        this.captureWindow.close();
        this.captureWindow = null;
      }
      
      this.isCapturing = false;
      this.emit(AudioCaptureEvent.STOPPED);
      
    } catch (error) {
      logger.error('Error stopping audio capture', error);
    }
  }

  private tryFallbackCapture(): void {
    try {
      logger.info('Trying fallback audio capture method');
      
      // If desktop audio failed, try microphone only
      if (this.settings.type === AudioCaptureType.DESKTOP || this.settings.type === AudioCaptureType.BOTH) {
        this.settings.type = AudioCaptureType.MICROPHONE;
        this.startCapture(this.settings);
      } else {
        // If microphone also failed, emit error
        logger.error('All audio capture methods failed');
        this.emit(AudioCaptureEvent.ERROR, new Error('All audio capture methods failed'));
      }
      
    } catch (error) {
      logger.error('Error in fallback audio capture', error);
      this.emit(AudioCaptureEvent.ERROR, error);
    }
  }

  public isActive(): boolean {
    return this.isCapturing;
  }

  public getSettings(): AudioCaptureSettings {
    return { ...this.settings };
  }

  public updateSettings(newSettings: Partial<AudioCaptureSettings>): void {
    const needsRestart = this.isCapturing && 
      (newSettings.type !== undefined && newSettings.type !== this.settings.type);
    
    // Update settings
    this.settings = { ...this.settings, ...newSettings };
    
    // Update audio processor settings
    this.audioProcessor.updateConfig({
      noiseReduction: this.settings.noiseReduction,
      echoCancellation: this.settings.echoCancellation,
      autoGainControl: this.settings.autoGainControl,
      sampleRate: this.settings.sampleRate,
      channels: this.settings.channels
    });
    
    // Restart capture if needed
    if (needsRestart && this.isCapturing) {
      this.stopCapture();
      this.startCapture();
    }
  }

  public cleanup(): void {
    logger.info('Cleaning up AudioCaptureService');
    
    // Stop capture
    this.stopCapture();
    
    // Remove IPC handlers
    ipcMain.removeHandler('get-desktop-sources');
    ipcMain.removeAllListeners('audio-data');
    ipcMain.removeAllListeners('audio-error');
    ipcMain.removeAllListeners('audio-status');
    
    // Remove all event listeners
    this.removeAllListeners();
  }
}

// Export a singleton instance
export const audioCaptureService = AudioCaptureService.getInstance(); 