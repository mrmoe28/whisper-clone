import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import bodyParser from 'body-parser';
import { config } from 'dotenv';
import path from 'path';
import getPort from 'get-port';
import speechRoutes from './routes/speechRoutes';

// Load environment variables
config();

const app = express();

// Middleware
app.use(cors());
app.use(morgan('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, '../public')));

// Routes
app.use('/api/speech', speechRoutes);

// Basic route
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Speech-to-Text API is running' });
});

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

const startServer = async () => {
  const preferredPort = parseInt(process.env.PORT || '3000', 10);
  try {
    const port = await getPort({ port: preferredPort });
    app.listen(port, () => {
      console.log(`Server is running on port ${port}${port !== preferredPort ? ` (default port ${preferredPort} was in use)` : ''}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer(); 