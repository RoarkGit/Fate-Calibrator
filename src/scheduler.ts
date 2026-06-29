import cron from 'node-cron';
import type { Client } from 'discord.js';

export function startScheduler(client: Client, rebuildAndUpdate: (client: Client) => Promise<void>): void {
  cron.schedule('0 0 * * *', async () => {
    try {
      await rebuildAndUpdate(client);
    } catch (err) {
      console.error('Scheduled midnight refresh failed:', err);
    }
  });
}
