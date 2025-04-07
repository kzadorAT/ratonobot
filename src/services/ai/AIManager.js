import CrofAIProvider from './CrofAIProvider.js';
import LMStudioProvider from './LMStudioProvider.js';

class AIManager {
  constructor() {
    this.providers = {};
  }

  registerProvider(name, provider) {
    this.providers[name] = provider;
  }

  getProvider(name) {
    return this.providers[name];
  }

  listProviders() {
    return Object.keys(this.providers);
  }
}

const aiManager = new AIManager();

aiManager.registerProvider('crofai', new CrofAIProvider());
aiManager.registerProvider('lmstudio', new LMStudioProvider());

export default aiManager;
