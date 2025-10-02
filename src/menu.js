import aiManager from './services/ai/AIManager.js';
import { select } from '@inquirer/prompts';
import logger from './services/logger.js';

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
