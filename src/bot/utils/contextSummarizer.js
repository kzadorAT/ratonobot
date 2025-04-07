/**
 * Pide a la IA que resuma el contexto sin responder preguntas.
 * @param {Object} aiProvider - Proveedor IA
 * @param {string} contextText - Texto del contexto (historial + memoria)
 * @returns {Promise<string>} resumen generado
 */
export async function summarizeContext(aiProvider, contextText) {
  const prompt = `
Dado el siguiente historial y memoria, extrae solo la información relevante para entender al usuario y el contexto, sin responder ninguna pregunta.

Historial y memoria:
${contextText}

Devuelve un resumen breve y estructurado, sin responder preguntas, solo contexto.
`;

  try {
    const summary = await aiProvider.generateResponse([
      { role: 'user', content: prompt }
    ]);
    return summary.trim();
  } catch (error) {
    console.warn('Error resumiendo contexto:', error.message);
    return '';
  }
}
