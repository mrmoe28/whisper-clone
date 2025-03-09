import { GlobalKeyboardListener, IGlobalKeyEvent } from 'node-global-key-listener';
// Remove robotjs import completely
import * as applescript from 'applescript';
import { SpeechService } from './speechService';
import { ConfigService } from './configService';
import { EventEmitter } from 'events';
import { JitsiMeetJS, JitsiTrack } from '@jitsi/electron-sdk';
import { AudioProcessor } from './audioProcessor';
import { desktopCapturer, app, Tray, Menu, nativeImage, BrowserWindow, dialog } from 'electron';
import path from 'path';
import { ipcMain } from 'electron';
import { logger } from './loggingService';
import { audioCaptureService, AudioCaptureEvent, AudioCaptureType } from './audioCaptureService';
import { textInjectionService, TextInjectionEvent } from './textInjectionService';
import nodeNotifier from 'node-notifier';

// Add AudioContext type declaration
declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext;
  }
}

interface BackgroundServiceConfig {
  enabled: boolean;
  hotkeyStart: string;
  hotkeyStop: string;
  autoInject: boolean;
  minimumConfidence: number;
  audioSettings: {
    deviceId?: string;
    noiseReduction: boolean;
    echoCancellation: boolean;
    autoGainControl: boolean;
  };
  injectionDelay: number;
  notifications: {
    show: boolean;
    sound: boolean;
  };
  textField: {
    enabled: boolean;
    hotkeyStart: string;
    hotkeyStop: string;
    autoStop: boolean;
    realAudioProcessing: boolean;
  };
}

export class BackgroundService extends EventEmitter {
  private static instance: BackgroundService;
  private isListening: boolean = false;
  private keyboardListener: GlobalKeyboardListener;
  private keyState: Record<string, boolean> = {}; // Track key states
  private speechService: SpeechService;
  private audioProcessor: AudioProcessor;
  private config: BackgroundServiceConfig = {
    enabled: false,
    hotkeyStart: 'Alt+Shift+S',
    hotkeyStop: 'Alt+Shift+X',
    autoInject: true,
    minimumConfidence: 0.8,
    audioSettings: {
      deviceId: 'default',
      noiseReduction: true,
      echoCancellation: true,
      autoGainControl: true
    },
    injectionDelay: 100,
    notifications: {
      show: true,
      sound: true
    },
    textField: {
      enabled: true,
      hotkeyStart: 'Alt+Shift+T',
      hotkeyStop: 'Alt+Shift+U',
      autoStop: true,
      realAudioProcessing: true
    }
  };

  private constructor() {
    super();
    this.speechService = new SpeechService();
    this.keyboardListener = new GlobalKeyboardListener();
    this.audioProcessor = new AudioProcessor({
      noiseReduction: this.config.audioSettings.noiseReduction,
      echoCancellation: this.config.audioSettings.echoCancellation,
      autoGainControl: this.config.audioSettings.autoGainControl,
      sampleRate: 16000,
      channels: 1
    });
    
    this.setupKeyboardListener();
    
    // Always use real audio processing
    console.log('Initializing real audio capture');
    this.initializeRealAudio();
  }

  static getInstance(): BackgroundService {
    if (!BackgroundService.instance) {
      BackgroundService.instance = new BackgroundService();
    }
    return BackgroundService.instance;
  }

  private setupKeyboardListener() {
    // Wrap in try-catch to prevent crashes
    try {
      this.keyboardListener.addListener((e: IGlobalKeyEvent, down: boolean) => {
        try {
          // Check if e exists and has the expected properties
          if (!e) {
            return;
          }
          
          // Update key state
          this.keyState[e.name] = down;
          
          // Update modifier keys
          if (e.altKey !== undefined) this.keyState['ALT'] = e.altKey;
          if (e.shiftKey !== undefined) this.keyState['SHIFT'] = e.shiftKey;
          if (e.ctrlKey !== undefined) this.keyState['CTRL'] = e.ctrlKey;
          if (e.metaKey !== undefined) this.keyState['META'] = e.metaKey;
          
          // Log keyboard events for debugging
          console.log('Keyboard event:', JSON.stringify(e, null, 2));
          
          // Process hotkeys
          // Text field dictation start hotkey (on key down)
          if (down && this.config.textField?.enabled && 
              this.isHotkeyMatch(e, this.config.textField.hotkeyStart)) {
            console.log('Text field dictation start hotkey detected');
            this.startTextFieldDictation();
            
            // Log the current state for debugging
            console.log('Started dictation, isTextFieldDictating =', this.isTextFieldDictating);
            console.log('isListening =', this.isListening);
          }
          
          // Text field dictation stop hotkey (on key down)
          else if (down && this.config.textField?.enabled && 
                   this.isHotkeyMatch(e, this.config.textField.hotkeyStop)) {
            console.log('Text field dictation stop hotkey detected');
            this.stopTextFieldDictation();
            
            // Log the current state for debugging
            console.log('Stopped dictation, isTextFieldDictating =', this.isTextFieldDictating);
            console.log('isListening =', this.isListening);
          }
          
          // Handle key up events for the start hotkey to stop dictation when released
          else if (!down && this.isTextFieldDictating && this.config.textField?.enabled) {
            // Check if this is the release of the main key in the start hotkey
            const hotkeyParts = this.config.textField.hotkeyStart.split('+');
            const mainKey = hotkeyParts[hotkeyParts.length - 1].toUpperCase();
            
            if (e.name === mainKey) {
              console.log('Text field dictation start hotkey released, stopping dictation');
              this.stopTextFieldDictation();
              
              // Log the current state for debugging
              console.log('Stopped dictation on key release, isTextFieldDictating =', this.isTextFieldDictating);
              console.log('isListening =', this.isListening);
            }
          }
          
          // Log processed key state
          console.log(`Processed key: ${e.name} down:`, this.keyState);
        } catch (error) {
          console.error('Error processing keyboard event:', error);
        }
      });
    } catch (error) {
      console.error('Error setting up keyboard listener:', error);
    }
  }

  private initializeRealAudio() {
    try {
      logger.info('Initializing real audio capture with improved error handling');
      
      // Use the new audioCaptureService instead of direct implementation
      audioCaptureService.on(AudioCaptureEvent.DATA, (audioData: Float32Array) => {
        if (this.isListening) {
          this.processAudioChunk(audioData);
          this.emit('audioData', audioData);
        }
      });
      
      audioCaptureService.on(AudioCaptureEvent.ERROR, (error: Error) => {
        logger.error('Audio capture error', error);
        this.setupSimulatedAudio();
        
        // Emit a notification about the error
        this.emit('notification', {
          message: `Audio capture error: ${error.message}`
        });
      });
      
      audioCaptureService.on(AudioCaptureEvent.STARTED, () => {
        logger.info('Audio capture started');
        
        // Emit a notification that we're using real audio
        this.emit('notification', {
          message: 'Real-time audio processing enabled'
        });
      });
      
      // Start audio capture with current settings
      audioCaptureService.startCapture({
        type: AudioCaptureType.DESKTOP,
        noiseReduction: this.config.audioSettings.noiseReduction,
        echoCancellation: this.config.audioSettings.echoCancellation,
        autoGainControl: this.config.audioSettings.autoGainControl,
        sampleRate: 16000,
        channels: 1
      });
      
    } catch (error) {
      logger.error('Error in audio initialization', error);
      this.setupSimulatedAudio();
    }
  }
  
  private setupSimulatedAudio() {
    logger.info('Setting up simulated audio');
    
    // Set up a timer to simulate audio processing every 5 seconds
    const simulateAudioProcessing = () => {
      if (this.isListening) {
        // Create a dummy transcription result
        const dummyResult = {
          text: 'This is a simulated transcription. Real audio processing is disabled.',
          confidence: 0.95
        };
        
        // Emit the dummy transcription
        this.emit('transcription', {
          text: dummyResult.text,
          confidence: dummyResult.confidence,
          isFinal: true
        });
        
        // Also emit simulated audio data for visualization
        const simulatedAudioData = new Float32Array(1024);
        for (let i = 0; i < simulatedAudioData.length; i++) {
          simulatedAudioData[i] = (Math.random() * 2 - 1) * 0.1;
        }
        this.emit('audioData', simulatedAudioData);
        
        console.log('Simulated transcription:', dummyResult.text);
      }
    };
    
    setInterval(simulateAudioProcessing, 5000);
    
    this.emit('notification', {
      message: 'Using simulated audio. Real audio capture failed.'
    });
  }

  private setupAudioProcessing(audioTrack: JitsiTrack) {
    console.log('Audio processing setup skipped - using simulation instead');
    // We're not actually using the audioTrack, as we're simulating audio processing
  }

  private async processAudioChunk(audioData: Float32Array) {
    try {
      // Process the audio data with the audio processor
      const processedData = this.audioProcessor.processAudioChunk(audioData);
      
      // Prepare the audio buffer for the speech service
      const buffer = this.prepareAudioBuffer(processedData);
      
      // Send the buffer to the speech service for transcription
      const result = await this.speechService.transcribeAudioBuffer(buffer);
      
      // Reset text field dictation timeout if active
      if (this.isTextFieldDictating && this.config.textField?.autoStop) {
        this.resetTextFieldDictationTimeout();
      }
      
      // Check if the result meets the minimum confidence threshold
      if (result.confidence >= this.config.minimumConfidence) {
        console.log(`Transcription: ${result.text} (${Math.round(result.confidence * 100)}%)`);
        
        // Emit regular transcription
        this.emit('transcription', {
          text: result.text,
          confidence: result.confidence
        });
        
        // Auto-inject text if enabled and we're in text field dictation mode
        if (this.config.autoInject && this.isTextFieldDictating) {
          // Only inject if there's actual text to inject
          if (result.text && result.text.trim().length > 0) {
            try {
              // Add a space after each injection for better readability
              await this.injectText(result.text + ' ');
              
              // Log success
              console.log(`Successfully injected text: "${result.text}"`);
            } catch (injectionError) {
              console.error('Error injecting text:', injectionError);
              
              // Try an alternative approach if the first one fails
              if (process.platform === 'darwin') {
                try {
                  // Simpler AppleScript as fallback
                  const simpleScript = `
                    tell application "System Events"
                      keystroke "${result.text.replace(/"/g, '\\"')} "
                    end tell
                  `;
                  
                  await new Promise<void>((resolve, reject) => {
                    applescript.execString(simpleScript, (err: Error | null) => {
                      if (err) reject(err);
                      else resolve();
                    });
                  });
                  
                  console.log(`Fallback injection successful: "${result.text}"`);
                } catch (fallbackError) {
                  console.error('Fallback injection also failed:', fallbackError);
                }
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Error processing audio chunk:', error);
      this.emit('error', error);
    }
  }

  private prepareAudioBuffer(audioData: Float32Array): Buffer {
    // Convert Float32Array to 16-bit PCM
    const pcmData = new Int16Array(audioData.length);
    for (let i = 0; i < audioData.length; i++) {
      pcmData[i] = Math.min(1, Math.max(-1, audioData[i])) * 0x7FFF;
    }
    return Buffer.from(pcmData.buffer);
  }

  private async injectText(text: string) {
    try {
      if (!text || text.trim() === '') {
        return;
      }
      
      logger.info('Injecting text', { text });
      
      // Use the textInjectionService instead of direct implementation
      await textInjectionService.injectText(text, true);
      
      // Play success sound if enabled
      if (this.config.notifications.sound) {
        this.playSound('success');
      }
      
      // Show notification if enabled
      if (this.config.notifications.show) {
        nodeNotifier.notify({
          title: 'Text Injected',
          message: text.length > 50 ? text.substring(0, 47) + '...' : text,
          icon: path.join(__dirname, '../../assets/icon.png')
        });
      }
      
    } catch (error: any) {
      logger.error('Error injecting text', error);
      
      // Play error sound if enabled
      if (this.config.notifications.sound) {
        this.playSound('error');
      }
      
      // Show error notification if enabled
      if (this.config.notifications.show) {
        nodeNotifier.notify({
          title: 'Text Injection Error',
          message: `Failed to inject text: ${error.message}`,
          icon: path.join(__dirname, '../../assets/icon.png')
        });
      }
    }
  }

  public startListening() {
    if (this.isListening) {
      return;
    }
    
    logger.info('Starting listening');
    this.isListening = true;
    
    // Play start sound if enabled
    if (this.config.notifications.sound) {
      this.playSound('start');
    }
    
    // Show notification if enabled
    if (this.config.notifications.show) {
      nodeNotifier.notify({
        title: 'Listening Started',
        message: 'Speech recognition is now active',
        icon: path.join(__dirname, '../../assets/icon.png')
      });
    }
    
    this.emit('listeningChanged', true);
  }
  
  public stopListening() {
    if (!this.isListening) {
      return;
    }
    
    logger.info('Stopping listening');
    this.isListening = false;
    
    // Play stop sound if enabled
    if (this.config.notifications.sound) {
      this.playSound('stop');
    }
    
    // Show notification if enabled
    if (this.config.notifications.show) {
      nodeNotifier.notify({
        title: 'Listening Stopped',
        message: 'Speech recognition is now inactive',
        icon: path.join(__dirname, '../../assets/icon.png')
      });
    }
    
    this.emit('listeningChanged', false);
  }

  // Helper method to play notification sounds
  private playSound(type: 'start' | 'stop' | 'success' | 'error') {
    try {
      const audio = new Audio();
      audio.src = path.join(__dirname, `../assets/${type}.mp3`);
      audio.play().catch(err => console.error('Error playing sound:', err));
    } catch (error) {
      console.error('Error playing sound:', error);
    }
  }

  public updateConfig(newConfig: Partial<BackgroundServiceConfig>) {
    // Update the config
    this.config = { ...this.config, ...newConfig };
    
    // Update audio processor settings
    if (newConfig.audioSettings) {
      this.audioProcessor.updateConfig({
        noiseReduction: this.config.audioSettings.noiseReduction,
        echoCancellation: this.config.audioSettings.echoCancellation,
        autoGainControl: this.config.audioSettings.autoGainControl,
        sampleRate: 16000,
        channels: 1
      });
      
      // Update audio capture settings
      audioCaptureService.updateSettings({
        noiseReduction: this.config.audioSettings.noiseReduction,
        echoCancellation: this.config.audioSettings.echoCancellation,
        autoGainControl: this.config.audioSettings.autoGainControl,
        sampleRate: 16000,
        channels: 1
      });
    }
    
    // Update text injection delay
    if (newConfig.injectionDelay !== undefined) {
      textInjectionService.setInjectionDelay(newConfig.injectionDelay);
    }
    
    logger.info('Updated config', { config: this.config });
  }

  public getConfig(): BackgroundServiceConfig {
    return { ...this.config };
  }

  // Add a method to check if listening is active
  public getListeningStatus(): boolean {
    return this.isListening;
  }

  public cleanup() {
    logger.info('Cleaning up BackgroundService');
    
    this.stopListening();
    this.keyboardListener.kill();
    
    // Clean up services
    audioCaptureService.cleanup();
    textInjectionService.cleanup();
    
    // Remove IPC handlers
    ipcMain.removeHandler('get-desktop-sources');
    ipcMain.removeAllListeners('audio-data');
    ipcMain.removeAllListeners('audio-error');
    ipcMain.removeAllListeners('audio-status');
    
    this.removeAllListeners();
    
    logger.info('BackgroundService cleaned up');
  }

  // Add new methods for text field dictation
  private isTextFieldDictating: boolean = false;
  private textFieldDictationTimeout: NodeJS.Timeout | null = null;
  
  public startTextFieldDictation() {
    if (this.isTextFieldDictating) {
      return;
    }
    
    this.isTextFieldDictating = true;
    this.emit('notification', {
      message: 'Text field dictation started'
    });
    
    // Start listening if not already listening
    if (!this.isListening) {
      console.log('Using real-time audio processing for text field dictation');
      this.startListening();
    }
    
    // Set up auto-stop timeout if enabled
    if (this.config.textField?.autoStop) {
      this.resetTextFieldDictationTimeout();
    }
    
    // Emit event for UI updates
    this.emit('textFieldDictationStarted');
  }
  
  public stopTextFieldDictation() {
    if (!this.isTextFieldDictating) {
      return;
    }
    
    this.isTextFieldDictating = false;
    this.emit('notification', {
      message: 'Text field dictation stopped'
    });
    
    // Clear auto-stop timeout
    if (this.textFieldDictationTimeout) {
      clearTimeout(this.textFieldDictationTimeout);
      this.textFieldDictationTimeout = null;
    }
    
    // Stop listening if it was started for text field dictation
    if (this.isListening) {
      this.stopListening();
    }
    
    // Emit event for UI updates
    this.emit('textFieldDictationStopped');
  }
  
  private resetTextFieldDictationTimeout() {
    // Clear existing timeout
    if (this.textFieldDictationTimeout) {
      clearTimeout(this.textFieldDictationTimeout);
    }
    
    // Set new timeout (5 seconds)
    this.textFieldDictationTimeout = setTimeout(() => {
      console.log('Auto-stopping text field dictation due to silence');
      this.stopTextFieldDictation();
    }, 5000);
  }

  // Helper method to match hotkeys
  private isHotkeyMatch(e: IGlobalKeyEvent, hotkey: string): boolean {
    // Parse the hotkey string
    const hotkeyParts = hotkey.split('+');
    const targetKey = hotkeyParts[hotkeyParts.length - 1].toUpperCase();
    
    // Check if the key matches
    if (e.name !== targetKey) {
      return false;
    }
    
    // Check modifiers
    const hasAlt = hotkeyParts.includes('Alt');
    const hasShift = hotkeyParts.includes('Shift');
    const hasCtrl = hotkeyParts.includes('Ctrl');
    const hasCmd = hotkeyParts.includes('Cmd');
    
    // Check if modifiers match
    if (hasAlt && !e.altKey) return false;
    if (hasShift && !e.shiftKey) return false;
    if (hasCtrl && !e.ctrlKey) return false;
    if (hasCmd && !e.metaKey) return false;
    
    return true;
  }
} 