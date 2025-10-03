import mcpHandler from '../../services/mcp/mcpHandler.js';
import { buildMcpDecisionPrompt } from '../../services/mcp/mcpPromptBuilder.js';
import { buildContext } from '../utils/contextBuilder.js';
import { getOrCreateUserEntity } from '../../services/memoryKG.js';
import { buildPrompt } from '../utils/promptBuilder.js';
import { summarizeContext } from '../utils/contextSummarizer.js';
import logger from '../../services/logger.js';
import { answerWithReasoning } from '../../services/mcp/index.js';
import TokenCounter from '../../services/tokenCounter.js';
import aiManager from '../../services/ai/AIManager.js';
import config from '../../config.js';

const targetChannelName = 'testing-bot';

let isHandlingMessage = false;

async function handleMessage(message, aiProvider, selectedGuildId = null, selectedChannelId = null) {
  if (message.author.bot || isHandlingMessage) return;

  // Lógica de canal seleccionado (si se ha configurado)
  if (selectedChannelId && message.channel.id !== selectedChannelId) {
    logger.debug(`Mensaje ignorado (canal no seleccionado): ${message.channel.name} (${message.channel.id})`);
    return;
  }

  // Lógica de servidor seleccionado (si se ha configurado)
  if (selectedGuildId && message.guild.id !== selectedGuildId) {
    logger.debug(`Mensaje ignorado (servidor no seleccionado): ${message.guild.name} (${message.guild.id})`);
    return;
  }

  // Mantenemos la lógica original de canal de testing como fallback si no se selecciona un canal específico
  if (!selectedChannelId && message.channel.name !== targetChannelName) {
    return;
  }

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

    // Token counting for final prompt
    let promptTokens = 0;
    let maxTokens = 'Unknown';
    try {
      const tokenCounter = new TokenCounter(aiProvider.modelName);
      promptTokens = tokenCounter.countPromptTokens(finalPrompt);
      logger.info(`Prompt token count: ${promptTokens}`);
      maxTokens = aiManager.getMaxContextLength(aiProvider.modelName);
      if (maxTokens !== 'Unknown') {
        const maxNum = parseInt(maxTokens.replace(/K$/, '000').replace(/M$/, '000000') || 0);
        if (promptTokens > maxNum) {
          logger.warn(`Prompt token count ${promptTokens} exceeds model's max context length ${maxTokens}`);
        }
      }
    } catch (error) {
      logger.warn('Error in token counting for prompt:', error.message);
    }

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
      logger.info('La IA decidió usar MCP, iniciando razonador iterativo');
      response = await answerWithReasoning(message.content);
      logger.info('Respuesta final del razonador:\n' + response);
      // For MCP path, token counting is not integrated yet (per scope limits)
      await sendLongMessage(message.channel, response, startTime);
    } else {
      logger.info('La IA decidió NO usar un MCP, generando respuesta con resumen y mensaje actual');
      response = await aiProvider.generateResponse([
        { role: 'user', content: finalPrompt }
      ]);
      logger.info('Respuesta final sin MCP:\n' + response);

      // Token counting for response in non-MCP path
      let responseTokens = 0;
      let totalTokens = 0;
      try {
        const tokenCounter = new TokenCounter(aiProvider.modelName);
        responseTokens = tokenCounter.countTokens(response);
        logger.info(`Response token count: ${responseTokens}`);
        totalTokens = promptTokens + responseTokens;
        logger.info(`Total tokens used: ${totalTokens}`);
      } catch (error) {
        logger.warn('Error in token counting for response:', error.message);
      }

      const duration = Date.now() - startTime;
      await sendLongMessage(message.channel, response, duration, { promptTokens, responseTokens, totalTokens });
      return; // Early return for non-MCP path
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

async function sendLongMessage(channel, content, durationOrStartTime, tokenInfo = null) {
  let duration;
  if (typeof durationOrStartTime === 'number') {
    duration = durationOrStartTime;
  } else {
    duration = Date.now() - durationOrStartTime;
  }
  let cleanedContent = extractAndLogThinking(content, duration);
  if (tokenInfo && config.showTokenCount) {
    cleanedContent += `\n\nTokens: Prompt: ${tokenInfo.promptTokens}, Response: ${tokenInfo.responseTokens}, Total: ${tokenInfo.totalTokens}`;
  }
  const chunks = splitMessage(cleanedContent);
  for (const chunk of chunks) {
    if (chunk.length === 0) continue;
    try {
      await channel.send(chunk);
      await new Promise(res => setTimeout(res, 500)); // pequeña pausa para evitar rate limit
    } catch (error) {
      logger.warn('Error enviando fragmento Discord:', error.message);
    }
  }
}

export { handleMessage, sendLongMessage };
