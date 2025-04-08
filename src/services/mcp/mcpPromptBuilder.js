import mcpHandler from './mcpHandler.js';

/**
 * Construye un prompt para que la IA decida si debe usar un MCP.
 * @param {string} userMessage
 * @returns {Promise<string>} prompt generado
 */
export async function buildMcpDecisionPrompt(userMessage) {
  const servers = mcpHandler.servers || {};
  let toolsList = '';

  for (const [serverName, serverConfig] of Object.entries(servers)) {
    if (!serverConfig.tools) continue;
    for (const tool of serverConfig.tools) {
      toolsList += `- ${serverName}.${tool.name}: ${tool.description || 'Sin descripción'}\n`;

      if (tool.inputSchema && tool.inputSchema.properties) {
        const props = tool.inputSchema.properties;
        const required = tool.inputSchema.required || [];

        toolsList += `  Argumentos requeridos:\n`;
        for (const key of required) {
          const prop = props[key];
          toolsList += `    - ${key} (${prop.type}): ${prop.description || ''}\n`;
        }

        const optionalKeys = Object.keys(props).filter(k => !required.includes(k));
        if (optionalKeys.length > 0) {
          toolsList += `  Argumentos opcionales:\n`;
          for (const key of optionalKeys) {
            const prop = props[key];
            toolsList += `    - ${key} (${prop.type}): ${prop.description || ''}\n`;
          }
        }
      }
    }
  }

  const prompt = `
Mensaje del usuario:
"${userMessage}"

Herramientas disponibles:
${toolsList || 'Ninguna herramienta registrada.'}

IMPORTANTE:
- Usa exactamente los nombres de MCP y herramientas listados arriba, sin modificarlos.
- En el JSON, "mcpName" debe ser solo el nombre del servidor (ej: "browser-use").
- En el JSON, "toolName" debe ser solo el nombre de la herramienta (ej: "run_browser_agent").

¿Debo usar alguna herramienta? Responde en JSON con el siguiente formato:

{
  "useMcp": true/false,
  "mcpName": "nombre del MCP",
  "toolName": "nombre de la herramienta",
  "args": { argumentos para la herramienta },
  "responseTemplate": "plantilla para integrar la respuesta del MCP, usa {{mcpResult}} como marcador"
}

Si no es necesario usar un MCP, responde con:

{
  "useMcp": false
}
`;

  return prompt;
}
