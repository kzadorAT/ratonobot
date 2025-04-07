import client from './client.js';
import { setupEventHandlers } from './handlers/eventHandlers.js';
import { handleMessage } from './handlers/messageHandler.js';
import { ActivityType } from 'discord.js';
import 'dotenv/config';
import logger from '../services/logger.js';

let aiProvider = null;

export default async function startBot(provider) {
  aiProvider = provider;

  setupEventHandlers(client);

  client.on('messageCreate', (message) =>
    handleMessage(message, aiProvider)
  );

  client.login(process.env.DISCORD_TOKEN);

  client.once('ready', () => {
    const status = `${aiProvider.providerName}/${aiProvider.modelName}`;
    client.user.setActivity(status, { type: ActivityType.Custom });
    logger.info(`Bot de Discord iniciado con IA: ${status}`);
  });
}

async function shutdown() {
  try {
    logger.info('Cerrando conexión Discord...');
    await client.destroy();
  } catch (error) {
    logger.warn('Error cerrando Discord:', error.message);
  }

  if (aiProvider && typeof aiProvider.shutdown === 'function') {
    try {
      logger.info('Cerrando proveedor IA...');
      await aiProvider.shutdown();
    } catch (error) {
      logger.warn('Error cerrando proveedor IA:', error.message);
    }
  }

  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
