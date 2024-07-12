const axios = require('axios');
const { Client, GatewayIntentBits, ActivityType } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Nombre del canal de Discord al que se enviará la respuesta
const targetChannelName = 'testing-bot';

// Indica si el bot está procesando una solicitud
let isProcessing = false;

// Cola de mensajes
const messageQueue = [];
const maxQueueSize = 4;

// Historial de mensajes por canal
const channelContexts = {};
const contextSize = 5; // Numero de mensajes a mantener en el contexto

const botEmbeddingLimit = 3; // Numero de mensajes a considerar para la creación del embedding

let model;

function updateChannelContext(message){
    const channelId = message.channel.id;
    if (!channelContexts[channelId]) {
        channelContexts[channelId] = [];
    }

    if(message.reference){
        const referencedMessage = message.channel.messages.cache.get(message.reference.messageId);
        if(referencedMessage){
            // Añadir el mensaje citado al contexto
            channelContexts[channelId].push({
                role: referencedMessage.author.id === client.user.id ? 'assistant' : 'user',
                content: `${referencedMessage.member.displayName}: ${referencedMessage.content}`
            });
        }
    }

    // Añadir el nuevo mensaje al contexto
    channelContexts[channelId].push({
        role: 'user',
        content: `${message.member.displayName}: ${message.content}`
    });

    // Mantener solo los últimos 'contextSize' mensajes en el contexto
    if (channelContexts[channelId].length > contextSize) {
        channelContexts[channelId].shift();
    }
}

async function gatherSearchContext(channel, query, getEmbedding, cosineSimilarity){
    const messages = await channel.messages.fetch({ limit: 100 });
    const searchContext = [];

    const queryEmbedding = await getEmbedding(query);

    for (const msg of messages.values()) {
        if(msg.author.id !== client.user.id){
            const messageEmbedding = await getEmbedding(msg.content);
            const similarity = cosineSimilarity(queryEmbedding, messageEmbedding);
            if(similarity > 0.6){
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

async function processQueue(generateResponse, getEmbedding, cosineSimilarity){
    console.log('Procesando la cola de mensajes...');
    if (messageQueue.length === 0) {
        return;
    }

    // Marcar que el bot está procesando un mensaje
    isProcessing = true;

    // Obtener el primer mensaje de la cola
    const message = messageQueue.shift();

    try {
        // Cambiar el estado del bot a "Respondiendo"
        client.user.setActivity('a Responder', { type: ActivityType.Playing });
        const context = await gatherSearchContext(message.channel, message.content, getEmbedding, cosineSimilarity);

        // Generar respuesta usando el modelo con contexto 
        const reply = await generateResponse(context, `${message.author.displayName}: ${message.content}`);

        // Dividir el mensaje en fragmentos de 2000 caracteres o menos
        const maxLength = 2000;
        const replies = reply.match(new RegExp(`.{1,${maxLength}}`, 'g'));

        // Enviar cada fragmento como un mensaje separado
        for (const [index, part] of replies.entries()) {
            if (index === 0) {
                // Enviar el primer fragmento citando el mensaje original si corresponde
                await message.channel.send({
                    content: part,
                    reference: {
                        message_id: message.id
                    }
                });
            } else {
                await message.channel.send(part);
            }
        }
    } catch (error) {
        console.error('Error al procesar el mensaje:', error);
        message.reply('Uh...algo valio madres, no culpes al programador fuiste tú.');
    } finally {
        // Marcar que el bot ha terminado de procesar el mensaje
        isProcessing = false;
        // Cambiar el estado del bot a "Online"
        client.user.setActivity(`${targetChannelName}`, { type: ActivityType.Watching });

        // Procesar el siguiente mensaje en la cola si la cola no está vacía
        if (messageQueue.length > 0) {
            processQueue(generateResponse, getEmbedding, cosineSimilarity);
        }
    }
}

async function handleMessage(message, analyzeIntent, fetchSearchResults, generateResponse, getEmbedding, cosineSimilarity, extractMusicKeywords){
    if (message.author.bot) return; // Ignorar mensajes de otros bots

    // Verifica si el mensaje proviene del canal especificado
    if(message.channel.name === targetChannelName){
        // Si el modelo no se ha cargado, ignorar el mensaje
        if(!model){
            message.reply('Loco, no me jodas ahora, esperate un segundo que estoy loading, ja.');
            return;
        }

        // Añadir mensaje a la cola si no excede el límite
        if(messageQueue.length < maxQueueSize){
            messageQueue.push(message);
        }else{
            message.reply('No ves que estoy ocupado? Vuelve a escribir, que dijiste?.');
            return;
        }

        // Actualizar el contexto del canal
        updateChannelContext(message);

        // Analizar la intención del mensaje
        const intentAnalysis = await analyzeIntent(message.content);

        if(intentAnalysis.isSearchRequest && !intentAnalysis.isProgrammingProblem && !intentAnalysis.isMusicRequest){
            console.log('Se encontro una petición de búsqueda');
            // Realizar la búsqueda y obtener los resultados
            const searchResults = await fetchSearchResults(intentAnalysis.keywords.join(' '));

            if(searchResults.length === 0){
                // Si no se encontró resultados, procesar el mensaje normalmente
                console.log('No se encontró resultados');
                if(!isProcessing){
                    processQueue(generateResponse, getEmbedding, cosineSimilarity);
                }
            }else{
                // Formatear los resultados para el mensaje de respuesta
                let searchReply = 'Aquí tienes los resultados de búsqueda:\n';
                searchResults.slice(0, 3).forEach((result) => {
                    searchReply += `**${result.title}**\n${result.description}\n${result.link}\n\n`;
                });

                // Enviar los resultados de la búsqueda
                await message.channel.send(searchReply);
                // Remover el mensaje de busqueda de la cola si se encontro resultados
                messageQueue.shift();
            }
        }
        else if(intentAnalysis.isProgrammingProblem && !intentAnalysis.isMusicRequest){
            console.log('Se encontro un problema de programación');
            if(!isProcessing){
                processQueue(generateResponse, getEmbedding, cosineSimilarity);
            }
        }
        else if(intentAnalysis.isMusicRequest){
            console.log('Se encontro una solicitud de generación de música');
            const musicKeywords = await extractMusicKeywords(message.content);
            const musicResponse = await handleMusicRequest(musicKeywords);
            await message.channel.send(musicResponse);
        }
        else{
            // Procesar la cola si el bot no está procesando
            if(!isProcessing){
                processQueue(generateResponse, getEmbedding, cosineSimilarity);
            }
        }
    }
}

async function handleMusicRequest(keywords){

    const prompt = keywords.lyrics;
    const style = keywords.style;
    const title = keywords.title || 'Generated song';
    const makeInstrumental = keywords.makeInstrumental || false;
    const model = keywords.model || 'chirp-v3-5|chirp-v3-0';
    const waitAudio = keywords.waitAudio || false;

    const requestBody = {
        prompt: prompt,
        tags: style,
        title: title,
        make_instrumental: makeInstrumental,
        model: model,
        wait_audio: true
    };

    try {
        const response = await axios.post('http://localhost:3000/api/custom_generate', requestBody, {
            headers: {
                'Content-Type': 'application/json'
            }
        });

        return `Aquí está el enlace de tu canción: ${response.data.audio_url}`;
    } catch (error) {
        console.error('Error al generar la cancion:', error);
        return 'Hubo un error al generar la cancion, por favor intenta de nuevo más tarde.'
    }
}

function setupDiscordHandlers({ analyzeIntent, fetchSearchResults, generateResponse, getEmbedding, cosineSimilarity, extractMusicKeywords, loadModel }){
    client.once('ready', async () => {
        console.log(`Logged in as ${client.user.tag}!`);
        client.user.setActivity(`${targetChannelName}`, { type: ActivityType.Watching });
        model = await loadModel();
    });

    client.on('messageCreate', (message) => handleMessage(message, analyzeIntent, fetchSearchResults, generateResponse, getEmbedding, cosineSimilarity, extractMusicKeywords, model));

    process.on('SIGINT', handleShutdown); // Ctrl + C en la terminal
    process.on('SIGTERM', handleShutdown); // Señales de cierre del sistema
}

function handleShutdown(){
    client.user.setActivity('Que lastima pero adiós...', { type: ActivityType.Listening });
    console.log('Cerrando el bot de Discord...');
    client.destroy();
    process.exit();
}

function login(token){
    client.login(token);
}

module.exports = {
    setupDiscordHandlers,
    login,
    handleMessage
};