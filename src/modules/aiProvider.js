const { OpenAI } = require('openai');

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

module.exports = new AIProvider();
