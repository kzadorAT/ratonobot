const express = require('express');
const app = express();
app.use(express.json());

const { setupDiscordHandlers, login } = require('./modules/discordHandler');
const { fetchSearchResults } = require('./scrapers/googleScraper');
const {
    loadModel,
    getEmbedding,
    cosineSimilarity,
    analyzeIntent,
    generateResponse,
    extractMusicKeywords,
    getAvailableModels
} = require('./modules/lmHandler');
const readline = require('readline');
const aiProvider = require('./modules/aiProvider');
require('dotenv').config();

app.post('/select-ai', (req, res) => {
  const { aiName } = req.body;
  const ai = aiProvider.getProvider(aiName);
  if (ai) {
    res.json({ success: true, ai });
  } else {
    res.status(404).json({ success: false, message: 'AI not found' });
  }
});

async function selectProvider() {
  const providers = ['LM Studio', 'crofAI'];
  console.log('Proveedores disponibles:');
  providers.forEach((provider, index) => {
    console.log(`${index + 1}. ${provider}`);
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question('Seleccione un proveedor (número): ', (answer) => {
      const selectedIndex = parseInt(answer) - 1;
      if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= providers.length) {
        console.error('Selección inválida.');
        process.exit(1);
      }
      rl.close();
      resolve(providers[selectedIndex]);
    });
  });
}

async function selectModel() {
  try {
    const models = await getAvailableModels();
    if (models.length === 0) {
      console.error('No se encontraron modelos disponibles.');
      process.exit(1);
    }

    console.log('Modelos disponibles:');
    models.forEach((model, index) => {
      console.log(`${index + 1}. ${model.id}`);
    });

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      rl.question('Seleccione un modelo (número): ', (answer) => {
        const selectedIndex = parseInt(answer) - 1;
        if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= models.length) {
          console.error('Selección inválida.');
          process.exit(1);
        }
        rl.close();
        resolve(models[selectedIndex]);
      });
    });
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.error('Error: El servidor de LM Studio no está disponible.');
    } else {
      console.error('Error al obtener la lista de modelos:', error.message);
    }
    process.exit(1);
  }
}

async function selectCrofAIModel() {
  const models = ['llama3-8b', 'llama3.1-8b', 'llama3.3-70b', 'llama3.2-1b', 'llama3-70b', 'llama3.1-405b', 'llama3.1-tulu3-405b', 'deepseek-r1', 'deepseek-v3', 'deepseek-v3-0324', 'deepseek-r1-distill-llama-70b', 'deepseek-r1-distill-qwen-32b', 'qwen-qwq-32b', 'gemma-3-27b-it'];
  console.log('Modelos disponibles de CrofAI:');
  models.forEach((model, index) => {
    console.log(`${index + 1}. ${model}`);
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question('Seleccione un modelo (número): ', (answer) => {
      const selectedIndex = parseInt(answer) - 1;
      if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= models.length) {
        console.error('Selección inválida.');
        process.exit(1);
      }
      rl.close();
      resolve(models[selectedIndex]);
    });
  });
}

async function main() {
  const selectedProvider = await selectProvider();
  let selectedModel;
  if (selectedProvider === 'LM Studio') {
    selectedModel = await selectModel();
    await loadModel(selectedModel.id);
  } else if (selectedProvider === 'crofAI') {
    selectedModel = await selectCrofAIModel();
    console.log(`Usando crofAI con el modelo ${selectedModel}.`);
  }

  setupDiscordHandlers({
    analyzeIntent,
    fetchSearchResults,
    generateResponse,
    getEmbedding,
    cosineSimilarity,
    extractMusicKeywords,
    loadModel,
    selectedProvider,
    selectedModel
  });

  login(process.env.DISCORD_TOKEN);
}

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

main();