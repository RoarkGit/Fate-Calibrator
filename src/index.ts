import 'dotenv/config';
import { startBot } from './bot';

startBot().catch((err: unknown) => {
  console.error('Fatal error during startup:', err);
  process.exit(1);
});
