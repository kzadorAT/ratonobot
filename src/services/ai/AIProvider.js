export default class AIProvider {
  async generateResponse(messages, options = {}) {
    throw new Error('generateResponse() debe ser implementado por la subclase');
  }

  async analyzeIntent(message) {
    throw new Error('analyzeIntent() debe ser implementado por la subclase');
  }

  async listModels() {
    throw new Error('listModels() debe ser implementado por la subclase');
  }

  async selectModel(modelId) {
    throw new Error('selectModel() debe ser implementado por la subclase');
  }

  /**
   * Libera recursos y cierra conexiones del proveedor IA.
   * @returns {Promise<void>}
   */
  async shutdown() {
    // Opcional, override en subclases
  }
}
