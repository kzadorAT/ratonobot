import startServer from './server/index.js';
import startBot from './bot/index.js';
import mcpHandler from './services/mcp/mcpHandler.js';
import { selectProviderAndModel } from './menu.js';
import logger from './services/logger.js';

async function main() {
  try {
    logger.info('Cargando configuración y herramientas MCP...');
    await mcpHandler.loadConfig();

    logger.info('Seleccione el proveedor y modelo de IA...');
    const aiProvider = await selectProviderAndModel();

    logger.info('Iniciando servidor HTTP...');
    await startServer();

    logger.info('Iniciando bot de Discord...');
    await startBot(aiProvider);
  } catch (error) {
    logger.error('Error al iniciar la aplicación:', error);
    process.exit(1);
  }
}

main();
