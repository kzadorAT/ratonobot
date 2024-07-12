const { setupDiscordHandlers, login } = require('./modules/discordHandler');
const { fetchSearchResults } = require('./scrapers/googleScraper');
const {
    loadModel,
    getEmbedding,
    cosineSimilarity,
    analyzeIntent,
    generateResponse,
    extractMusicKeywords
} = require('./modules/lmHandler');
require('dotenv').config();

setupDiscordHandlers({
    analyzeIntent,
    fetchSearchResults,
    generateResponse,
    getEmbedding,
    cosineSimilarity,
    extractMusicKeywords,
    loadModel
});

login(process.env.DISCORD_TOKEN);