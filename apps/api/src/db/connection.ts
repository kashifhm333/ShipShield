import mongoose from 'mongoose';
import { config } from '../config/env.js';

export async function connectDatabase(): Promise<typeof mongoose> {
  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }
  return mongoose.connect(config.mongodbUri);
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}
