import mcpHandler from '../../services/mcp/mcpHandler.js';
import { buildMcpDecisionPrompt } from '../../services/mcp/mcpPromptBuilder.js';
import { buildContext } from '../utils/contextBuilder.js';
import { getOrCreateUserEntity } from '../../services/memoryKG.js';
import { buildPrompt } from '../utils/promptBuilder.js';
import { summarizeContext } from '../utils/contextSummarizer.js';
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

    // Obtener contexto Discord
    const context = await buildContext(message.channel, message.author, message);

    // Obtener memoria persistente
    const memoryEntity = await getOrCreateUserEntity(message.author.id, message.author.username);

    // Construir prompt enriquecido
    const enrichedPrompt = buildPrompt(context, memoryEntity, message.author.username);

    logger.info('Prompt enriquecido para IA:\n' + enrichedPrompt);

    // Resumir contexto
    const summary = await summarizeContext(aiProvider, enrichedPrompt);

    logger.info('Resumen del contexto generado por IA:\n' + summary);

    // Construir prompt final con resumen + mensaje actual
    const finalPrompt = `
Contexto relevante:
${summary}

Mensaje actual del usuario:
"${message.content}"

Solo responde a la última pregunta o comentario, usando el contexto si es útil.
`;

    logger.info('Prompt final para IA:\n' + finalPrompt);

    // Decidir si usar MCP
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

        let mcpResult;
        if (!result.success) {
          mcpResult = `Error: ${result.error || 'desconocido'}`;
        } else if (typeof result.result === 'object') {
          try {
            mcpResult = JSON.stringify(result.result, null, 2);
          } catch {
            mcpResult = String(result.result);
          }
        } else {
          mcpResult = result.result || '';
        }

        // Limitar longitud del resultado para evitar errores Discord
        if (typeof mcpResult === 'string' && mcpResult.length > 1500) {
          mcpResult = mcpResult.slice(0, 1500) + '...';
        }

        logger.info('Resultado del MCP:\n' + mcpResult);

        if (decision.responseTemplate) {
          response = decision.responseTemplate.replace('{{mcpResult}}', mcpResult);
        } else {
          response = mcpResult;
        }

        // Limitar longitud de la respuesta final también
        if (typeof response === 'string' && response.length > 1800) {
          response = response.slice(0, 1800) + '...';
        }

        logger.info('Respuesta final con MCP integrada:\n' + response);
      } catch (error) {
        response = `❌ Error al ejecutar herramienta MCP: ${error.message}`;
        logger.error('Error en herramienta MCP:', error);
      }
    } else {
      logger.info('La IA decidió NO usar un MCP, generando respuesta con resumen y mensaje actual');
      response = await aiProvider.generateResponse([
        { role: 'user', content: finalPrompt }
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
    if (chunk.length === 0) continue;
    try {
      await channel.send(chunk);
      await new Promise(res => setTimeout(res, 500)); // pequeña pausa para evitar rate limit
    } catch (error) {
      console.warn('Error enviando fragmento Discord:', error.message);
    }
  }
}

export { handleMessage, sendLongMessage };
