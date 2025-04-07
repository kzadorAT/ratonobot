/**
 * Construye un prompt para la IA combinando contexto Discord y memoria persistente.
 * @param {Object} context - Contexto Discord con fragmentos
 * @param {Object|null} memoryEntity - Entidad de memoria KG del usuario
 * @param {string} userName - Nombre del usuario
 * @returns {string} prompt generado
 */
export function buildPrompt(context, memoryEntity, userName) {
  let prompt = `Estás conversando con ${userName}.\n`;

  if (memoryEntity) {
    prompt += `\nMemoria sobre ${userName}:\n`;
    const observations = memoryEntity.observations || [];
    if (observations.length > 0) {
      for (const obs of observations) {
        prompt += `- ${obs}\n`;
      }
    } else {
      prompt += '(Sin información previa)\n';
    }
  } else {
    prompt += '\n(Sin memoria previa)\n';
  }

  prompt += '\nMensajes recientes del canal:\n';
  for (const msg of context.channelMessages) {
    prompt += `${msg.author.username}: ${msg.content}\n`;
  }

  prompt += '\nMensajes recientes del usuario:\n';
  for (const msg of context.userMessages) {
    prompt += `${msg.author.username}: ${msg.content}\n`;
  }

  prompt += '\nMensajes donde el usuario mencionó al bot:\n';
  for (const msg of context.quotedMentions) {
    prompt += `${msg.author.username}: ${msg.content}\n`;
  }

  prompt += `
Tu tarea:
- Usa la memoria para personalizar tu respuesta.
- Si aprendes algo nuevo sobre ${userName}, recuerda actualizar tu memoria.
- Responde de manera natural y útil.
`;

  return prompt;
}
