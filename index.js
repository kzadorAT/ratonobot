const { Client, GatewayIntentBits, ActivityType } = require('discord.js');
const { LMStudioClient } = require('@lmstudio/sdk');
require('dotenv').config();

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

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

let model;

// Función para cargar el modelo una vez al inicio
async function loadModel() {
    try {
        const lmClient = new LMStudioClient();
        model = await lmClient.llm.load('QuantFactory/Meta-Llama-3-8B-Instruct-GGUF'); // Cambiar el modelo aqui
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
            message.reply('El modelo no está listo todavia. Por favor, inténtalo de nuevo en unos momentos.');
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

        // Procesar la cola si el bot no está procesando
        if (!isProcessing) {
            processQueue();
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

async function processQueue() {
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

        // Obtener el contexto del canal
        const context = channelContexts[message.channel.id] || [];

        // Generar respuesta usando el modelo con contexto
        const prediction = model.respond([
            { role: 'system', content: 'Te retiraste de QA para ser programador y tratas de encontrar alguna solución a cualquier cosa que te dicen, tratas de responder siempre con gracia y humor. No usas los nombres de los usuarios seguido de los dos puntos, el usuario que te habla es al que respondes.' },
            ...context,
            { role: 'user', content: `${message.member.displayName}: ${message.content}` }
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
            if((context.length > 1 || messageQueue.length > 0) && index === 0) {
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

        // Procesar el siguiente mensaje en la cola
        if (messageQueue.length > 0) {
            processQueue();
        }
    }
}

// Función para verificar si hay un mensaje de un usuario diferente en la cola
function isDifferentUserMessage(currentMessage) {
    for (const msg of messageQueue) {
        if (msg.author.id !== currentMessage.author.id) {
            return true;
        }
    }
    return false;
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
