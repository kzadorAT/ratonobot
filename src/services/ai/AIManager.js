import CrofAIProvider from './CrofAIProvider.js';
// Aquí se pueden importar más proveedores en el futuro

class AIManager {
  constructor() {
    this.providers = {};
  }

  /**
   * Registra un proveedor IA con un nombre clave
   * @param {string} name
   * @param {AIProvider} provider
   */
  registerProvider(name, provider) {
    this.providers[name] = provider;
  }

  /**
   * Obtiene un proveedor IA por nombre
   * @param {string} name
   * @returns {AIProvider}
   */
  getProvider(name) {
    return this.providers[name];
  }

  /**
   * Lista los nombres de proveedores registrados
   * @returns {string[]}
   */
  listProviders() {
    return Object.keys(this.providers);
  }
}

const aiManager = new AIManager();

// Registrar proveedor CrofAI por defecto
aiManager.registerProvider('crofAI', new CrofAIProvider());

// Aquí se pueden registrar más proveedores:
// aiManager.registerProvider('openrouter', new OpenRouterProvider());
// aiManager.registerProvider('lmstudio', new LMStudioProvider());

export default aiManager;
