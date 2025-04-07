import AIProvider from './AIProvider.js';
import aiProvider from '../aiProvider.js'; // singleton con instancias OpenAI
import logger from '../logger.js';

export default class CrofAIProvider extends AIProvider {
  constructor(modelName = 'llama3-70b') {
    super();
    this.modelName = modelName;
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
    // Implementación simple o delegar a un modelo
    return {
      isSearchRequest: false,
      keywords: [],
      requiresMcp: false
    };
  }
}
