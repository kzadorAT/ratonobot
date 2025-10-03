import AIProvider from './AIProvider.js';
import axios from 'axios';
import logger from '../logger.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const LMSTUDIO_API_URL = 'http://localhost:1234/api/v0';

async function waitForServer(timeoutMs = 10000, intervalMs = 500) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await axios.get(`${LMSTUDIO_API_URL}/models`);
      return true;
    } catch {
      await new Promise(res => setTimeout(res, intervalMs));
    }
  }
  return false;
}

export default class LMStudioProvider extends AIProvider {
  constructor(defaultModel = null) {
    super();
    this.providerName = 'LM Studio';
    this.modelName = defaultModel;
  }

  formatContextLength(tokens) {
    if (tokens >= 1000) return `${tokens / 1000}K`;
    return tokens.toString();
  }

  async generateResponse(messages, options = {}) {
    if (!this.modelName) {
      throw new Error('No hay modelo LM Studio seleccionado');
    }
    try {
      const response = await axios.post(`${LMSTUDIO_API_URL}/chat/completions`, {
        model: this.modelName,
        messages,
        ...options
      });
      return response.data.choices[0].message.content;
    } catch (error) {
      logger.error('Error en LM Studio generateResponse:', error.response?.data || error.message);
      throw error;
    }
  }

  async analyzeIntent(message) {
    return {
      isSearchRequest: false,
      keywords: [],
      requiresMcp: false
    };
  }

  async listModels() {
    try {
      const response = await axios.get(`${LMSTUDIO_API_URL}/models`);
      return response.data.data
        .filter(m => m.type === 'llm')
        .map(m => ({
          id: m.id,
          name: m.name || m.id,
          description: `${m.publisher || 'Unknown'} (${m.state})`,
          details: {
            contextLength: m.context_length ? this.formatContextLength(m.context_length) : 'Unknown'
          }
        }));
    } catch (error) {
      logger.warn('LM Studio no responde, intentando iniciar el servidor...');
      try {
        await execAsync('lms server start');
        const ready = await waitForServer();
        if (!ready) {
          logger.error('LM Studio no inició a tiempo');
          return [];
        }
        const response = await axios.get(`${LMSTUDIO_API_URL}/models`);
        return response.data.data
          .filter(m => m.type === 'llm')
          .map(m => ({
            id: m.id,
            name: m.name || m.id,
            description: `${m.publisher || 'Unknown'} (${m.state})`,
            details: {
              contextLength: m.context_length ? this.formatContextLength(m.context_length) : 'Unknown'
            }
          }));
      } catch (startError) {
        logger.error('Error iniciando LM Studio:', startError.message);
        return [];
      }
    }
  }

  async selectModel(modelId) {
    this.modelName = modelId;
  }

  async getMaxContextLength(modelId) {
    const models = await this.listModels();
    const model = models.find(m => m.id === modelId);
    if (!model) {
      logger.warn(`Modelo ${modelId} no encontrado en LM Studio`);
      return 'Unknown';
    }
    const maxContext = model.details.contextLength;
    logger.info(`Max context length para modelo ${modelId} en LM Studio: ${maxContext}`);
    return maxContext;
  }

  async shutdown() {
    try {
      logger.info('Descargando modelos LM Studio...');
      await execAsync('lms unload --all');
    } catch (error) {
      logger.warn('Error descargando modelos LM Studio:', error.message);
    }

    try {
      logger.info('Deteniendo servidor LM Studio...');
      await execAsync('lms server stop');
    } catch (error) {
      logger.warn('Error deteniendo LM Studio:', error.message);
    }
  }
}
