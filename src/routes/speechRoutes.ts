import express, { Request, Response, RequestHandler } from 'express';
import multer from 'multer';
import path from 'path';
import { SpeechService } from '../services/speechService';
import { ConfigService } from '../services/configService';
import fs from 'fs';

const router = express.Router();
const speechService = new SpeechService();

// Configure multer for handling audio file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, process.env.UPLOAD_DIR || 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const filetypes = /wav|mp3|ogg|flac/;  // Added FLAC support
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Error: Supported formats are WAV, MP3, OGG, and FLAC'));
  },
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  }
});

// Add custom vocabulary
router.post('/vocabulary', express.json(), ((req: Request, res: Response) => {
  try {
    const { phrases } = req.body;
    if (!Array.isArray(phrases)) {
      return res.status(400).json({ error: 'Phrases must be an array of strings' });
    }
    
    ConfigService.addCustomPhrases(phrases);
    res.status(200).json({ message: 'Vocabulary updated successfully' });
  } catch (error) {
    console.error('Error updating vocabulary:', error);
    res.status(500).json({ error: 'Failed to update vocabulary' });
  }
}) as RequestHandler);

// Route to handle audio file upload and transcription
router.post('/transcribe', upload.single('audio'), (async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const enableSpeakerDiarization = req.body.enableSpeakerDiarization === 'true';
    const result = await speechService.transcribeAudioFile(req.file.path, enableSpeakerDiarization);
    
    // Clean up the uploaded file
    fs.unlink(req.file.path, (err) => {
      if (err) console.error('Error deleting file:', err);
    });

    res.status(200).json({
      success: true,
      transcript: result.text,
      confidence: result.confidence,
      wordTimings: result.wordTimings,
      speakerLabels: result.speakerLabels,
      filename: req.file.filename
    });
  } catch (error) {
    console.error('Error processing audio:', error);
    res.status(500).json({ error: 'Error processing audio file' });
  }
}) as RequestHandler);

// Route to get transcription status
router.get('/status/:id', (req, res) => {
  // TODO: Implement status checking
  res.json({
    id: req.params.id,
    status: 'completed',
    progress: 100
  });
});

export default router; 