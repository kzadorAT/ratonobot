/**
 * MCP Reasoner: ciclo plan-ejecuta-evalúa-decide-iterar
 * para coordinar llamadas a MCPs y memorias, combinando resultados.
 */
import logger from '../logger.js';
import TokenCounter from '../tokenCounter.js';

export default class McpReasoner {
  constructor(aiProvider, mcpHandler, memoryHandler, maxIterations = 5) {
    this.aiProvider = aiProvider;       // proveedor LLM (ej. CrofAI)
    this.mcpHandler = mcpHandler;       // manejador para llamar MCPs
    this.memoryHandler = memoryHandler; // manejador para consultar memorias
    this.maxIterations = maxIterations;
    this.modelName = this.aiProvider.modelName || 'gpt-3.5-turbo';
    this.tokenCounter = new TokenCounter(this.modelName);
  }

  async parseJsonWithRetry(prompt, contextName, maxRetries = 2) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      let thisPromptTokens = 0;
      try {
        thisPromptTokens = this.tokenCounter.countPromptTokens(prompt);
      } catch (error) {
        logger.warn(`[MCP Reasoner] Error counting prompt tokens for ${contextName} (attempt ${attempt + 1}): ${error.message}`);
      }

      const response = await this.aiProvider.generateResponse([{ role: 'user', content: prompt }]);

      let thisResponseTokens = 0;
      try {
        thisResponseTokens = this.tokenCounter.countTokens(response);
      } catch (error) {
        logger.warn(`[MCP Reasoner] Error counting response tokens for ${contextName} (attempt ${attempt + 1}): ${error.message}`);
      }

      try {
        const parsed = JSON.parse(response);
        logger.info(`[Token Counter] ${contextName} successful (attempt ${attempt + 1}) - Prompt tokens: ${thisPromptTokens}, Response tokens: ${thisResponseTokens}, Total: ${thisPromptTokens + thisResponseTokens}`);
        return { parsed, promptTokens: thisPromptTokens, responseTokens: thisResponseTokens };
      } catch (error) {
        if (attempt < maxRetries) {
          logger.warn(`[MCP Reasoner] Error parseando ${contextName} (intento ${attempt + 1}), reintentando...`);
          // Add instruction to fix JSON
          prompt += `\n\nError: La respuesta anterior no es JSON válido. Por favor, devuelve solo JSON válido sin texto adicional.`;
        } else {
          logger.error(`[MCP Reasoner] Error parseando ${contextName} después de ${maxRetries + 1} intentos:`, error.message);
          return { parsed: null, promptTokens: thisPromptTokens, responseTokens: thisResponseTokens };
        }
      }
    }
  }

  async answerQuestion(userQuestion) {
    let context = [];
    let iteration = 0;
    let finalAnswer = null;
    let cumulativeTokens = 0;

    while (iteration < this.maxIterations) {
      iteration++;
      logger.info(`[MCP Reasoner] Iteración ${iteration}`);

      // 1. Planificar: decidir qué hacer a continuación
      const planPrompt = `
Pregunta del usuario: "${userQuestion}"
Contexto actual: ${JSON.stringify(context)}

¿La información es suficiente para responder? (sí/no)
Si no, ¿qué herramienta o memoria deberíamos usar a continuación y con qué parámetros?
Devuelve un JSON con:
{
  "suficiente": true/false,
  "accion": "ninguna" o "usar_mcp" o "consultar_memoria",
  "mcpName": "...",
  "toolName": "...",
  "args": {...},
  "comentario": "explicación breve"
}
`;
      const planResult = await this.parseJsonWithRetry(planPrompt, 'plan');
      cumulativeTokens += planResult.promptTokens + planResult.responseTokens;
      logger.info(`[Token Counter] Iteration ${iteration} - Plan total tokens: ${planResult.promptTokens + planResult.responseTokens}`);
      const plan = planResult.parsed;

      if (!planResult.parsed) {
        logger.warn("[MCP Reasoner] No se pudo parsear plan después de reintentos, terminando.");
        break;
      }

      logger.info("[MCP Reasoner] Plan:", planResult.parsed);

      if (plan.suficiente) {
        // 2. Formular respuesta final
        const answerPrompt = `
        Pregunta del usuario: "${userQuestion}"
        Contexto: ${JSON.stringify(context)}
        
        Formula una respuesta final clara y completa para el usuario.
        `;
        let answerPromptTokens = 0;
        try {
          answerPromptTokens = this.tokenCounter.countPromptTokens(answerPrompt);
        } catch (error) {
          logger.warn(`[MCP Reasoner] Error counting answer prompt tokens: ${error.message}`);
        }
        finalAnswer = await this.aiProvider.generateResponse([{ role: 'user', content: answerPrompt }]);
        let answerResponseTokens = 0;
        try {
          answerResponseTokens = this.tokenCounter.countTokens(finalAnswer);
          logger.info(`[Token Counter] Final Answer - Prompt tokens: ${answerPromptTokens}, Response tokens: ${answerResponseTokens}, Total: ${answerPromptTokens + answerResponseTokens}`);
          cumulativeTokens += answerPromptTokens + answerResponseTokens;
        } catch (error) {
          logger.warn(`[MCP Reasoner] Error counting answer response tokens: ${error.message}`);
        }
        break;
      }

      if (plan.accion === "usar_mcp") {
        const mcpResult = await this.mcpHandler.executeTool(plan.mcpName, plan.toolName, plan.args);
        context.push({ type: "mcp", mcpName: plan.mcpName, toolName: plan.toolName, args: plan.args, result: mcpResult });
      } else if (plan.accion === "consultar_memoria") {
        const memoryResult = await this.memoryHandler.query(plan.args);
        context.push({ type: "memory", args: plan.args, result: memoryResult });
      } else {
        logger.info("[MCP Reasoner] Sin acción, terminando.");
        break;
      }
    }

    logger.info(`[Token Counter] Cumulative total tokens across reasoning process: ${cumulativeTokens}`);
    return finalAnswer || "No pude obtener suficiente información para responder.";
  }
}
