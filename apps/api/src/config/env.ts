import dotenv from 'dotenv';
dotenv.config();

const isProd = process.env.NODE_ENV === 'production';

if (isProd) {
  const missing: string[] = [];
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.includes('dev-') || process.env.JWT_SECRET.includes('change-me')) {
    missing.push('JWT_SECRET (must not use default or placeholder secret in production)');
  }
  if (!process.env.GITHUB_WEBHOOK_SECRET || process.env.GITHUB_WEBHOOK_SECRET.includes('dev-') || process.env.GITHUB_WEBHOOK_SECRET.includes('change-me')) {
    missing.push('GITHUB_WEBHOOK_SECRET (must not use default or placeholder secret in production)');
  }
  if (!process.env.WORKER_INTERNAL_HMAC_SECRET || process.env.WORKER_INTERNAL_HMAC_SECRET.includes('dev-') || process.env.WORKER_INTERNAL_HMAC_SECRET.includes('change-me')) {
    missing.push('WORKER_INTERNAL_HMAC_SECRET (must not use default or placeholder secret in production)');
  }
  if (missing.length > 0) {
    throw new Error(
      `Fatal Security Startup Error: Insecure production environment configuration. The following secrets must be securely provided: ${missing.join(', ')}`
    );
  }
}

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  mongodbUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/shipshield',
  redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  jwtSecret: process.env.JWT_SECRET || 'dev-jwt-secret-do-not-use-in-production-1234567890',
  githubWebhookSecret: process.env.GITHUB_WEBHOOK_SECRET || 'dev-github-webhook-secret-1234567890',
  workerInternalHmacSecret: process.env.WORKER_INTERNAL_HMAC_SECRET || 'dev-worker-hmac-secret-1234567890',
};
