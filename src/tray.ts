import { app, Tray, Menu, nativeImage, BrowserWindow, dialog, MenuItemConstructorOptions } from 'electron';
import path from 'path';
import { BackgroundService } from './services/backgroundService';
import { ipcMain } from 'electron';

// Use a global variable to track the tray instance
let tray: Tray | null = null;
let backgroundService: BackgroundService;
let settingsWindow: BrowserWindow | null = null;
let visualizerWindow: BrowserWindow | null = null;

// Function to destroy any existing tray icon
function destroyExistingTray() {
  if (tray) {
    console.log('Destroying existing tray icon');
    try {
      tray.destroy();
    } catch (error) {
      console.error('Error destroying tray:', error);
    }
    tray = null;
  }
}

// Function to create the tray icon
function createTrayIcon() {
  // Ensure any existing tray is destroyed first
  destroyExistingTray();
  
  try {
    // Create a proper visible icon
    console.log('Creating tray icon');
    
    // Create an empty image with proper dimensions for macOS
    const size = process.platform === 'darwin' ? 22 : 16;
    const icon = nativeImage.createEmpty();
    
    // Create a buffer for a colored icon (blue microphone)
    const buffer = Buffer.alloc(size * size * 4);
    
    // Fill with transparent background
    for (let i = 0; i < buffer.length; i += 4) {
      buffer[i] = 0;     // R
      buffer[i + 1] = 0; // G
      buffer[i + 2] = 0; // B
      buffer[i + 3] = 0; // A (transparent)
    }
    
    // Draw a blue circle for the microphone base
    const centerX = Math.floor(size / 2);
    const centerY = Math.floor(size / 2) + 2;
    const radius = Math.floor(size / 3);
    
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - centerX;
        const dy = y - centerY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance <= radius) {
          const index = (y * size + x) * 4;
          buffer[index] = 0;       // R
          buffer[index + 1] = 122; // G
          buffer[index + 2] = 255; // B
          buffer[index + 3] = 255; // A (opaque)
        }
      }
    }
    
    // Draw a microphone body (rectangle above the circle)
    const micWidth = Math.floor(size / 3);
    const micHeight = Math.floor(size / 2);
    const micX = centerX - Math.floor(micWidth / 2);
    const micY = centerY - micHeight;
    
    for (let y = micY; y < centerY; y++) {
      for (let x = micX; x < micX + micWidth; x++) {
        if (x >= 0 && x < size && y >= 0 && y < size) {
          const index = (y * size + x) * 4;
          buffer[index] = 0;       // R
          buffer[index + 1] = 122; // G
          buffer[index + 2] = 255; // B
          buffer[index + 3] = 255; // A (opaque)
        }
      }
    }
    
    // Add the representation to the icon
    icon.addRepresentation({
      width: size,
      height: size,
      buffer: buffer,
      scaleFactor: 2.0
    });
    
    // Create the tray with the icon
    tray = new Tray(icon);
    console.log('Tray created successfully');
    
    // Set a more descriptive tooltip
    tray.setToolTip('Whisper Clone - Voice-to-Text');
    
    // Create tray menu
    updateTrayMenu();
    
    // On macOS, add click handler to open menu
    if (process.platform === 'darwin') {
      tray.on('click', () => {
        tray?.popUpContextMenu();
      });
    }
  } catch (error) {
    console.error('Failed to create tray icon:', error);
    dialog.showErrorBox('Tray Error', `Failed to create tray icon: ${error}`);
  }
}

// Only initialize the app once
let isAppInitialized = false;

app.whenReady().then(() => {
  // Prevent multiple initializations
  if (isAppInitialized) {
    console.log('App already initialized, skipping');
    return;
  }
  
  isAppInitialized = true;
  console.log('Initializing app');
  
  // Initialize background service
  backgroundService = BackgroundService.getInstance();

  // Set up IPC handlers for settings
  setupIpcHandlers();

  // Create the tray icon
  createTrayIcon();

  // Update tray menu based on service state
  backgroundService.on('listeningStarted', () => {
    updateTrayMenu();
    sendStatusUpdate('Recording');
  });
  
  backgroundService.on('listeningStopped', () => {
    updateTrayMenu();
    sendStatusUpdate('Stopped');
  });
  
  backgroundService.on('transcription', (result) => {
    tray?.setToolTip(`Last confidence: ${Math.round(result.confidence * 100)}%`);
    sendTranscriptionUpdate(result);
  });
  
  backgroundService.on('error', (error) => {
    tray?.setToolTip(`Error: ${error.message}`);
    sendStatusUpdate(`Error: ${error.message}`);
  });
  
  backgroundService.on('audioData', (audioData) => {
    sendAudioData(audioData);
  });
  
  backgroundService.on('textFieldDictationStarted', () => {
    updateTrayMenu();
    sendStatusUpdate('Voice-to-Text Active');
  });
  
  backgroundService.on('textFieldDictationStopped', () => {
    updateTrayMenu();
    sendStatusUpdate('Voice-to-Text Stopped');
  });
});

function setupIpcHandlers() {
  ipcMain.on('get-settings', (event) => {
    event.reply('settings', backgroundService.getConfig());
  });
  
  ipcMain.on('save-settings', (event, settings) => {
    backgroundService.updateConfig(settings);
    updateTrayMenu();
  });
  
  ipcMain.on('get-status', (event) => {
    event.reply('status', {
      isListening: backgroundService.getListeningStatus()
    });
  });
}

function sendStatusUpdate(status: string) {
  if (visualizerWindow) {
    visualizerWindow.webContents.send('status', { status });
  }
}

function sendTranscriptionUpdate(result: { text: string, confidence: number, wordConfidences?: number[] }) {
  if (visualizerWindow) {
    visualizerWindow.webContents.send('transcription', result);
  }
}

function sendAudioData(audioData: Float32Array) {
  if (visualizerWindow) {
    // Convert Float32Array to regular array for IPC transfer
    const data = Array.from(audioData);
    visualizerWindow.webContents.send('audio-data', { audioData: data });
  }
}

function openSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 600,
    height: 700,
    title: 'Speech-to-Text Settings',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  settingsWindow.loadFile(path.join(__dirname, 'windows/settings.html'));
  
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

function openVisualizerWindow() {
  if (visualizerWindow) {
    visualizerWindow.focus();
    return;
  }

  visualizerWindow = new BrowserWindow({
    width: 800,
    height: 600,
    title: 'Audio Visualizer',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  visualizerWindow.loadFile(path.join(__dirname, 'windows/audio-visualizer.html'));
  
  visualizerWindow.on('closed', () => {
    visualizerWindow = null;
  });
}

function updateTrayMenu() {
  if (!tray) return;

  try {
    // Use getListeningStatus method instead of direct property access
    const isListening = backgroundService.getListeningStatus();
    const config = backgroundService.getConfig();
    
    // Create settings submenu
    const settingsSubmenu: MenuItemConstructorOptions[] = [
      {
        label: 'Hotkeys',
        submenu: [
          {
            label: `Start Dictation: ${config.textField.hotkeyStart}`,
            click: () => {
              openSettingsWindow();
            }
          },
          {
            label: `Stop Dictation: ${config.textField.hotkeyStop}`,
            click: () => {
              openSettingsWindow();
            }
          },
          { type: 'separator' },
          {
            label: 'Configure Hotkeys...',
            click: () => {
              openSettingsWindow();
              // Send a message to focus on the hotkey section
              if (settingsWindow) {
                settingsWindow.webContents.on('did-finish-load', () => {
                  settingsWindow?.webContents.send('focus-section', 'hotkeys');
                });
              }
            }
          }
        ]
      },
      {
        label: 'Audio Settings',
        submenu: [
          {
            label: 'Noise Reduction',
            type: 'checkbox',
            checked: config.audioSettings.noiseReduction,
            click: () => {
              const newConfig = { ...config };
              newConfig.audioSettings.noiseReduction = !config.audioSettings.noiseReduction;
              backgroundService.updateConfig(newConfig);
              updateTrayMenu();
            }
          },
          {
            label: 'Echo Cancellation',
            type: 'checkbox',
            checked: config.audioSettings.echoCancellation,
            click: () => {
              const newConfig = { ...config };
              newConfig.audioSettings.echoCancellation = !config.audioSettings.echoCancellation;
              backgroundService.updateConfig(newConfig);
              updateTrayMenu();
            }
          },
          {
            label: 'Auto Gain Control',
            type: 'checkbox',
            checked: config.audioSettings.autoGainControl,
            click: () => {
              const newConfig = { ...config };
              newConfig.audioSettings.autoGainControl = !config.audioSettings.autoGainControl;
              backgroundService.updateConfig(newConfig);
              updateTrayMenu();
            }
          },
          { type: 'separator' },
          {
            label: 'Real-time Audio Processing',
            type: 'checkbox',
            checked: config.textField.realAudioProcessing,
            click: () => {
              const newConfig = { ...config };
              newConfig.textField.realAudioProcessing = !config.textField.realAudioProcessing;
              backgroundService.updateConfig(newConfig);
              updateTrayMenu();
            }
          }
        ]
      },
      {
        label: 'Text Injection',
        submenu: [
          {
            label: 'Auto-inject Text',
            type: 'checkbox',
            checked: config.autoInject,
            click: () => {
              const newConfig = { ...config };
              newConfig.autoInject = !config.autoInject;
              backgroundService.updateConfig(newConfig);
              updateTrayMenu();
            }
          },
          {
            label: 'Auto-stop Dictation',
            type: 'checkbox',
            checked: config.textField.autoStop,
            click: () => {
              const newConfig = { ...config };
              newConfig.textField.autoStop = !config.textField.autoStop;
              backgroundService.updateConfig(newConfig);
              updateTrayMenu();
            }
          }
        ]
      },
      {
        label: 'Notifications',
        submenu: [
          {
            label: 'Show Notifications',
            type: 'checkbox',
            checked: config.notifications.show,
            click: () => {
              const newConfig = { ...config };
              newConfig.notifications.show = !config.notifications.show;
              backgroundService.updateConfig(newConfig);
              updateTrayMenu();
            }
          },
          {
            label: 'Play Sounds',
            type: 'checkbox',
            checked: config.notifications.sound,
            click: () => {
              const newConfig = { ...config };
              newConfig.notifications.sound = !config.notifications.sound;
              backgroundService.updateConfig(newConfig);
              updateTrayMenu();
            }
          }
        ]
      },
      { type: 'separator' },
      {
        label: 'Advanced Settings',
        click: () => {
          openSettingsWindow();
        }
      }
    ];
    
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Start Voice-to-Text',
        enabled: !isListening,
        click: () => {
          backgroundService.startTextFieldDictation();
          updateTrayMenu();
        }
      },
      {
        label: 'Stop Voice-to-Text',
        enabled: isListening,
        click: () => {
          backgroundService.stopTextFieldDictation();
          updateTrayMenu();
        }
      },
      { type: 'separator' },
      {
        label: 'Settings',
        submenu: settingsSubmenu
      },
      {
        label: 'Audio Visualizer',
        click: () => {
          openVisualizerWindow();
        }
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          app.quit();
        }
      }
    ]);

    tray.setContextMenu(contextMenu);
    
    // Update tooltip based on listening status
    tray.setToolTip(`Whisper Clone - ${isListening ? 'Listening' : 'Idle'}`);
  } catch (error) {
    console.error('Error updating tray menu:', error);
  }
}

// Handle app quit
app.on('window-all-closed', () => {
  // On macOS, keep the app running even when all windows are closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Clean up resources when quitting
app.on('before-quit', () => {
  if (backgroundService) {
    backgroundService.cleanup();
  }
  
  // Make sure to destroy the tray icon
  destroyExistingTray();
});

// Prevent multiple instances of the app
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log('Another instance is already running. Quitting.');
  app.quit();
} else {
  app.on('second-instance', () => {
    // Someone tried to run a second instance, focus our window instead
    if (settingsWindow) {
      if (settingsWindow.isMinimized()) settingsWindow.restore();
      settingsWindow.focus();
    }
  });
} 