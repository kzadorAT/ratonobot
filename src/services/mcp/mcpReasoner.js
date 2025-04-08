/**
 * MCP Reasoner: ciclo plan-ejecuta-evalúa-decide-iterar
 * para coordinar llamadas a MCPs y memorias, combinando resultados.
 */

export default class McpReasoner {
  constructor(aiProvider, mcpHandler, memoryHandler) {
    this.aiProvider = aiProvider;       // proveedor LLM (ej. CrofAI)
    this.mcpHandler = mcpHandler;       // manejador para llamar MCPs
    this.memoryHandler = memoryHandler; // manejador para consultar memorias
    this.maxIterations = 5;
  }

  async answerQuestion(userQuestion) {
    let context = [];
    let iteration = 0;
    let finalAnswer = null;

    while (iteration < this.maxIterations) {
      iteration++;
      console.log(`[MCP Reasoner] Iteración ${iteration}`);

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
      const planResponse = await this.aiProvider.generateResponse([{ role: 'user', content: planPrompt }]);
      let plan;
      try {
        plan = JSON.parse(planResponse);
      } catch {
        console.warn("[MCP Reasoner] Error parseando plan, terminando.");
        break;
      }

      console.log("[MCP Reasoner] Plan:", plan);

      if (plan.suficiente) {
        // 2. Formular respuesta final
        const answerPrompt = `
Pregunta del usuario: "${userQuestion}"
Contexto: ${JSON.stringify(context)}

Formula una respuesta final clara y completa para el usuario.
`;
        finalAnswer = await this.aiProvider.generateResponse([{ role: 'user', content: answerPrompt }]);
        break;
      }

      if (plan.accion === "usar_mcp") {
        const mcpResult = await this.mcpHandler.callTool(plan.mcpName, plan.toolName, plan.args);
        context.push({ type: "mcp", mcpName: plan.mcpName, toolName: plan.toolName, args: plan.args, result: mcpResult });
      } else if (plan.accion === "consultar_memoria") {
        const memoryResult = await this.memoryHandler.query(plan.args);
        context.push({ type: "memory", args: plan.args, result: memoryResult });
      } else {
        console.log("[MCP Reasoner] Sin acción, terminando.");
        break;
      }
    }

    return finalAnswer || "No pude obtener suficiente información para responder.";
  }
}
