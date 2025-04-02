import axios from 'axios';
import { Client, GatewayIntentBits, ActivityType, REST, Routes } from 'discord.js';
import { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } from '@discordjs/voice';
import 'dotenv/config';
import { unloadModel } from './lmHandler.js';
import { addMessage, processQueue } from './messageQueue.js';
import { getChannelContext } from './channelContext.js';
import { fetchSearchResults } from './searchHandler.js';
import IntentHandler from './intentHandler.js';
import mcpHandler from './mcp/mcpHandler.js';
import { promisify } from 'util';
const sleep = promisify(setTimeout);
import aiProvider from './aiProvider.js';
import logger from './logger.js';

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

// Variable global para controlar la detección de bots
let detectBots = false;

// Registrar el comando slash globalmente
const commands = [
    {
        name: 'detect-bots',
        description: 'Activa o desactivada la detección de mensajes de otros bots.',
    },
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

client.once('ready', async () => {
    logger.info(`Logged in as ${client.user.tag}!`);
    client.user.setActivity(`${targetChannelName}`, { type: ActivityType.Watching });

    // Registrar comandos slash después de que el cliente esté listo
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

// Manejar el comando slash
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

client.on('messageCreate', async message => {
});

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
                logger.info(`Message: ${msg.content} - Similarity: ${similarity} - Author: ${msg.author.displayName}`);
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

let isHandlingMessage = false;

async function handleMessage(message, intentHandler, generateResponse, selectedProvider, selectedModel){
    if (message.author.bot || isHandlingMessage) return;
    if (message.channel.name !== targetChannelName) return;

    try {
        isHandlingMessage = true;
        const startTime = Date.now();
        const intent = await intentHandler.analyze(message.content, selectedProvider);
        let response;
        
        // Manejar herramientas MCP si se requieren
        if (intent.requiresMcp) {
            try {
                const result = await mcpHandler.executeTool(
                    intent.suggestedMcpTool.server,
                    intent.suggestedMcpTool.tool,
                    intent.mcpArgs || {}
                );

                response = result.success ? 
                    `✅ ${result.result || 'Operación exitosa'}` :
                    `❌ Error: ${result.error || 'Desconocido'}`;

                await sleep(500); // Pequeña pausa para evitar rate limiting
            } catch (error) {
                response = `❌ Error al ejecutar herramienta MCP: ${error.message}`;
                logger.error('Error en herramienta MCP:', error);
            }
        } else if (selectedProvider === 'crofAI') {
            const crofAI = aiProvider.getProvider('crofAI');
            const completion = await crofAI.chat.completions.create({
                model: selectedModel,
                messages: [
                    { role: 'user', content: message.content }
                ]
            });
            response = completion.choices[0].message.content;
        } else {
            const channelId = message.channel.id;
            addMessage(message);
            processQueue(async (msg) => {
                const context = getChannelContext(channelId);
                const intentAnalysis = await intentHandler.analyze(msg.content, selectedProvider);

                if(intentAnalysis.isSearchRequest){
                    logger.info('Se encontró una petición de búsqueda');
                    // Realizar la búsqueda y obtener los resultados
                    const searchResults = await fetchSearchResults(intentAnalysis.keywords.join(' '));

                    if(searchResults.length === 0){
                        // Si no se encontró resultados, procesar el mensaje normalmente
                        logger.info('No se encontró resultados');
                        const response = await generateResponse(context, msg.content);
                        await sendLongMessage(msg.channel, response);
                    }else{
                        // Formatear los resultados para el mensaje de respuesta
                        let searchReply = 'Aquí tienes los resultados de búsqueda:\n';
                        searchResults.slice(0, 3).forEach((result) => {
                            searchReply += `**${result.title}**\n${result.description}\n${result.link}\n\n`;
                        });

                        // Enviar los resultados de la búsqueda
                        await sendLongMessage(msg.channel, searchReply);
                    }
                }else{
                    const response = await generateResponse(context, msg.content);
                    await sendLongMessage(msg.channel, response);
                }
            });
        }
        const duration = Date.now() - startTime;
        await sendLongMessage(message.channel, response, duration);
    } catch (error) {
        logger.error('Error al procesar el mensaje:', error);
        await sendLongMessage(message.channel, 'Lo siento, hubo un error al procesar tu mensaje.');
    } finally {
        isHandlingMessage = false;
    }
}

let isHandlersSetup = false;

function setupDiscordHandlers({ analyzeIntent, fetchSearchResults, generateResponse, getEmbedding, cosineSimilarity, loadModel, selectedProvider, selectedModel }){
    if (isHandlersSetup) return;
    isHandlersSetup = true;

    // Inicializar IntentHandler
    const intentHandler = new IntentHandler({
        'LM Studio': { analyzeIntent },
        'crofAI': { analyzeIntent: (message) => ({ 
            isSearchRequest: false,
            keywords: [],
            requiresMcp: false
        })}
    });

    client.on('messageCreate', (message) => handleMessage(
        message, 
        intentHandler,
        generateResponse, 
        selectedProvider, 
        selectedModel
    ));

    process.on('SIGINT', handleShutdown); // Ctrl + C en la terminal
    process.on('SIGTERM', handleShutdown); // Señales de cierre del sistema
}

function handleShutdown(){
    client.user.setActivity('Que lastima pero adiós...', { type: ActivityType.Listening });
    logger.info('Cerrando el bot de Discord...');
    try {
        unloadModel().then(() => {
            client.destroy();
            process.exit();
        }).catch(() => {
            client.destroy();
            process.exit();
        });
    } catch (error) {
        client.destroy();
        process.exit();
    }
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

function splitMessage(content, maxLength = 2000) {
  const chunks = [];
  while (content.length > maxLength) {
    let chunk = content.substring(0, maxLength);
    const lastNewline = chunk.lastIndexOf('\n');
    if (lastNewline > -1) {
      chunk = chunk.substring(0, lastNewline);
    }
    chunks.push(chunk);
    content = content.substring(chunk.length);
  }
  chunks.push(content);
  return chunks;
}

function extractAndLogThinking(content, duration) {
  const thinkingMatch = content.match(/<think>([\s\S]*?)<\/think>/);
  if (thinkingMatch) {
    const thinkingText = thinkingMatch[1].trim();
    logger.info(`Thinking:\n${thinkingText}`, { duration });
    return content.replace(thinkingMatch[0], '').trim();
  }
  return content;
}

async function sendLongMessage(channel, content, duration) {
  const cleanedContent = extractAndLogThinking(content, duration);
  const chunks = splitMessage(cleanedContent);
  for (const chunk of chunks) {
    await channel.send(chunk);
  }
}

export {
    setupDiscordHandlers,
    login,
    handleMessage,
    gatherSearchContext
};
