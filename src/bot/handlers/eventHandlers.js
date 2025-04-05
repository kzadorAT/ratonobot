import { ActivityType, REST, Routes } from 'discord.js';
import 'dotenv/config';
import logger from '../../services/logger.js';

const commands = [
  {
    name: 'detect-bots',
    description: 'Activa o desactiva la detección de mensajes de otros bots.'
  }
];

let detectBots = false;

export function setupEventHandlers(client) {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

  client.once('ready', async () => {
    logger.info(`Logged in as ${client.user.tag}!`);
    client.user.setActivity('testing-bot', { type: ActivityType.Watching });

    try {
      logger.info('Registrando comandos slash globalmente...');
      await rest.put(
        Routes.applicationCommands(process.env.APP_ID),
        { body: commands }
      );
      logger.info('Comandos slash registrados exitosamente.');
    } catch (error) {
      logger.error('Error al registrar comandos slash:', error);
    }
  });

  client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    if (interaction.commandName === 'detect-bots') {
      detectBots = !detectBots;
      const message = `Detección de bots ${detectBots ? 'activada' : 'desactivada'}.`;
      logger.info(message);
      console.log(message);
      await interaction.reply(message);
    }
  });
}
