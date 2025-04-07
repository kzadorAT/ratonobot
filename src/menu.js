import aiManager from './services/ai/AIManager.js';
import { select } from '@inquirer/prompts';

export async function selectProviderAndModel() {
  const providerName = await select({
    message: 'Seleccione un proveedor de IA:',
    choices: aiManager.listProviders().map(name => ({
      name,
      value: name
    }))
  });

  const provider = aiManager.getProvider(providerName);
  const models = await provider.listModels();

  const modelId = await select({
    message: 'Seleccione un modelo:',
    choices: models.map(m => ({
      name: m.description ? `${m.id} - ${m.description}` : m.id,
      value: m.id
    }))
  });

  await provider.selectModel(modelId);

  return provider;
}
