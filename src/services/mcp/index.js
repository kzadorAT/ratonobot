import mcpHandler from './mcpHandler.js';
import McpReasoner from './mcpReasoner.js';
import * as memoryHandler from '../memoryKG.js';   // Ajustado para import nombrada

let reasoner = null;

/**
 * Inicializa el razonador con el proveedor IA concreto.
 * @param {AIProvider} aiProvider instancia concreta que implemente generateResponse()
 */
export function initReasoner(aiProvider) {
  reasoner = new McpReasoner(aiProvider, mcpHandler, memoryHandler);
}

export async function answerWithReasoning(userQuestion) {
  if (!reasoner) throw new Error('Reasoner no inicializado');
  return await reasoner.answerQuestion(userQuestion);
}
