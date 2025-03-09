declare module '@jitsi/electron-sdk' {
  export interface JitsiMeetJSOptions {
    disableAudioLevels?: boolean;
    disableSimulcast?: boolean;
    useIPv6?: boolean;
    [key: string]: any;
  }

  export interface JitsiTrack {
    getType(): 'audio' | 'video';
    getOriginalStream(): MediaStream;
    dispose(): void;
  }

  export interface JitsiMeetJSType {
    init(options?: JitsiMeetJSOptions): Promise<void>;
    createLocalTracks(options: {
      devices: string[];
      constraints?: MediaStreamConstraints;
    }): Promise<JitsiTrack[]>;
  }

  export const JitsiMeetJS: JitsiMeetJSType;
} 