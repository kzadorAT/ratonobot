import AIProvider from './AIProvider.js';
import aiProvider from '../aiProvider.js'; // singleton con instancias OpenAI
import logger from '../logger.js';

const CROFAI_MODELS = [
  'llama3-8b',
  'llama3.1-8b',
  'llama3.3-70b',
  'llama3.2-1b',
  'llama3-70b',
  'llama3.1-405b',
  'llama3.1-tulu3-405b',
  'deepseek-r1',
  'deepseek-v3',
  'deepseek-v3-0324',
  'deepseek-r1-distill-llama-70b',
  'deepseek-r1-distill-qwen-32b',
  'qwen-qwq-32b',
  'gemma-3-27b-it',
  'llama-4-scout-131k'
];

export default class CrofAIProvider extends AIProvider {
  constructor(defaultModel = 'llama3-70b') {
    super();
    this.providerName = 'CrofAI';
    this.modelName = defaultModel;
    this.client = aiProvider.getProvider('crofAI');
  }

  async generateResponse(messages, options = {}) {
    try {
      const completion = await this.client.chat.completions.create({
        model: this.modelName,
        messages,
        ...options
      });
      return completion.choices[0].message.content;
    } catch (error) {
      logger.error('Error en CrofAI generateResponse:', error);
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
    return CROFAI_MODELS.map(id => ({ id }));
  }

  async selectModel(modelId) {
    this.modelName = modelId;
  }
}
