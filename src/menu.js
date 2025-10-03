import aiManager from './services/ai/AIManager.js';
import { select } from '@inquirer/prompts';
import logger from './services/logger.js';
import { ActivityType } from 'discord.js'; // Añadido para futura compatibilidad si se necesita

export async function selectServer(client) {
  if (!client || !client.isReady()) {
    throw new Error('El cliente de Discord no está listo. No se pueden obtener servidores.');
  }

  const guilds = client.guilds.cache;
  if (guilds.size === 0) {
    logger.warn('El bot no tiene acceso a ningún servidor.');
    return null;
  }

  const guildChoices = Array.from(guilds.values()).map(guild => ({
    name: guild.name,
    value: guild.id,
    description: `ID: ${guild.id} | Miembros: ${guild.memberCount}`
  }));

  const selectedGuildId = await select({
    message: 'Seleccione un servidor:',
    choices: guildChoices
  });

  return selectedGuildId;
}

export async function selectChannel(guildId, client) {
  if (!client || !client.isReady()) {
    throw new Error('El cliente de Discord no está listo. No se pueden obtener canales.');
  }

  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
    throw new Error(`Servidor con ID ${guildId} no encontrado.`);
  }

  const channels = guild.channels.cache.filter(channel => 
    channel.isTextBased() && channel.viewable // Asegura que sea un canal de texto y visible
  );

  if (channels.size === 0) {
    logger.warn(`No se encontraron canales de texto visibles en el servidor: ${guild.name}`);
    return null;
  }

  const channelChoices = Array.from(channels.values()).map(channel => ({
    name: channel.name,
    value: channel.id,
    description: `Tipo: ${channel.type === 0 ? 'Texto' : channel.type === 5 ? 'Anuncios' : 'Otro'} | ID: ${channel.id}`
  }));

  const selectedChannelId = await select({
    message: `Seleccione un canal en "${guild.name}":`,
    choices: channelChoices
  });

  return selectedChannelId;
}

export async function selectProviderAndModel() {
  const providers = aiManager.listProviders();
  
  const providerName = await select({
    message: 'Seleccione un proveedor de IA:',
    choices: providers.map(name => ({
      name,
      value: name
    }))
  });

  const provider = aiManager.getProvider(providerName);
  logger.info(`Obteniendo modelos disponibles para ${providerName}...`);
  
  let models = [];
  try {
    models = await provider.listModels();
    logger.info(`Modelos disponibles: ${models.length}`);
  } catch (error) {
    logger.error('Error al obtener modelos:', error.message);
    throw new Error(`No se pudieron cargar los modelos: ${error.message}`);
  }

  if (!models || models.length === 0) {
    logger.warn('No se encontraron modelos disponibles. Usando modelo predeterminado.');
    return provider; // Retornar el proveedor con el modelo predeterminado
  }

  const modelId = await select({
    message: 'Seleccione un modelo:',
    pageSize: 10,
    searchable: true,
    choices: models.map(model => ({
      name: model.name,
      value: model.id,
      description: [
        `Contexto: ${model.details.contextLength} tokens`,
        `Precio: ${model.details.pricing}`,
        `Quant: ${model.details.quantization}`
      ].join(' | ')
    }))
  });

  await provider.selectModel(modelId);

  return provider;
}
