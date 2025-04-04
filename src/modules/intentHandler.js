import fs from 'fs';
import path from 'path';
import logger from './logger.js';
import aiProvider from './aiProvider.js';
import mcpHandler from './mcp/mcpHandler.js';

function extractJsonFromText(text) {
    // Busca el primer bloque JSON válido en el texto
    const jsonRegex = /{(?:[^{}]|{(?:[^{}]|{[^{}]*})*})*}/;
    const match = text.match(jsonRegex);
    
    if (!match) {
        logger.debug('No se encontró JSON en el texto');
        return null;
    }
    
    try {
        const parsed = JSON.parse(match[0]);
        logger.debug('JSON extraído exitosamente', {json: parsed});
        return parsed;
    } catch (e) {
        logger.debug('JSON extraído pero inválido', { 
            extracted: match[0],
            error: e.message
        });
        return null;
    }
}

class IntentHandler {
    constructor(providers) {
        this.providers = providers;
        this.mcpDetectors = [
            this.detectMcpTools.bind(this)
        ];
        this.availableTools = this.loadAvailableTools();
    }

    loadAvailableTools() {
        try {
            const configPath = path.join(process.cwd(), 'src/modules/mcp/mcp_config.json');
            if (!fs.existsSync(configPath)) return [];
            
            const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            return Object.keys(config.mcpServers || {}).map(name => ({
                name: name.replace('herramienta-', ''),
                server: name
            }));
        } catch (error) {
            logger.error('Error loading MCP tools:', {
                error: error.message,
                stack: error.stack
            });
            return [];
        }
    }

    async detectMcpTools(message, intentAnalysis = {}, context = {}, attempt = 1) {
        // Marcar que este detector usa contexto
        if (!this.detectMcpTools.usesContext) {
            this.detectMcpTools.usesContext = true;
        }
        try {
            // Obtener herramientas disponibles del MCPHandler
            const availableTools = Array.from(mcpHandler.toolCache.values());
            
            if (availableTools.length === 0) {
                logger.debug('No hay herramientas MCP disponibles');
                return { required: false };
            }

            // Crear lista de herramientas para el prompt
            const toolsList = availableTools.map(t => ({
                name: t.name,
                server: t.server,
                description: t.description,
                parameters: t.inputSchema?.properties || {}
            }));
            
            let prompt;
            const contextInfo = context.discord ? `
Contexto de conversación:
- Mensajes anteriores: ${context.discord.priorMessages.map(m => m.content).join('\n- ')}
- Historial del usuario: ${context.discord.userMessages.map(m => m.content).join('\n- ')}
` : 'Sin contexto disponible';

            if (attempt === 1) {
                prompt = `Analiza este mensaje considerando el contexto para identificar herramientas MCP.
Mensaje actual: "${message.trim()}"
${contextInfo}

Herramientas disponibles (usa EXACTAMENTE estos nombres):
${JSON.stringify(toolsList, null, 2)}

Considera el contexto de la conversación al seleccionar herramientas y parámetros.

Responde EXCLUSIVAMENTE en este formato JSON válido:
{
  "server": "nombre_servidor", 
  "tool": "nombre_herramienta",
  "args": {
    // Completa los parámetros requeridos según el esquema
    // Incluye cualquier dato relevante del contexto
  }
}
o {"none": true} si no aplica`;
            } else {
                prompt = `ERROR: El formato anterior no fue válido. 
Contexto:
${contextInfo}

Reintenta con este formato EXACTO:
{
  "server": "nombre_servidor",
  "tool": "nombre_herramienta", 
  "args": {
    // Usa información del contexto si es relevante
  }
}
o {"none": true}

Para el mensaje: "${message.trim()}"`;
            }

            logger.debug(`Llamando a la IA (Intento ${attempt})`, { prompt });

            const provider = aiProvider.getProvider('crofAI');
            if (!provider?.chat) {
                logger.warn('Proveedor de IA no disponible para detección MCP');
                return { required: false };
            }
            
            const response = await provider.chat.completions.create({
                model: 'llama3-70b',
                messages: [{ role: 'user', content: prompt }],
                response_format: { type: "json_object" },
                max_tokens: 200,
                temperature: attempt === 1 ? 0.2 : 0.1 // Más estricto en reintento
            });
            
            const responseContent = response.choices[0]?.message?.content?.trim() || '{"none": true}';
            logger.debug(`Respuesta IA (Intento ${attempt})`, {content: responseContent});

            let toolRequest = null;
            let parseError = null;
            
            // Primero intentar parsear directamente
            try {
                toolRequest = JSON.parse(responseContent);
                logger.debug('JSON parseado directamente');
            } catch (error) {
                parseError = error;
                logger.debug('Intentando extraer JSON de respuesta no estructurada');
                toolRequest = extractJsonFromText(responseContent);
                
                if (!toolRequest && attempt < 2) {
                    logger.debug('Reintentando con prompt corregido...');
                    return this.detectMcpTools(message, attempt + 1);
                }
                
                if (!toolRequest) {
                    logger.error('No se pudo obtener JSON válido después de 2 intentos', {
                        response: responseContent,
                        error: parseError.message
                    });
                    return { required: false };
                }
            }

            if (toolRequest.none) {
                return { required: false };
            }

            // Validar estructura de respuesta
            if (!toolRequest.server || !toolRequest.tool || !toolRequest.args) {
                logger.warn('Respuesta de IA no válida', toolRequest);
                return { required: false };
            }

            // Buscar herramienta en cache
            const tool = availableTools.find(t => 
                t.name === toolRequest.tool && t.server === toolRequest.server
            );

            if (tool) {
                return {
                    required: true,
                    tool: {
                        server: tool.server,
                        tool: tool.name,
                        mcpArgs: toolRequest.args
                    }
                };
            }
            return { required: false };
        } catch (error) {
            logger.error('Error al consultar IA', {
                error: error.message,
                stack: error.stack,
                inputMessage: message
            });
            return { required: false };
        }
    }

    async analyzeWithContext(message, context, providerName) {
        logger.debug(`Analyzing message with context: ${message}`);
        try {
            const provider = this.providers[providerName];
            if (!provider) {
                throw new Error(`Provider ${providerName} not found`);
            }

            // Análisis mejorado con contexto
            const baseAnalysis = await this.enhancedIntentAnalysis(message, context);
            logger.debug(`Enhanced intent analysis: ${JSON.stringify(baseAnalysis)}`);
            
            // Verificar si requiere MCP usando contexto
            const mcpResult = await this.checkMcpRequirementsWithContext(
                message, 
                baseAnalysis, 
                context
            );
            
            return {
                ...baseAnalysis,
                requiresMcp: mcpResult.required,
                suggestedMcpTool: mcpResult.tool,
                mcpArgs: mcpResult.tool?.mcpArgs
            };
        } catch (error) {
            logger.error('Error in contextual intent analysis:', error);
            throw error;
        }
    }

    async analyze(message, providerName) {
        // Mantener para compatibilidad
        return this.analyzeWithContext(message, {}, providerName);
    }

    async enhancedIntentAnalysis(message, context) {
        logger.debug('Enhanced analysis using context', {
            message,
            contextSummary: {
                discord: context.discord ? `Messages: ${context.discord.priorMessages.length}` : 'none',
                memory: context.memory ? `Entities: ${context.memory.entities.length}` : 'none'
            }
        });
        
        return {
            isSearchRequest: false,
            keywords: [message],
            contextUsed: true
        };
    }

    async checkMcpRequirementsWithContext(message, intentAnalysis, context) {
        // Primero intentar con detectores que usen contexto
        for (const detector of this.mcpDetectors) {
            if (detector.usesContext) {
                const result = await detector(message, intentAnalysis, context);
                if (result.required) {
                    return result;
                }
            }
        }
        
        // Fallback a detección normal
        return this.checkMcpRequirements(message, intentAnalysis);
    }

    async baseIntentAnalysis(message) {
        // Solo mostramos en consola la herramienta sugerida
        logger.debug('Sugerencia de herramienta MCP', {
            message: message,
            timestamp: new Date().toISOString()
        });
        return {
            isSearchRequest: false,
            keywords: [message]
        };
    }

    async checkMcpRequirements(message, intentAnalysis) {
        for (const detector of this.mcpDetectors) {
            const result = await detector(message, intentAnalysis);
            if (result.required) {
                return result;
            }
        }
        return { required: false, tool: null };
    }

    registerMcpDetector(detector) {
        this.mcpDetectors.push(detector);
        logger.info(`Registered new MCP detector: ${detector.name || 'anonymous'}`);
    }
}

export default IntentHandler;
