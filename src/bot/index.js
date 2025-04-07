import client from './client.js';
import { setupEventHandlers } from './handlers/eventHandlers.js';
import { handleMessage } from './handlers/messageHandler.js';
import aiManager from '../services/ai/AIManager.js';
import 'dotenv/config';
import logger from '../services/logger.js';

export default async function startBot() {
  // Obtener el proveedor IA activo (puede hacerse configurable)
  const aiProvider = aiManager.getProvider('crofAI');

  setupEventHandlers(client);

  client.on('messageCreate', (message) =>
    handleMessage(message, aiProvider)
  );

  client.login(process.env.DISCORD_TOKEN);
  logger.info('Bot de Discord iniciado');
}
