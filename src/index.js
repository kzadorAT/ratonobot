const { Client, GatewayIntentBits, ActivityType } = require('discord.js');
const { LMStudioClient } = require('@lmstudio/sdk');
const axios = require('axios');
const { fetchSearchResults } = require('./scrapers/searchScraper');
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

// Función para cargar el modelo una vez al inicio
async function loadModel() {
    try {
        const lmClient = new LMStudioClient();
        model = await lmClient.llm.load('QuantFactory/Meta-Llama-3-8B-Instruct-GGUF/Meta-Llama-3-8B-Instruct.Q8_0.gguf'); // Cambiar el modelo aqui
        console.log('Modelo cargado exitosamente');
    } catch (error) {
        console.error('Error al cargar el modelo:', error);
    }
}

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    
    // Cambiar el estado del bot a Mirando el canal
    client.user.setActivity(`${targetChannelName}`, { type: ActivityType.Watching });
    
    // Cargar el modelo cuando el bot se conecta
    await loadModel();
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return; // Ignorar mensajes de otros bots

    // Verifica si el mensaje proviene del canal especificado
    if (message.channel.name === targetChannelName) {
        // Si el modelo no se ha cargado, ignorar el mensaje
        if(!model){
            message.reply('Loco, no me jodas ahora, esperate un segundo que estoy loading, ja.');
            return;
        }

        // Añadir mensaje a la cola si no excede el límite
        if (messageQueue.length < maxQueueSize) {
            messageQueue.push(message);
        } else {
            message.reply('No ves que estoy ocupado? Vuelve a escribir, que dijiste?.');
            return;
        }

        // Actualizar el contexto del canal
        updateChannelContext(message);

        // Analizar la intención del mensaje
        const intentAnalysis = await analyzeIntent(message.content);

        if(intentAnalysis.isSearchRequest){
            console.log('Se encontro una petición de búsqueda');
            // Realizar la búsqueda y obtener los resultados
            const searchResults = await fetchSearchResults(intentAnalysis.keywords.join(' '));

            if(searchResults.length === 0){
                // Si no se encontró resultados, procesar el mensaje normalmente
                console.log('No se encontró resultados');
                if(!isProcessing) {
                    processQueue();
                }
            } else {
                // Formatear los resultados para el mensaje de respuesta
                let searchReply = 'Aquí tienes los resultados de búsqueda:\n';
                searchResults.slice(0, 3).forEach((result) => {
                    searchReply += `**${result.title}**\n${result.description}\n${result.link}\n\n`;
                });

                // Enviar los resultados de la búsqueda
                await message.channel.send(searchReply);
            }
        }else{
            // Procesar la cola si el bot no está procesando
            if (!isProcessing) {
                processQueue();
            }
        }
    }
});


// Función para actualizar el contexto del canal
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

async function analyzeIntent(messageContent){
    const prompt = `
        Dado el siguiente mensaje, determine si el usuario está solicitando una búsqueda.
        Si es así, extraiga las palabras clave de la solicitud de búsqueda.

        Mensaje: ${messageContent}

        Tienes que devolver esto sin escribir ni una letra de más, ni siquiera una respuesta ingeniosa, 
        ya que es el resultado que esperamos para analizar, recuerda también que las palabras separadas por un espacio
        van separadas en el array de keywords:
        {
            "isSearchRequest": true/false,
            "keywords": ["keyword1", "keyword2", ...]
        }`;

    const response = await model.respond([{
        role: 'user',
        content: prompt
    }]);

    try{
        var result = JSON.parse(response.content);
        console.log(result);
        return result;
    }catch(e){
        console.error('Error al intentar analizar las intenciones:', e);
        return { isSearchRequest: false, keywords: [] };
    }
}

async function gatherSearchContext(channel, query){
    const messages = await channel.messages.fetch({ limit: 100 });
    const searchContext = [];

    const queryEmbedding = await getEmbedding(query);

    for (const msg of messages.values()) {
        if(msg.author.id !== client.user.id){
            const messageEmbedding = await getEmbedding(msg.content);
            const similarity = cosineSimilarity(queryEmbedding, messageEmbedding);
            if(similarity > 0.6){
                console.log(`Mensaje: ${msg.content} - Similaridad: ${similarity} - Autor: ${msg.author.displayName}`);
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

async function getEmbedding(text) {
    const response = await axios.post('http://localhost:1234/v1/embeddings', {
        input: text,
        model: 'nomic-ai/nomic-embed-text-v1.5-GGUF/nomic-embed-text-v1.5.Q5_K_M.gguf'
    }, {
        headers: {
            'Content-Type': 'application/json'
        }
    });

    return response.data.data[0].embedding;
}

function cosineSimilarity(vecA, vecB){
    const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
    const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
    const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
    return dotProduct / (magnitudeA * magnitudeB);
}


async function processQueue() {
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
        const context = await gatherSearchContext(message.channel, message.content);

        // Generar respuesta usando el modelo con contexto
        const prediction = model.respond([
            { role: 'system', content: `
                Te retiraste de QA para ser programador y tratas de encontrar alguna solución a 
                cualquier cosa que te dicen, tratas de responder siempre con gracia y humor. El nombre del
                usuario que te manda el mensaje está antes de los dos puntos, pero solo al comienzo, 
                el usuario que te manda el mensaje es al que respondes. Puedes usar el nombre de otro
                usuario para responder, pero solo si dices algo referente a ese usuario citado 
                que haya dicho o contado que hizo, pero referente a lo que te están hablando.` },
            ...context,
            { role: 'user', content: `${message.author.displayName}: ${message.content}` }
        ]);
    
        let reply = '';
        for await (const text of prediction) {
            reply += text;
        }

        // Dividir el mensaje en fragmentos de 2000 caracteres o menos
        const maxLength = 2000;
        const replies = reply.match(new RegExp(`.{1,${maxLength}}`, 'g'));

        // Enviar cada fragmento como un mensaje separado
        for (const [index, part] of replies.entries()) {
            if(index === 0) {
                // Enviar el primer fragmento citando el mensaje original si corresponde
                await message.channel.send({
                    content: part,
                    reply: { messageReference: message.id }
                });
            } else {
                // Enviar los fragmentos restantes sin citar
                await message.channel.send(part);
            }
        }
    } catch (error) {
        console.error('Error generating response:', error);
        message.reply('Uh...algo valio madres, no culpes al programador fuiste tú.');
    } finally {
        // Marcar que el bot ha terminado de procesar el mensaje
        isProcessing = false;
        // Cambiar el estado del bot a "Online"
        client.user.setActivity(`${targetChannelName}`, { type: ActivityType.Watching });

        // Procesar el siguiente mensaje en la cola si la cola no está vacía
        if (messageQueue.length > 0) {
            processQueue();
        }
    }
}

// Función para manejar el cierre del proceso
function handleShutdown() {
    client.user.setActivity('Que lastima pero adiós...', { type: ActivityType.Listening });
    console.log('Cerrando el bot de Discord...');
    client.destroy();
    process.exit();
}

// Escuchar señales de cierre
process.on('SIGINT', handleShutdown); // Ctrl + C en la terminal
process.on('SIGTERM', handleShutdown); // Señales de cierre del sistema

client.login(process.env.DISCORD_TOKEN);