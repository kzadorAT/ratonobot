const axios = require('axios');
const { Client, GatewayIntentBits, ActivityType } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
require('dotenv').config();
const { unloadModel } = require('./lmHandler');
const { addMessage, processQueue } = require('./messageQueue');
const { getChannelContext } = require('./channelContext');
const { fetchSearchResults } = require('./searchHandler');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Nombre del canal de Discord al que se enviará la respuesta
const targetChannelName = 'testing-bot';

// Indica si el bot está procesando una solicitud
let isProcessing = false;

// Cola de mensajes
const maxQueueSize = 4;

// Historial de mensajes por canal
const contextSize = 5; // Numero de mensajes a mantener en el contexto

const botEmbeddingLimit = 3; // Numero de mensajes a considerar para la creación del embedding

let model;

async function gatherSearchContext(channel, query, getEmbedding, cosineSimilarity, referenceMessageId){
    const activityLevel = await calculateChannelActivity(channel);
    const messageLimit = Math.min(Math.round(100 * activityLevel), 100);
    const messages = await channel.messages.fetch({ limit: messageLimit });
    const searchContext = [];

    const queryEmbedding = await getEmbedding(query);
    const similarities = [];

    for (const msg of messages.values()) {
        if(msg.author.id !== client.user.id && msg.id !== referenceMessageId) {
            const messageEmbedding = await getEmbedding(msg.content);
            const similarity = cosineSimilarity(queryEmbedding, messageEmbedding);
            similarities.push(similarity);

            if(similarity > calculateDynamicThreshold(similarities)){
                console.log(`Message: ${msg.content} - Similarity: ${similarity} - Author: ${msg.author.displayName}`);
                searchContext.push({
                    role: 'user',
                    content: `${msg.author.displayName}: ${msg.content}`,
                    messageId: msg.id
                });

                const subsequentMessages = await channel.messages.fetch({ after: msg.id, limit: botEmbeddingLimit });
                for(const subMsg of subsequentMessages.values()){
                    searchContext.push({
                        role: subMsg.author.id === client.user.id ? 'assistant' : 'user',
                        content: `${subMsg.author.displayName}: ${subMsg.content}`,
                        messageId: subMsg.id
                    });
                }
            }
        }
    }

    return searchContext;
}

async function handleMessage(message, analyzeIntent, generateResponse, getEmbedding, cosineSimilarity){
    if (message.author.bot) return; // Ignorar mensajes de otros bots

    // Verifica si el mensaje proviene del canal especificado
    if(message.channel.name === targetChannelName){
        // Si el modelo no se ha cargado, ignorar el mensaje
        if(!model){
            message.reply('Loco, no me jodas ahora, esperate un segundo que estoy loading, ja.');
            return;
        }

        const channelId = message.channel.id;
        addMessage(message);
        processQueue(async (msg) => {
            isProcessing = true;
            const context = getChannelContext(channelId);
            const intentAnalysis = await analyzeIntent(msg.content);

            if(intentAnalysis.isSearchRequest){
                console.log('Se encontró una petición de búsqueda');
                // Realizar la búsqueda y obtener los resultados
                const searchResults = await fetchSearchResults(intentAnalysis.keywords.join(' '));

                if(searchResults.length === 0){
                    // Si no se encontró resultados, procesar el mensaje normalmente
                    console.log('No se encontró resultados');
                    const response = await generateResponse(context, msg.content);
                    msg.reply(response);
                }else{
                    // Formatear los resultados para el mensaje de respuesta
                    let searchReply = 'Aquí tienes los resultados de búsqueda:\n';
                    searchResults.slice(0, 3).forEach((result) => {
                        searchReply += `**${result.title}**\n${result.description}\n${result.link}\n\n`;
                    });

                    // Enviar los resultados de la búsqueda
                    await msg.channel.send(searchReply);
                }
            }else{
                const response = await generateResponse(context, msg.content);
                msg.reply(response);
            }
            isProcessing = false;
        });
    } else if (message.content === '!join' && message.member.voice.channel) {
        // Unirse a un canal de voz
        const channel = message.member.voice.channel;
        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: channel.guild.id,
            adapterCreator: channel.guild.voiceAdapterCreator
        });
        
        const player = createAudioPlayer();
        const resource = createAudioResource('./src/audios/no mas dailys.mp3');

        player.play(resource);
        connection.subscribe(player);

        // player.on(AudioPlayerStatus.Idle, () => {
        //     connection.destroy();
        // });

        message.reply('Llego el bot!');
    } else if (message.content === '!leave' && message.member.voice.channel) {
        // Desconectar del canal de voz
        const channel = message.member.voice.channel;
        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: channel.guild.id,
            adapterCreator: channel.guild.voiceAdapterCreator,
        });

        connection.destroy();
        message.reply('Que lástima pero adios...');
    }
}

function setupDiscordHandlers({ analyzeIntent, fetchSearchResults, generateResponse, getEmbedding, cosineSimilarity, loadModel }){
    client.once('ready', async () => {
        console.log(`Logged in as ${client.user.tag}!`);
        client.user.setActivity(`${targetChannelName}`, { type: ActivityType.Watching });
        model = await loadModel();
    });

    client.on('messageCreate', (message) => handleMessage(message, analyzeIntent, generateResponse, getEmbedding, cosineSimilarity));

    process.on('SIGINT', handleShutdown); // Ctrl + C en la terminal
    process.on('SIGTERM', handleShutdown); // Señales de cierre del sistema
}

function handleShutdown(){
    client.user.setActivity('Que lastima pero adiós...', { type: ActivityType.Listening });
    console.log('Cerrando el bot de Discord...');
    unloadModel().then(() => {
        client.destroy();
        process.exit();
    });
}

function login(token){
    client.login(token);
}

async function calculateChannelActivity(channel) {
    const now = Date.now();
    const oneDayAgo = now - (24 * 60 * 60 * 1000);

    // Obtener mensajes de las últimas 24 horas
    const messages = await channel.messages.fetch({ limit: 100, after: oneDayAgo });

    // Calcular métricas
    const uniqueUsers = new Set();
    let totalMessages = 0;
    let messageFrequency = 0;

    messages.forEach(msg => {
        uniqueUsers.add(msg.author.id);
        totalMessages++;
    });

    // Calcular frecuencia de mensajes por hora
    if(messages.size > 0) {
        const firstMessage = messages.last();
        const lastMessage = messages.first();
        const timeDiffHours = (lastMessage.createdTimestamp - firstMessage.createdTimestamp) / (1000 * 60 * 60);
        messageFrequency = totalMessages / Math.max(1, timeDiffHours);
    }

    // Normalizar métricas
    const userScore = Math.min(uniqueUsers.size / 50, 1); // Máximo 50 usuarios
    const messageScore = Math.min(totalMessages / 200, 1); // Máximo 200 mensajes
    const frequencyScore = Math.min(messageFrequency / 20, 1); // Máximo 20 msg/hora

    // Ponderar métricas
    return (userScore * 0.4) + (messageScore * 0.4) + (frequencyScore * 0.2);
}

function calculateDynamicThreshold(similarities) {
    const mean = similarities.reduce((a, b) => a + b, 0) / similarities.length;
    const stdDev = Math.sqrt(similarities.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / similarities.length);
    return Math.max(0.5, mean - stdDev);
}

module.exports = {
    setupDiscordHandlers,
    login,
    handleMessage
};