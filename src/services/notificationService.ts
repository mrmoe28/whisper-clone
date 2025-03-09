import { Notification } from 'electron';
import path from 'path';

export interface NotificationConfig {
  show: boolean;
  sound: boolean;
}

export class NotificationService {
  private config: NotificationConfig;
  private readonly sounds = {
    start: path.join(__dirname, '../../assets/start.mp3'),
    stop: path.join(__dirname, '../../assets/stop.mp3'),
    success: path.join(__dirname, '../../assets/success.mp3'),
    error: path.join(__dirname, '../../assets/error.mp3')
  };

  constructor(config: NotificationConfig) {
    this.config = config;
  }

  public notify(title: string, body: string, type: 'start' | 'stop' | 'success' | 'error' = 'success') {
    if (this.config.show) {
      new Notification({
        title,
        body,
        icon: path.join(__dirname, '../../assets/icon.png'),
        silent: !this.config.sound
      }).show();
    }

    if (this.config.sound) {
      this.playSound(type);
    }
  }

  private playSound(type: keyof typeof this.sounds) {
    const audio = new Audio(this.sounds[type]);
    audio.play().catch(error => {
      console.error('Error playing notification sound:', error);
    });
  }

  public updateConfig(newConfig: Partial<NotificationConfig>) {
    this.config = { ...this.config, ...newConfig };
  }

  public getConfig(): NotificationConfig {
    return { ...this.config };
  }

  public notifyTranscriptionStart() {
    this.notify(
      'Speech Recognition Started',
      'Listening for speech...',
      'start'
    );
  }

  public notifyTranscriptionStop() {
    this.notify(
      'Speech Recognition Stopped',
      'No longer listening',
      'stop'
    );
  }

  public notifyTranscriptionSuccess(confidence: number) {
    this.notify(
      'Transcription Complete',
      `Text transcribed with ${Math.round(confidence * 100)}% confidence`,
      'success'
    );
  }

  public notifyError(error: string) {
    this.notify(
      'Error',
      error,
      'error'
    );
  }
} 