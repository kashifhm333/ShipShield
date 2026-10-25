import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  mongodbUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/shipshield',
  redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  jwtSecret: process.env.JWT_SECRET || 'dev-jwt-secret-do-not-use-in-production-1234567890',
  githubWebhookSecret: process.env.GITHUB_WEBHOOK_SECRET || 'dev-github-webhook-secret-1234567890',
  workerInternalHmacSecret: process.env.WORKER_INTERNAL_HMAC_SECRET || 'dev-worker-hmac-secret-1234567890',
};
