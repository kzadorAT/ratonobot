import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import logger from '../logger.js';
import { promisify } from 'util';

const execAsync = promisify(exec);

class MCPHandler {
    constructor() {
        this.servers = {};
        this.tools = {};
        this.loadConfig();
    }

    loadConfig() {
        try {
            const configPath = path.join(process.cwd(), 'src/services/mcp/mcp_config.json');
            if (!fs.existsSync(configPath)) {
                logger.warn('No se encontró archivo de configuración MCP');
                return;
            }
            
            const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            this.servers = config.mcpServers || {};
            
            // Mostrar servidores configurados
            const serverCount = Object.keys(this.servers).length;
            logger.info(`Configuración MCP cargada - ${serverCount} servidor(es) disponible(s):`);
            
            Object.entries(this.servers).forEach(([name, config]) => {
                logger.info(`- ${name}: ${config.command} ${config.args.join(' ')}`);
                if (Object.keys(config.env || {}).length > 0) {
                    logger.info('  Variables de entorno:', config.env);
                }
            });
        } catch (error) {
            logger.error('Error al cargar configuración MCP:', error);
        }
    }

    async executeTool(serverName, toolName, args) {
        if (!this.servers[serverName]) {
            throw new Error(`Servidor MCP ${serverName} no configurado`);
        }

        const server = this.servers[serverName];
        try {
            // Construir comando con argumentos
            const cmd = `${server.command} ${server.args.join(' ')}`;
            
            // Ejecutar comando
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
        } catch (error) {
            logger.error(`Error ejecutando herramienta ${serverName}.${toolName}:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    getAvailableTools() {
        return Object.keys(this.servers).map(server => `${server}.*`);
    }
}

export default new MCPHandler();
