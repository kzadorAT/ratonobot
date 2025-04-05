import fs from 'fs';
import path from 'path';
import logger from '../../services/logger.js';
import aiProvider from '../../services/aiProvider.js';

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
            console.error('Error loading MCP tools:', error);
            return [];
        }
    }

    async detectMcpTools(message) {
        try {
            // Generar lista de herramientas disponibles
            const toolsList = this.availableTools.map(t => 
                `- ${t.name}: Herramienta relacionada con ${t.name}`
            ).join('\n');
            
            const prompt = `¿Este mensaje requiere usar alguna de estas herramientas? 
            Mensaje: "${message}"
            Herramientas: ${this.availableTools.map(t => t.name).join(', ')}
            Responde solo con el nombre de la herramienta o "ninguna".`;
            
            const provider = aiProvider.getProvider('crofAI');
            if (!provider || !provider.chat) {
                logger.warn('Proveedor de IA no disponible, usando fallback');
                return { required: false };
            }
            
            const response = await provider.chat.completions.create({
                model: 'llama3-70b',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 50
            });
            
            const tool = response.choices[0].message.content.trim().toLowerCase();
            logger.info(`IA sugiere herramienta: ${tool}`);
            
            if (tool !== 'ninguna' && this.availableTools.some(t => t.name === tool)) {
                return {
                    required: true,
                    tool: {
                        server: `herramienta-${tool}`,
                        tool: `${tool}_tool`
                    },
                    mcpArgs: {
                        query: message
                    }
                };
            }
            return { required: false };
        } catch (error) {
            console.error('Error al consultar IA:', error);
            return { required: false };
        }
    }

    async analyze(message, providerName) {
        logger.debug(`Analyzing message: ${message}`);
        try {
            const provider = this.providers[providerName];
            if (!provider) {
                throw new Error(`Provider ${providerName} not found`);
            }

            // Análisis básico de intención
            const baseAnalysis = await this.baseIntentAnalysis(message);
            logger.debug(`Base intent analysis: ${JSON.stringify(baseAnalysis)}`);
            
            // Verificar si requiere MCP
            const mcpResult = await this.checkMcpRequirements(message, baseAnalysis);
            logger.debug(`MCP result: ${JSON.stringify(mcpResult)}`);
            
            return {
                ...baseAnalysis,
                requiresMcp: mcpResult.required,
                suggestedMcpTool: mcpResult.tool
            };
        } catch (error) {
            logger.error('Error in intent analysis:', error);
            throw error;
        }
    }

    async baseIntentAnalysis(message) {
        // Solo mostramos en consola la herramienta sugerida
        console.log(`[MCP Sugerencia] La IA debería determinar qué herramienta usar para: "${message}"`);
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
