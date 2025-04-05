import fs from 'fs';
import path from 'path';
import logger from '../logger.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

class MCPHandler {
  constructor() {
    this.servers = {};
    this.clients = {};
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

      const serverCount = Object.keys(this.servers).length;
      logger.info(`Configuración MCP cargada - ${serverCount} servidor(es) disponible(s):`);

      Object.entries(this.servers).forEach(([name, cfg]) => {
        logger.info(`- ${name}: ${cfg.command} ${cfg.args.join(' ')}`);
        if (cfg.env && Object.keys(cfg.env).length > 0) {
          logger.info('  Variables de entorno:', cfg.env);
        }
      });
    } catch (error) {
      logger.error('Error al cargar configuración MCP:', error);
    }
  }

  async getClient(serverName) {
    if (this.clients[serverName]) {
      return this.clients[serverName];
    }

    const server = this.servers[serverName];
    if (!server) {
      throw new Error(`Servidor MCP ${serverName} no configurado`);
    }

    const transport = new StdioClientTransport({
      command: server.command,
      args: server.args,
      env: { ...process.env, ...(server.env || {}) }
    });

    const client = new Client(
      {
        name: `client-${serverName}`,
        version: '1.0.0'
      },
      {
        capabilities: {
          prompts: {},
          resources: {},
          tools: {}
        }
      }
    );

    await client.connect(transport);
    this.clients[serverName] = client;
    return client;
  }

  async executeTool(serverName, toolName, args) {
    try {
      const client = await this.getClient(serverName);
      const result = await client.callTool({
        name: toolName,
        arguments: args
      });

      return {
        success: true,
        result
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
