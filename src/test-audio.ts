import { app } from 'electron';
import { audioCaptureService, AudioCaptureEvent, AudioCaptureType } from './services/audioCaptureService';
import { SpeechService, TranscriptionResult } from './services/speechService';
import { textInjectionService } from './services/textInjectionService';
import { logger } from './services/loggingService';
import { AudioProcessor } from './services/audioProcessor';
import { errorHandlingService, ErrorType, ErrorSeverity } from './services/errorHandlingService';

// Wait for app to be ready
app.whenReady().then(async () => {
  logger.info('Starting audio capture test');
  
  // Initialize speech service and audio processor
  const speechService = new SpeechService();
  const audioProcessor = new AudioProcessor({
    noiseReduction: true,
    echoCancellation: true,
    autoGainControl: true,
    sampleRate: 16000,
    channels: 1
  });
  
  // Set up event listeners for audio capture
  audioCaptureService.on(AudioCaptureEvent.DATA, async (audioData: Float32Array) => {
    try {
      // Process audio data
      const processedData = audioProcessor.processAudioChunk(audioData);
      
      // Convert to buffer for speech service
      const audioBuffer = audioProcessor.prepareAudioBuffer(processedData);
      
      // Transcribe the audio
      const result = await speechService.transcribeAudioBuffer(audioBuffer);
      
      if (result && result.text) {
        logger.info('Transcription result', { text: result.text, confidence: result.confidence });
        
        // Inject text if confidence is high enough
        if (result.confidence > 0.7) {
          textInjectionService.injectText(result.text);
        }
      }
    } catch (error: any) {
      // Use error handling service
      errorHandlingService.handleError(
        errorHandlingService.createError(
          ErrorType.SPEECH_RECOGNITION,
          ErrorSeverity.ERROR,
          'Error processing audio for speech recognition',
          error
        )
      );
    }
  });
  
  audioCaptureService.on(AudioCaptureEvent.ERROR, (error: Error) => {
    // Use error handling service
    errorHandlingService.handleError(
      errorHandlingService.createError(
        ErrorType.AUDIO_CAPTURE,
        ErrorSeverity.ERROR,
        'Audio capture error',
        error
      )
    );
  });
  
  audioCaptureService.on(AudioCaptureEvent.STARTED, () => {
    logger.info('Audio capture started');
  });
  
  audioCaptureService.on(AudioCaptureEvent.STOPPED, () => {
    logger.info('Audio capture stopped');
  });
  
  audioCaptureService.on(AudioCaptureEvent.STATUS, (status: string) => {
    logger.info('Audio capture status', { status });
  });
  
  // Start with microphone capture (more reliable for testing)
  try {
    await audioCaptureService.startCapture({
      type: AudioCaptureType.MICROPHONE,
      noiseReduction: true,
      echoCancellation: true,
      autoGainControl: true,
      sampleRate: 16000,
      channels: 1
    });
    
    logger.info('Audio capture test started. Speak into your microphone...');
    
    // Run for 30 seconds then exit
    setTimeout(() => {
      logger.info('Test complete, stopping audio capture');
      audioCaptureService.stopCapture();
      
      // Clean up
      audioCaptureService.cleanup();
      textInjectionService.cleanup();
      errorHandlingService.cleanup();
      
      // Exit after cleanup
      setTimeout(() => {
        app.quit();
      }, 1000);
    }, 30000);
    
  } catch (error: any) {
    // Use error handling service
    errorHandlingService.handleError(
      errorHandlingService.createError(
        ErrorType.AUDIO_CAPTURE,
        ErrorSeverity.FATAL,
        'Failed to start audio capture test',
        error
      )
    );
    
    // Exit after a short delay
    setTimeout(() => {
      app.quit();
    }, 3000);
  }
});

// Handle app events
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  // Clean up resources
  audioCaptureService.cleanup();
  textInjectionService.cleanup();
  errorHandlingService.cleanup();
}); 