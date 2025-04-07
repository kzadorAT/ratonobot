import mcpHandler from '../../services/mcp/mcpHandler.js';
import logger from '../../services/logger.js';

const targetChannelName = 'testing-bot';

let isHandlingMessage = false;

async function handleMessage(message, aiProvider) {
  if (message.author.bot || isHandlingMessage) return;
  if (message.channel.name !== targetChannelName) return;

  try {
    isHandlingMessage = true;
    const startTime = Date.now();

    const intent = await aiProvider.analyzeIntent(message.content);
    let response;

    if (intent.requiresMcp) {
      try {
        const result = await mcpHandler.executeTool(
          intent.suggestedMcpTool.server,
          intent.suggestedMcpTool.tool,
          intent.mcpArgs || {}
        );

        response = result.success
          ? `✅ ${result.result || 'Operación exitosa'}`
          : `❌ Error: ${result.error || 'Desconocido'}`;
      } catch (error) {
        response = `❌ Error al ejecutar herramienta MCP: ${error.message}`;
        logger.error('Error en herramienta MCP:', error);
      }
    } else {
      response = await aiProvider.generateResponse([
        { role: 'user', content: message.content }
      ]);
    }

    const duration = Date.now() - startTime;
    await sendLongMessage(message.channel, response, duration);
  } catch (error) {
    logger.error('Error al procesar el mensaje:', error);
    await sendLongMessage(message.channel, 'Lo siento, hubo un error al procesar tu mensaje.');
  } finally {
    isHandlingMessage = false;
  }
}

function splitMessage(content, maxLength = 2000) {
  const chunks = [];
  while (content.length > maxLength) {
    let chunk = content.substring(0, maxLength);
    const lastNewline = chunk.lastIndexOf('\n');
    if (lastNewline > -1) {
      chunk = chunk.substring(0, lastNewline);
    }
    chunks.push(chunk);
    content = content.substring(chunk.length);
  }
  chunks.push(content);
  return chunks;
}

function extractAndLogThinking(content, duration) {
  const thinkingMatch = content.match(/<think>([\s\S]*?)<\/think>/);
  if (thinkingMatch) {
    const thinkingText = thinkingMatch[1].trim();
    logger.info(`Thinking:\n${thinkingText}`, { duration });
    return content.replace(thinkingMatch[0], '').trim();
  }
  return content;
}

async function sendLongMessage(channel, content, duration) {
  const cleanedContent = extractAndLogThinking(content, duration);
  const chunks = splitMessage(cleanedContent);
  for (const chunk of chunks) {
    await channel.send(chunk);
  }
}

export { handleMessage, sendLongMessage };
