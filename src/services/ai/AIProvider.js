export default class AIProvider {
  /**
   * Genera una respuesta basada en el historial de mensajes y opciones.
   * @param {Array<{role: string, content: string}>} messages
   * @param {Object} options
   * @returns {Promise<string>}
   */
  async generateResponse(messages, options = {}) {
    throw new Error('generateResponse() debe ser implementado por la subclase');
  }

  /**
   * Analiza la intención de un mensaje.
   * @param {string} message
   * @returns {Promise<Object>} resultado de la intención
   */
  async analyzeIntent(message) {
    throw new Error('analyzeIntent() debe ser implementado por la subclase');
  }
}
