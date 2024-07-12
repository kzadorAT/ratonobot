const { LMStudioClient } = require('@lmstudio/sdk');
const axios = require('axios');

// Variable para almacenar el modelo
let model;

// Prompt dinámico que se puede ajustar según sea necesario
let startPrompt = `
                Eres un experto en programación y desarrollo de software, 
                especializado en ayudar a resolver problemas de código y ofrecer sugerencias de mejora. 
                Respondes con humor y gracia, pero siempre proporcionando soluciones útiles y detalladas.`

// Función para cargar el modelo una vez al inicio
async function loadModel() {
    try {
        const lmClient = new LMStudioClient();
        model = await lmClient.llm.load('QuantFactory/Meta-Llama-3-8B-Instruct-GGUF/Meta-Llama-3-8B-Instruct.Q8_0.gguf'); // Cambiar el modelo aqui
        console.log('Modelo cargado exitosamente');
        return model;
    } catch (error) {
        console.error('Error al cargar el modelo:', error);
        return null;
    }
}

// Función para obtener el embedding de un texto
async function getEmbedding(text) {
    try {
        const response = await axios.post('http://localhost:1234/v1/embeddings', {
            input: text,
            model: 'nomic-ai/nomic-embed-text-v1.5-GGUF/nomic-embed-text-v1.5.Q5_K_M.gguf'
        }, {
            headers: {
                'Content-Type': 'application/json'
            }
        });

        return response.data.data[0].embedding;
    } catch (error) {
        console.error('Error al obtener el embedding:', error);
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
async function analyzeIntent(messageContent) {
    const prompt = `
        Dado el siguiente mensaje, determine si el usuario está solicitando una búsqueda, presentando un problema de programación, o solicitando generación de música.
        Devuelve el resultado en el siguiente formato JSON:

        {
            "isSearchRequest": true/false,
            "isProgrammingProblem": true/false,
            "isMusicRequest": true/false,
            "keywords": ["keyword1", "keyword2", ...]
        }

        Mensaje: "${messageContent}"

        Responde estrictamente en el formato JSON indicado sin ninguna otra explicación.`;

    const response = await model.respond([{
        role: 'user',
        content: prompt
    }]);

    try {
        var result = JSON.parse(response.content.trim());
        console.log(result);
        return result;
    } catch (e) {
        console.error('Error al intentar analizar las intenciones:', e);
        return { isSearchRequest: false, isProgrammingProblem: false, keywords: [] };
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
    for await(const text of prediction) {
        reply += text;
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
        var result = JSON.parse(response.content.trim());
        console.log(result);
        return result;
    } catch (e) {
        console.error('Error al intentar analizar las palabras clave de la musica:', e);
        return { title: '', lyrics: '', style: '' };
    }
}

module.exports = {
    loadModel,
    getEmbedding,
    cosineSimilarity,
    analyzeIntent,
    generateResponse,
    extractMusicKeywords
}