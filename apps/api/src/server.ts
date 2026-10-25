import { createApp } from './app.js';
import { config } from './config/env.js';
import { connectDatabase } from './db/connection.js';

async function bootstrap() {
  await connectDatabase();
  console.log('Connected to MongoDB.');

  const app = createApp();
  app.listen(config.port, () => {
    console.log(`ShipShield API server running on port ${config.port}`);
  });
}

if (process.argv[1] && process.argv[1].endsWith('server.ts') || process.argv[1]?.endsWith('server.js')) {
  bootstrap().catch((err) => {
    console.error('Fatal startup error:', err);
    process.exit(1);
  });
}
