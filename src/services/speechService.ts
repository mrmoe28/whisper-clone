import { SpeechClient, protos } from '@google-cloud/speech';
import { config } from 'dotenv';
import * as fs from 'fs';
import { ConfigService } from './configService';

config();

// Initialize Google Cloud Speech client
const speechClient = new SpeechClient({
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
});

// Type for word timing information
type IDuration = protos.google.protobuf.IDuration;
// Type alias for AudioEncoding
type AudioEncoding = protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding;

export interface TranscriptionResult {
  text: string;
  confidence: number;
  speakerLabels?: string[];
  wordTimings?: Array<{
    word: string;
    startTime: number;
    endTime: number;
    confidence: number;
  }>;
}

export class SpeechService {
  private streamingRecognize: protos.google.cloud.speech.v1.StreamingRecognizeResponse | null = null;
  private recognizeStream: any = null;

  async transcribeAudioFile(filePath: string, enableSpeakerDiarization: boolean = false): Promise<TranscriptionResult> {
    try {
      const audioBytes = fs.readFileSync(filePath).toString('base64');
      const stats = fs.statSync(filePath);
      const fileSizeInBytes = stats.size;
      
      // Get audio configuration
      const audioConfig = ConfigService.getAudioConfig();
      
      // Ensure encoding is a valid AudioEncoding type
      const encoding = this.getValidEncoding(audioConfig.encoding);
      
      // Prepare recognition config
      const config: protos.google.cloud.speech.v1.IRecognitionConfig = {
        ...audioConfig,
        encoding,
        enableWordTimeOffsets: true,
        enableWordConfidence: true,
        // Speaker diarization settings
        diarizationConfig: enableSpeakerDiarization ? {
          enableSpeakerDiarization: true,
          minSpeakerCount: 1,
          maxSpeakerCount: 2
        } : undefined,
        speechContexts: [ConfigService.getSpeechContexts()],
        useEnhanced: true,
        model: fileSizeInBytes > 60 * 1024 * 1024 ? 'latest_long' : 'latest_short',
      };

      const audio = {
        content: audioBytes,
      };

      const request: protos.google.cloud.speech.v1.IRecognizeRequest = {
        audio,
        config,
      };

      const [response] = await speechClient.recognize(request);
      
      return this.processRecognitionResponse(response, enableSpeakerDiarization);
    } catch (error) {
      console.error('Error transcribing audio:', error);
      throw new Error('Failed to transcribe audio file');
    }
  }

  async transcribeAudioBuffer(audioBuffer: Buffer): Promise<TranscriptionResult> {
    try {
      if (!this.recognizeStream) {
        const audioConfig = ConfigService.getAudioConfig();
        
        // Ensure encoding is a valid AudioEncoding type
        const encoding = this.getValidEncoding(audioConfig.encoding);
          
        const config: protos.google.cloud.speech.v1.IStreamingRecognitionConfig = {
          config: {
            enableWordTimeOffsets: true,
            enableWordConfidence: true,
            useEnhanced: true,
            model: 'latest_short',
            speechContexts: [ConfigService.getSpeechContexts()],
            encoding,
            sampleRateHertz: audioConfig.sampleRateHertz,
            languageCode: audioConfig.languageCode || 'en-US',
            enableAutomaticPunctuation: audioConfig.enableAutomaticPunctuation,
            audioChannelCount: audioConfig.audioChannelCount
          },
          interimResults: true,
          singleUtterance: false
        };

        this.recognizeStream = speechClient
          .streamingRecognize(config)
          .on('error', (error: Error) => {
            console.error('Streaming recognition error:', error);
            this.recognizeStream = null;
          })
          .on('data', (data: protos.google.cloud.speech.v1.StreamingRecognizeResponse) => {
            this.streamingRecognize = data;
          });
      }

      // Write audio buffer to the stream
      if (this.recognizeStream) {
        this.recognizeStream.write(audioBuffer);
      }

      // Process the latest results
      if (this.streamingRecognize) {
        return this.processStreamingResponse(this.streamingRecognize);
      }

      return {
        text: '',
        confidence: 0
      };
    } catch (error) {
      console.error('Error transcribing audio buffer:', error);
      throw new Error('Failed to transcribe audio buffer');
    }
  }

  private processRecognitionResponse(
    response: protos.google.cloud.speech.v1.IRecognizeResponse,
    enableSpeakerDiarization: boolean
  ): TranscriptionResult {
    let transcription = '';
    const wordTimings: TranscriptionResult['wordTimings'] = [];
    const speakerLabels: string[] = [];
    let confidence = 0;
    let wordCount = 0;

    response.results?.forEach((result, resultIndex) => {
      if (result.alternatives?.[0]) {
        const alternative = result.alternatives[0];
        transcription += (resultIndex > 0 ? '\n' : '') + alternative.transcript;
        
        // Add word timings
        alternative.words?.forEach(wordInfo => {
          if (wordInfo.word) {
            wordTimings.push({
              word: wordInfo.word,
              startTime: this.timestampToSeconds(wordInfo.startTime as unknown as string),
              endTime: this.timestampToSeconds(wordInfo.endTime as unknown as string),
              confidence: wordInfo.confidence || 0
            });
          }
        });

        // Track confidence
        if (alternative.confidence) {
          confidence += alternative.confidence;
          wordCount++;
        }

        // Speaker diarization is now handled differently in v5.6.0
        // We'll check for speaker tags in the words if available
        if (enableSpeakerDiarization && alternative.words) {
          alternative.words.forEach(word => {
            if (word.speakerTag) {
              speakerLabels.push(`Speaker ${word.speakerTag}`);
            }
          });
        }
      }
    });

    return {
      text: transcription,
      confidence: wordCount > 0 ? confidence / wordCount : 0,
      speakerLabels: enableSpeakerDiarization && speakerLabels.length > 0 ? [...new Set(speakerLabels)] : undefined,
      wordTimings
    };
  }

  private processStreamingResponse(
    response: protos.google.cloud.speech.v1.StreamingRecognizeResponse
  ): TranscriptionResult {
    let transcription = '';
    let confidence = 0;
    let wordCount = 0;

    response.results?.forEach(result => {
      if (result.alternatives?.[0]) {
        const alternative = result.alternatives[0];
        transcription += alternative.transcript;
        
        if (alternative.confidence) {
          confidence += alternative.confidence;
          wordCount++;
        }
      }
    });

    return {
      text: transcription,
      confidence: wordCount > 0 ? confidence / wordCount : 0
    };
  }

  private timestampToSeconds(timestamp: string | IDuration): number {
    if (typeof timestamp === 'string') {
      const match = timestamp.match(/(\d+)s/);
      return match ? parseInt(match[1], 10) : 0;
    } else if (timestamp && typeof timestamp === 'object') {
      // Handle IDuration object
      const seconds = Number(timestamp.seconds) || 0;
      const nanos = Number(timestamp.nanos) || 0;
      return seconds + nanos / 1e9;
    }
    return 0;
  }

  // Helper method to ensure encoding is a valid AudioEncoding type
  private getValidEncoding(encoding: any): AudioEncoding | undefined {
    if (typeof encoding === 'number') {
      return encoding as AudioEncoding;
    }
    
    // Map string encoding to AudioEncoding enum
    const encodingMap: Record<string, AudioEncoding> = {
      'LINEAR16': protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding.LINEAR16,
      'FLAC': protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding.FLAC,
      'MULAW': protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding.MULAW,
      'AMR': protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding.AMR,
      'AMR_WB': protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding.AMR_WB,
      'OGG_OPUS': protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding.OGG_OPUS,
      'WEBM_OPUS': protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding.WEBM_OPUS
    };
    
    if (typeof encoding === 'string' && encoding in encodingMap) {
      return encodingMap[encoding];
    }
    
    // Default to LINEAR16 if encoding is not recognized
    return protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding.LINEAR16;
  }

  public cleanup() {
    if (this.recognizeStream) {
      this.recognizeStream.end();
      this.recognizeStream = null;
    }
    this.streamingRecognize = null;
  }
} 