export interface AudioProcessingConfig {
  noiseReduction: boolean;
  echoCancellation: boolean;
  autoGainControl: boolean;
  sampleRate: number;
  channels: number;
}

export class AudioProcessor {
  private config: AudioProcessingConfig;
  private readonly bufferSize: number = 4096;
  private noiseFloor: number = 0.01;
  private targetRMS: number = 0.2;
  private lastRMS: number = 0;
  private smoothingFactor: number = 0.95;

  constructor(config: AudioProcessingConfig) {
    this.config = config;
  }

  public processAudioChunk(audioData: Float32Array): Float32Array {
    let processedData = audioData;

    if (this.config.noiseReduction) {
      processedData = this.applyNoiseReduction(processedData);
    }

    if (this.config.autoGainControl) {
      processedData = this.applyAutoGainControl(processedData);
    }

    return processedData;
  }

  private applyNoiseReduction(audioData: Float32Array): Float32Array {
    // Calculate current noise floor
    const currentRMS = this.calculateRMS(audioData);
    this.noiseFloor = this.smoothingFactor * this.noiseFloor + 
                      (1 - this.smoothingFactor) * currentRMS;

    // Apply noise gate
    const threshold = this.noiseFloor * 2;
    return audioData.map(sample => 
      Math.abs(sample) < threshold ? 0 : sample
    );
  }

  private applyAutoGainControl(audioData: Float32Array): Float32Array {
    const currentRMS = this.calculateRMS(audioData);
    
    // Smooth RMS transitions
    this.lastRMS = this.smoothingFactor * this.lastRMS + 
                   (1 - this.smoothingFactor) * currentRMS;

    // Calculate gain adjustment
    const gainAdjustment = currentRMS > 0 ? this.targetRMS / currentRMS : 1;

    // Apply gain with limiting
    return audioData.map(sample => {
      const adjustedSample = sample * gainAdjustment;
      return Math.max(-1, Math.min(1, adjustedSample));
    });
  }

  private calculateRMS(audioData: Float32Array): number {
    const sum = audioData.reduce((acc, sample) => acc + sample * sample, 0);
    return Math.sqrt(sum / audioData.length);
  }

  public updateConfig(newConfig: Partial<AudioProcessingConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  public getConfig(): AudioProcessingConfig {
    return { ...this.config };
  }

  public prepareAudioBuffer(audioData: Float32Array): Buffer {
    const processedData = this.processAudioChunk(audioData);
    
    // Convert to 16-bit PCM
    const pcmData = new Int16Array(processedData.length);
    for (let i = 0; i < processedData.length; i++) {
      pcmData[i] = Math.min(1, Math.max(-1, processedData[i])) * 0x7FFF;
    }
    
    return Buffer.from(pcmData.buffer);
  }
} 