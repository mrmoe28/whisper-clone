export interface AudioConfig {
  encoding: string;
  sampleRateHertz: number;
  languageCode: string;
  enableAutomaticPunctuation: boolean;
  useEnhanced: boolean;
  model: string;
  audioChannelCount?: number;
}

export interface CustomVocabulary {
  phrases: string[];
  boost: number;
}

export class ConfigService {
  private static defaultAudioConfig: AudioConfig = {
    encoding: 'LINEAR16',
    sampleRateHertz: 48000, // Higher sample rate for better quality
    languageCode: 'en-US',
    enableAutomaticPunctuation: true,
    useEnhanced: true,
    model: 'latest_long', // Using the most advanced model
  };

  private static customVocabulary: CustomVocabulary = {
    phrases: [],
    boost: 20
  };

  static getAudioConfig(channels: number = 1): AudioConfig {
    return {
      ...this.defaultAudioConfig,
      audioChannelCount: channels
    };
  }

  static addCustomPhrases(phrases: string[]) {
    this.customVocabulary.phrases = [
      ...new Set([...this.customVocabulary.phrases, ...phrases])
    ];
  }

  static getCustomVocabulary(): CustomVocabulary {
    return this.customVocabulary;
  }

  static getSpeechContexts() {
    return {
      phrases: this.customVocabulary.phrases,
      boost: this.customVocabulary.boost
    };
  }
} 