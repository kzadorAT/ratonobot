import mcpHandler from '../../services/mcp/mcpHandler.js';
import { buildMcpDecisionPrompt } from '../../services/mcp/mcpPromptBuilder.js';
import logger from '../../services/logger.js';

const targetChannelName = 'testing-bot';

let isHandlingMessage = false;

async function handleMessage(message, aiProvider) {
  if (message.author.bot || isHandlingMessage) return;
  if (message.channel.name !== targetChannelName) return;

  try {
    isHandlingMessage = true;
    const startTime = Date.now();

    logger.info(`Mensaje recibido: "${message.content}"`);

    const decisionPrompt = await buildMcpDecisionPrompt(message.content);
    logger.info('Prompt para IA (decisión MCP):\n' + decisionPrompt);

    const decisionJson = await aiProvider.generateResponse([
      { role: 'user', content: decisionPrompt }
    ]);

    logger.info('Respuesta JSON de la IA para decisión MCP:\n' + decisionJson);

    let decision;
    try {
      decision = JSON.parse(decisionJson);
    } catch {
      logger.warn('Respuesta IA no es JSON válido, usando flujo normal');
      decision = { useMcp: false };
    }

    let response;

    if (decision.useMcp) {
      logger.info(`La IA decidió usar MCP: ${decision.mcpName}.${decision.toolName}`);
      logger.info(`Argumentos para MCP: ${JSON.stringify(decision.args)}`);

      try {
        const result = await mcpHandler.executeTool(
          decision.mcpName,
          decision.toolName,
          decision.args || {}
        );

        const mcpResult = result.success ? (result.result || '') : `Error: ${result.error || 'desconocido'}`;

        logger.info('Resultado del MCP:\n' + mcpResult);

        if (decision.responseTemplate) {
          response = decision.responseTemplate.replace('{{mcpResult}}', mcpResult);
        } else {
          response = mcpResult;
        }
        logger.info('Respuesta final con MCP integrada:\n' + response);
      } catch (error) {
        response = `❌ Error al ejecutar herramienta MCP: ${error.message}`;
        logger.error('Error en herramienta MCP:', error);
      }
    } else {
      logger.info('La IA decidió NO usar un MCP, generando respuesta normal');
      response = await aiProvider.generateResponse([
        { role: 'user', content: message.content }
      ]);
      logger.info('Respuesta final sin MCP:\n' + response);
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
