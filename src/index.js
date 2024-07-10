const { setupDiscordHandlers, login } = require('./modules/discordHanlder');
const { fetchSearchResults } = require('./scrapers/googleScraper');
const {
    loadModel,
    getEmbedding,
    cosineSimilarity,
    analyzeIntent,
    generateResponse
} = require('./modules/lmHandler');
require('dotenv').config();

setupDiscordHandlers({
    analyzeIntent,
    fetchSearchResults,
    generateResponse,
    getEmbedding,
    cosineSimilarity,
    loadModel
});

login(process.env.DISCORD_TOKEN);