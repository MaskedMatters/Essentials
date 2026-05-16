import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import ssoRoutes from './routes/sso';
import containerRoutes, { containerProxy } from './routes/containers';
import logsRoutes from './routes/logs';
import dockerRoutes from './routes/docker';

import { LoggingService } from './services/LoggingService';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(cookieParser());

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/sso', ssoRoutes);
app.use('/api/containers', containerRoutes);
app.use('/api/logs', logsRoutes);
app.use('/api/docker', dockerRoutes);

// Connect to MongoDB
const mongoUri = process.env.MONGO_URI || 'mongodb://mongodb:27017/essentials';
mongoose.connect(mongoUri)
  .then(() => {
    console.log('Connected to MongoDB');
    
    // Start logging service
    LoggingService.startMonitoring().catch(err => {
      console.error('Failed to start LoggingService:', err);
    });

    const server = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

    // Handle WebSocket upgrades for the container proxy
    server.on('upgrade', (req, socket, head) => {
      if (req.url?.startsWith('/api/containers/proxy')) {
        containerProxy.upgrade(req, socket as any, head);
      }
    });
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB', err);
    process.exit(1);
  });
