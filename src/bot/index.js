import { setupAI } from '../services/aiManager.js';
import client from './client.js';
import { setupEventHandlers } from './handlers/eventHandlers.js';
import { handleMessage } from './handlers/messageHandler.js';
import IntentHandler from '../bot/utils/intentHandler.js';
import {
  analyzeIntent,
  generateResponse,
  getEmbedding,
  cosineSimilarity,
  extractMusicKeywords,
  loadModel
} from '../services/lmHandler.js';
import 'dotenv/config';
import logger from '../services/logger.js';

export default async function startBot() {
  const { selectedProvider, selectedModel } = await setupAI();

  const intentHandler = new IntentHandler({
    'LM Studio': { analyzeIntent },
    'crofAI': { analyzeIntent: (message) => ({ isSearchRequest: false, keywords: [], requiresMcp: false }) }
  });

  setupEventHandlers(client);

  client.on('messageCreate', (message) =>
    handleMessage(message, intentHandler, generateResponse, selectedProvider, selectedModel)
  );

  client.login(process.env.DISCORD_TOKEN);
  logger.info('Bot de Discord iniciado');
}
