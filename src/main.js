import 'dotenv/config';
import startServer from './server/index.js';
import { client as discordClient, setSelectedGuildAndChannel, startBot } from './bot/index.js';
import mcpHandler from './services/mcp/mcpHandler.js';
import { initReasoner } from './services/mcp/index.js';
import { selectProviderAndModel, selectServer, selectChannel } from './menu.js';
import logger from './services/logger.js';

async function main() {
  try {
    logger.info('Cargando configuración y herramientas MCP...');
    await mcpHandler.loadConfig();

    logger.info('Seleccione el proveedor y modelo de IA...');
    const aiProvider = await selectProviderAndModel();

    logger.info('Inicializando razonador MCP...');
    initReasoner(aiProvider);

    logger.info('Iniciando servidor HTTP...');
    await startServer();

    logger.info('Iniciando bot de Discord...');
    // Iniciar el bot, pero no esperar a que se conecte completamente aquí
    // La conexión asíncrona y el evento clientReady se manejan dentro de startBot
    startBot(aiProvider); 

    logger.info('Bot de Discord en proceso de inicio. Esperando a que se conecte...');
    
    // Esperar activamente a que el cliente esté listo
    if (!discordClient) {
        logger.error('No se pudo obtener el cliente de Discord.');
        process.exit(1);
    }

    // Creamos una promesa para esperar al evento clientReady
    const clientReadyPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('Tiempo de espera agotado para la conexión del bot de Discord.'));
        }, 30000); // 30 segundos de timeout

        const readyHandler = () => {
            clearTimeout(timeout);
            discordClient.off('clientReady', readyHandler); // Asegurarse de quitar el listener
            resolve();
        };
        
        discordClient.on('clientReady', readyHandler);
        // Si el cliente ya está listo (caso raro si login es muy rápido)
        if (discordClient.isReady()) {
            clearTimeout(timeout);
            resolve();
        }
    });

    await clientReadyPromise;
    logger.info(`Bot de Discord conectado como: ${discordClient.user.tag}`);

    // Ahora que el bot está listo, podemos pedirle que seleccione servidor y canal
    logger.info('Por favor, seleccione un servidor para el bot...');
    const selectedGuildId = await selectServer(discordClient);
    
    let selectedChannelId = null;
    if (selectedGuildId) {
      logger.info(`Servidor seleccionado: ${selectedGuildId}. Ahora, por favor, seleccione un canal...`);
      selectedChannelId = await selectChannel(selectedGuildId, discordClient);
      
      if (selectedChannelId) {
        setSelectedGuildAndChannel(selectedGuildId, selectedChannelId);
        const guild = discordClient.guilds.cache.get(selectedGuildId);
        const channel = guild?.channels.cache.get(selectedChannelId);
        logger.info(`✅ Bot configurado para operar en Servidor: "${guild?.name || selectedGuildId}", Canal: "${channel?.name || selectedChannelId}"`);
      } else {
        logger.warn('⚠️ No se seleccionó un canal. El bot operará en el canal de testing por defecto si está disponible, o en todos los canales donde se le mencione.');
      }
    } else {
      logger.warn('⚠️ No se seleccionó un servidor. El bot operará en todos los servidores y canales donde tenga permisos y donde se le mencione.');
    }

    logger.info('Aplicación iniciada completamente.');

  } catch (error) {
    logger.error('Error al iniciar la aplicación:', error);
    process.exit(1);
  }
}

main();
