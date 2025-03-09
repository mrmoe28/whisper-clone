# Whisper Clone - Speech-to-Text Application

A powerful speech-to-text application that captures audio from your desktop or microphone, processes it, and injects the transcribed text into any active text field.

## Features

- **Real-time Audio Capture**: Capture audio from desktop or microphone
- **Speech Recognition**: Convert speech to text with high accuracy
- **Text Injection**: Automatically inject transcribed text into any active text field
- **Cross-Platform**: Works on macOS, Windows, and Linux
- **Configurable**: Customize audio settings, hotkeys, and more
- **Robust Error Handling**: Comprehensive logging and fallback mechanisms

## Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/whisper-clone.git
   cd whisper-clone
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Build the application:
   ```
   npm run build
   ```

4. Start the application:
   ```
   npm start
   ```

## Usage

1. Launch the application
2. Use the configured hotkey (default: Alt+Space) to start listening
3. Speak clearly into your microphone
4. The application will transcribe your speech and inject it into the active text field
5. Use the configured hotkey again to stop listening

## Configuration

You can configure the application through the settings menu:

- **Audio Settings**: Configure noise reduction, echo cancellation, and auto gain control
- **Hotkeys**: Customize hotkeys for starting and stopping listening
- **Notifications**: Enable or disable notifications and sounds
- **Text Injection**: Configure delay and behavior for text injection

## Architecture

The application is built with Electron and TypeScript, using a modular architecture:

- **Audio Capture**: Captures audio from desktop or microphone
- **Audio Processing**: Processes audio for optimal speech recognition
- **Speech Recognition**: Converts audio to text
- **Text Injection**: Injects text into active text fields

## Troubleshooting

If you encounter issues:

1. Check the logs in the application's user data directory
2. Ensure microphone permissions are granted
3. Try restarting the application
4. If desktop audio capture fails, the application will automatically fall back to microphone-only mode

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgements

- [Electron](https://www.electronjs.org/) - Cross-platform desktop app framework
- [Node.js](https://nodejs.org/) - JavaScript runtime
- [TypeScript](https://www.typescriptlang.org/) - Typed JavaScript
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) - Audio processing 