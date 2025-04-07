/**
 * Construye el contexto basado en mensajes recientes del canal y del usuario.
 * @param {TextChannel} channel - Canal de Discord
 * @param {User} user - Usuario que envió el mensaje
 * @param {Message} currentMessage - Mensaje actual
 * @param {Object} config - Configuración de cantidad de mensajes
 * @returns {Promise<Object>} contexto con fragmentos
 */
export async function buildContext(channel, user, currentMessage, config = {
  channelMessages: 5,
  userMessages: 3,
  quotedMentions: 1
}) {
  const context = {
    channelMessages: [],
    userMessages: [],
    quotedMentions: []
  };

  try {
    const messages = await channel.messages.fetch({ limit: 100 });
    const sorted = Array.from(messages.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp);

    // Mensajes recientes del canal (sin incluir del bot)
    context.channelMessages = sorted
      .filter(m => !m.author.bot && m.id !== currentMessage.id)
      .slice(-config.channelMessages);

    // Mensajes recientes del usuario (incluyendo respuestas del bot)
    context.userMessages = sorted
      .filter(m =>
        (m.author.id === user.id || (m.author.bot && m.mentions.has(user))) &&
        m.id !== currentMessage.id
      )
      .slice(-config.userMessages);

    // Mensajes citados donde el usuario arrobó al bot (incluyendo respuestas del bot)
    context.quotedMentions = sorted
      .filter(m =>
        m.mentions.has(channel.client.user) &&
        (m.author.id === user.id || (m.author.bot && m.mentions.has(user))) &&
        m.id !== currentMessage.id
      )
      .slice(-config.quotedMentions);

  } catch (error) {
    console.warn('Error construyendo contexto Discord:', error.message);
  }

  return context;
}
