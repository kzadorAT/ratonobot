import AIProvider from './AIProvider.js';
import aiProvider from '../aiProvider.js'; // singleton con instancias OpenAI
import logger from '../logger.js';
import axios from 'axios';

const CROFAI_API_BASE = 'https://ai.nahcrof.com/v2'; // URL base de la API de CrofAI

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

  formatModelName(name) {
    // Extraer el nombre del modelo después de los dos puntos si existe
    return name.includes(':') ? name.split(':').pop().trim() : name;
  }

  formatPricing(pricing) {
    if (!pricing) return 'No disponible';
    return `Prompt: $${pricing.prompt}/1K | Completion: $${pricing.completion}/1K`;
  }

  formatContextLength(tokens) {
    if (tokens >= 1000) return `${tokens / 1000}K`;
    return tokens.toString();
  }

  async listModels() {
    try {
      const response = await axios.get(`${CROFAI_API_BASE}/models`);
      
      // Extraer el array de modelos de la respuesta
      const modelsData = response.data?.data || [];
      
      return modelsData.map(model => ({
        id: model.id,
        name: model.name,
        description: this.formatModelName(model.name),
        details: {
          provider: model.name.includes(':') ? model.name.split(':')[0].trim() : 'CrofAI',
          contextLength: this.formatContextLength(model.context_length),
          maxCompletion: this.formatContextLength(model.max_completion_tokens),
          pricing: this.formatPricing(model.pricing),
          quantization: model.quantization?.toUpperCase() || 'N/A',
          created: new Date(model.created).toLocaleDateString()
        },
        raw: model // Mantener los datos originales por si se necesitan
      }));
      
    } catch (error) {
      logger.error('Error al obtener modelos:', error.message);
      // En caso de error, devolver una lista básica
      return [
        { 
          id: 'llama3-70b', 
          name: 'Meta: Llama 3 70B',
          description: 'Llama 3 70B',
          details: {
            provider: 'Meta',
            contextLength: '131K',
            maxCompletion: '8K',
            pricing: 'Prompt: $0.00000012/1K | Completion: $0.00000035/1K',
            quantization: 'FP8',
            created: new Date().toLocaleDateString()
          }
        }
      ];
    }
  }

  async selectModel(modelId) {
    this.modelName = modelId;
  }
}
