const { LMStudioClient } = require('@lmstudio/sdk');
const axios = require('axios');
const logger = require('./logger');

// Variable para almacenar el modelo
let model;

// Prompt dinámico que se puede ajustar según sea necesario
let startPrompt = `
                Eres Ratono, el bot mas sarcastico y grasioso del mundo. Naciste en Salta, Argentina (Eres salteño).
                Si alguien te insulta, tu lo insultas el doble, no necesitas ganar, pero siempre la empatas.
                ByteMe es otro bot al cual te gusta descansarlo, y siempre puedes molestar a Makoni sin razon aparente.`

// Función para cargar el modelo una vez al inicio
async function loadModel(modelName) {
    try {
        const lmClient = new LMStudioClient();
        model = await lmClient.llm.load(modelName);
        logger.info('Modelo cargado exitosamente');
        return model;
    } catch (error) {
        logger.error('Error al cargar el modelo:', error);
        return null;
    }
}

// Función para descargar el modelo
async function unloadModel() {
    try {
        if (model) {
            await model.unload();
            logger.info('Modelo descargado exitosamente');
        } else {
            logger.info('No hay modelo cargado para descargar.');
        }
    } catch (error) {
        logger.error('Error al descargar el modelo:', error);
    }
}

// Función para obtener el embedding de un texto
async function getEmbedding(text) {
    try {
        const response = await axios.post('http://localhost:1234/v1/embeddings', {
            input: text,
            model: 'text-embedding-nomic-embed-text-v1.5'
        }, {
            headers: {
                'Content-Type': 'application/json'
            }
        });

        return response.data.data[0].embedding;
    } catch (error) {
        logger.error('Error al obtener el embedding:', error);
    }
}

// Función para calcular la similitud coseno entre dos vectores
function cosineSimilarity(vecA, vecB) {
    const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
    const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
    const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
    return dotProduct / (magnitudeA * magnitudeB);
}

// Función para analizar la intención de un mensaje
async function analyzeIntent(messageContent, selectedProvider) {
    if (selectedProvider === 'crofAI') {
        return {
            isSearchRequest: false,
            keywords: [messageContent]
        };
    }

    const prompt = `
        Dado el siguiente mensaje, determine si el usuario está solicitando una búsqueda en línea.
        Devuelve el resultado en el siguiente formato JSON:

        {
            "isSearchRequest": true/false,
            "keywords": ["keyword1", "keyword2", ...]
        }

        Mensaje: "${messageContent}"

        Responde estrictamente en el formato JSON indicado sin ninguna otra explicación.`;

    const response = await model.respond([{
        role: 'user',
        content: prompt
    }]);

    try {
        // Mostrar thinking en consola
        const thinkingMatch = response.content.match(/<think>([\s\S]*?)<\/think>/);
        if (thinkingMatch && thinkingMatch[1]) {
            logger.info('Thinking:\n', thinkingMatch[1].trim());
        }

        // Extraer JSON
        const jsonMatch = response.content.match(/```json\n([\s\S]*?)\n```/);
        if (!jsonMatch || !jsonMatch[1]) {
            throw new Error('No se encontró JSON válido en la respuesta');
        }
        var result = JSON.parse(jsonMatch[1].trim());
        logger.info(result);
        return result;
    } catch (e) {
        logger.error('Error al intentar analizar las intenciones:', e);
        return { isSearchRequest: false, keywords: [] };
    }
}

// Función para generar una respuesta del modelo con contexto
async function generateResponse(context, userMessage) {
    const prediction = model.respond([
        {
            role: 'system',
            content: startPrompt
        },
        ...context,
        {
            role: 'user',
            content: userMessage,
        }
    ]);

    let reply = '';
    let thinking = false;
    for await(const chunk of prediction) {
        const text = chunk.content || ''; // Extraer el contenido del chunk
        const textStr = String(text); // Convertir a string

        // Detectar si la IA está pensando usando reasoningType
        if (chunk.reasoningType === 'reasoning') {
            if (!thinking) {
                thinking = true;
                logger.info('Thinking...');
            }
            process.stdout.write(textStr); // Mostrar el texto en tiempo real
        } else if (chunk.reasoningType === 'reasoningEndTag') {
            thinking = false;
            process.stdout.write('\n'); // Asegurar un salto de línea al final
            logger.info('Finished thinking.');
        } else {
            reply += textStr;
        }
    }
    return reply;
}

// Función para extraer palabras clave de una solicitud de música
async function extractMusicKeywords(messageContent) {
    const prompt = `
    Dado el siguiente mensaje, extrae el título de la canción, la letra y el estilo de música.
    Devuelve el resultado en el siguiente formato JSON:

    {
        "title": "title",
        "lyrics": "lyrics",
        "style": "style"
    }

    Mensaje: "${messageContent}"

    Responde estrictamente en el formato JSON indicado sin ninguna otra explicación.`;

    const response = await model.respond([{
        role: 'user',
        content: prompt
    }]);

    try {
        logger.info('Response content:', response.content);
        var result = JSON.parse(response.content.trim());
        logger.info(result);
        return result;
    } catch (e) {
        logger.error('Error al intentar analizar las palabras clave de la musica:', e);
        return { title: '', lyrics: '', style: '' };
    }
}

// Función para obtener la lista de modelos disponibles
async function getAvailableModels() {
    try {
        const response = await axios.get('http://localhost:1234/api/v0/models');
        return response.data.data.map(model => ({ id: model.id, name: model.id }));
    } catch (error) {
        logger.error('Error al obtener la lista de modelos:', error);
        return [];
    }
}

module.exports = {
    loadModel,
    unloadModel,
    getEmbedding,
    cosineSimilarity,
    analyzeIntent,
    generateResponse,
    extractMusicKeywords,
    getAvailableModels
}