import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import logger from '../logger.js';
import { promisify } from 'util';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const execAsync = promisify(exec);

/**
 * @typedef {Object} ToolMetadata
 * @property {string} name
 * @property {string} description
 * @property {Object} inputSchema
 * @property {string} server
 */

/**
 * Manejador de conexiones MCP con soporte para SDK
 * @typedef {import('@modelcontextprotocol/sdk').Server} MCPServer
 * @typedef {Object} MCPServerConfig
 * @property {string} command
 * @property {string[]} args 
 * @property {Object} env
 */
class MCPHandler {
    constructor() {
        /** @type {Map<string, ToolMetadata>} */
        this.toolCache = new Map();
        
        /** @type {Map<string, Client|MCPServerConfig>} */ 
        this.servers = new Map();
        
        /** @type {Object.<string, MCPServerConfig>} */
        this.serverConfigs = {};
    }

    async init() {
        await this.loadConfig();
        await this.discoverTools();
        logger.info(`MCPHandler iniciado con ${this.toolCache.size} herramientas cargadas`);
    }

    async loadConfig() {
        try {
            const configPath = path.join(process.cwd(), 'src/modules/mcp/mcp_config.json');
            if (!fs.existsSync(configPath)) {
                logger.warn('No se encontró archivo de configuración MCP');
                return;
            }
            
            const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            this.serverConfigs = config.mcpServers || {};
            
            // Conectar usando SDK
            for (const [name, serverConfig] of Object.entries(this.serverConfigs)) {
                try {
                    const client = new Client(
                        {
                            name: `mcp-client-${name}`,
                            version: '1.0.0'
                        },
                        {
                            capabilities: {
                                tools: {}
                            }
                        }
                    );
                    
                    const transport = new StdioClientTransport({
                        command: serverConfig.command,
                        args: serverConfig.args,
                        env: {
                            ...process.env,
                            ...(serverConfig.env || {})
                        }
                    });
                    
                    await client.connect(transport);
                    this.servers[name] = client;
                    logger.info(`Conectado al servidor MCP ${name}`);
                } catch (error) {
                    logger.error(`Error conectando al servidor ${name}:`, error);
                    // Mantener compatibilidad con método antiguo
                    this.servers[name] = serverConfig;
                }
            }
        } catch (error) {
            logger.error('Error al cargar configuración MCP:', error);
        }
    }

    /**
     * Ejecuta una herramienta MCP usando SDK o fallback CLI
     * @param {string} serverName - Nombre del servidor MCP
     * @param {string} toolName - Nombre de la herramienta
     * @param {Object} args - Argumentos para la herramienta
     * @returns {Promise<{success: boolean, result?: any, error?: string}>}
     */
    async executeTool(serverName, toolName, args, attempt = 0) {
        // Limpiar nombre de servidor (remover prefijos)
        const cleanServerName = serverName.replace(/^herramienta-/, '');
        
        if (!this.servers[cleanServerName]) {
            const available = Object.keys(this.servers).join(', ');
            const error = {
                message: `Servidor MCP '${serverName}' no encontrado`,
                suggestion: `Servidores disponibles: ${available}`,
                remainingAttempts: 2 - attempt
            };
            throw error;
        }

        const server = this.servers[cleanServerName];
        if (!server) {
            throw new Error(`Servidor ${cleanServerName} no disponible`);
        }
        
        try {
            // Si es una instancia del Client
            if (server instanceof Client) {
                const response = await server.callTool({
                    name: toolName,
                    arguments: args
                });
                return {
                    success: true,
                    result: response.content[0]?.text || response.content
                };
            }
            // Fallback al método CLI
            else {
                const cmd = `${server.command} ${server.args.join(' ')}`;
                const { stdout, stderr } = await execAsync(cmd, {
                    env: {
                        ...process.env,
                        ...server.env,
                        MCP_TOOL_NAME: toolName,
                        MCP_TOOL_ARGS: JSON.stringify(args)
                    }
                });

                if (stderr) {
                    logger.error(`Error en servidor ${serverName}: ${stderr}`);
                    return { success: false, error: stderr };
                }

                return { 
                    success: true,
                    result: stdout 
                };
            }
        } catch (error) {
            logger.error(`Error ejecutando herramienta ${serverName}.${toolName}:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async discoverTools() {
        for (const [serverName, server] of Object.entries(this.servers)) {
            try {
                if (server instanceof Client) {
                    const response = await server.listTools();
                    if (!response || !response.tools) {
                        logger.warn(`El servidor ${serverName} no devolvió herramientas`);
                        continue;
                    }

                    const tools = Array.isArray(response.tools) ? response.tools : [];
                    tools.forEach(tool => {
                        this.toolCache.set(tool.name, {
                            name: tool.name,
                            description: tool.description,
                            inputSchema: tool.inputSchema || {},
                            server: serverName
                        });
                    });
                    logger.info(`Descubiertas ${tools.length} herramientas en ${serverName}`);
                }
            } catch (error) {
                logger.error(`Error descubriendo herramientas en ${serverName}:`, error);
            }
        }
    }

    getAvailableTools() {
        return Array.from(this.toolCache.values());
    }
}

const handler = new MCPHandler();
handler.init().catch(err => {
    logger.error('Error inicializando MCPHandler:', err);
});

export default handler;
