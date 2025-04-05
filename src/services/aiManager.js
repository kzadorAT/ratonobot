import { select } from '@inquirer/prompts';
import readline from 'readline';
import aiProvider from '../services/aiProvider.js';
import logger from '../services/logger.js';
import {
  loadModel,
  getAvailableModels
} from '../services/lmHandler.js';

export async function selectProvider() {
  return await select({
    message: 'Seleccione un proveedor',
    choices: [
      { name: 'LM Studio', value: 'LM Studio' },
      { name: 'crofAI', value: 'crofAI' }
    ]
  });
}

export async function selectModel() {
  try {
    const models = await getAvailableModels();
    if (models.length === 0) {
      logger.error('No se encontraron modelos disponibles.');
      process.exit(1);
    }

    logger.info('Modelos disponibles:');
    models.forEach((model, index) => {
      logger.info(`${index + 1}. ${model.id}`);
    });

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: ''
    });

    rl.on('SIGINT', () => {
      rl.close();
    });

    return new Promise((resolve) => {
      rl.question('Seleccione un modelo (número): ', (answer) => {
        const selectedIndex = parseInt(answer) - 1;
        if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= models.length) {
          logger.error('Selección inválida.');
          process.exit(1);
        }
        rl.close();
        resolve(models[selectedIndex]);
      });
    });
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      logger.error('Error: El servidor de LM Studio no está disponible.');
    } else {
      logger.error('Error al obtener la lista de modelos:', error.message);
    }
    process.exit(1);
  }
}

export async function selectCrofAIModel() {
  const models = ['llama3-8b', 'llama3.1-8b', 'llama3.3-70b', 'llama3.2-1b', 'llama3-70b', 'llama3.1-405b', 'llama3.1-tulu3-405b', 'deepseek-r1', 'deepseek-v3', 'deepseek-v3-0324', 'deepseek-r1-distill-llama-70b', 'deepseek-r1-distill-qwen-32b', 'qwen-qwq-32b', 'gemma-3-27b-it'];
  return await select({
    message: 'Seleccione un modelo',
    choices: models.map(model => ({ name: model, value: model }))
  });
}

export async function setupAI() {
  const selectedProvider = await selectProvider();
  let selectedModel;
  if (selectedProvider === 'LM Studio') {
    selectedModel = await selectModel();
    await loadModel(selectedModel.id);
  } else if (selectedProvider === 'crofAI') {
    selectedModel = await selectCrofAIModel();
    logger.info(`Usando crofAI con el modelo ${selectedModel}.`);
  }

  return { selectedProvider, selectedModel };
}
