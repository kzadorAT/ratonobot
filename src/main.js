import startServer from './server/index.js';
import startBot from './bot/index.js';
import mcpHandler from './services/mcp/mcpHandler.js';
import { selectProviderAndModel } from './menu.js';

async function main() {
  try {
    console.log('Cargando configuración y herramientas MCP...');
    await mcpHandler.loadConfig();

    console.log('Seleccione el proveedor y modelo de IA...');
    const aiProvider = await selectProviderAndModel();

    console.log('Iniciando servidor HTTP...');
    await startServer();

    console.log('Iniciando bot de Discord...');
    await startBot(aiProvider);
  } catch (error) {
    console.error('Error al iniciar la aplicación:', error);
    process.exit(1);
  }
}

main();
