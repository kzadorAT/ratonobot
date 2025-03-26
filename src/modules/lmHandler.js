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
        model = await lmClient.llm.load('deepseek-r1-distill-qwen-7b'); // Cambiar el modelo aqui
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
            model: 'text-embedding-nomic-embed-text-v1.5'
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
            console.log('Thinking:\n', thinkingMatch[1].trim());
        }

        // Extraer JSON
        const jsonMatch = response.content.match(/```json\n([\s\S]*?)\n```/);
        if (!jsonMatch || !jsonMatch[1]) {
            throw new Error('No se encontró JSON válido en la respuesta');
        }
        var result = JSON.parse(jsonMatch[1].trim());
        console.log(result);
        return result;
    } catch (e) {
        console.error('Error al intentar analizar las intenciones:', e);
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
                console.log('Thinking...');
            }
            process.stdout.write(textStr); // Mostrar el texto en tiempo real
        } else if (chunk.reasoningType === 'reasoningEndTag') {
            thinking = false;
            process.stdout.write('\n'); // Asegurar un salto de línea al final
            console.log('Finished thinking.');
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
        console.log('Response content:', response.content);
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