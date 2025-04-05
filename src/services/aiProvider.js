import { OpenAI } from 'openai';
import logger from './logger.js';

class AIProvider {
  constructor() {
    this.providers = {
      'crofAI': new OpenAI({
        baseURL: 'https://ai.nahcrof.com/v2',
        apiKey: process.env.CROFAI_API_KEY || 'optional-api-key'
      })
    };
  }

  getProvider(name) {
    return this.providers[name];
  }
}

export default new AIProvider();
