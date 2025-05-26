import CrofAIProvider from './CrofAIProvider.js';
import LMStudioProvider from './LMStudioProvider.js';
import logger from '../logger.js';

class AIManager {
  constructor() {
    this.providers = {};
    logger.info('Inicializando AIManager');
  }

  registerProvider(name, provider) {
    logger.info(`Registrando proveedor: ${name}`);
    this.providers[name] = provider;
  }

  getProvider(name) {
    logger.info(`Solicitando proveedor: ${name}`);
    const provider = this.providers[name];
    if (!provider) {
      logger.error(`Proveedor no encontrado: ${name}`);
      throw new Error(`Proveedor no encontrado: ${name}`);
    }
    return provider;
  }

  listProviders() {
    const providers = Object.keys(this.providers);
    logger.info(`Proveedores disponibles: ${providers.join(', ')}`);
    return providers;
  }
}

const aiManager = new AIManager();

try {
  logger.info('Registrando proveedores de IA...');
  aiManager.registerProvider('CrofAI', new CrofAIProvider());
  aiManager.registerProvider('LMStudio', new LMStudioProvider());
  logger.info('Proveedores de IA registrados exitosamente');
} catch (error) {
  logger.error('Error al registrar proveedores de IA:', error);
  throw error;
}

export default aiManager;
