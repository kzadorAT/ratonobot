import mcpHandler from './mcp/mcpHandler.js';

const MEMORY_SERVER = 'memory';

/**
 * Busca o crea una entidad para un usuario.
 * @param {string} userId - ID único del usuario (ej. Discord ID)
 * @param {string} userName - Nombre del usuario
 * @returns {Promise<Object>} entidad con observaciones y relaciones
 */
export async function getOrCreateUserEntity(userId, userName) {
  const entityName = `user_${userId}`;

  try {
    const searchResult = await mcpHandler.executeTool(MEMORY_SERVER, 'search_nodes', { query: entityName });
    const matches = searchResult.result?.entities || [];

    if (matches.length > 0) {
      return matches[0];
    }

    // Crear entidad si no existe
    await mcpHandler.executeTool(MEMORY_SERVER, 'create_entities', {
      entities: [
        {
          name: entityName,
          entityType: 'person',
          observations: [`username: ${userName}`]
        }
      ]
    });

    // Volver a buscar para obtener la entidad creada
    const createdResult = await mcpHandler.executeTool(MEMORY_SERVER, 'search_nodes', { query: entityName });
    return createdResult.result?.entities?.[0] || null;

  } catch (error) {
    console.warn('Error en getOrCreateUserEntity:', error.message);
    return null;
  }
}

/**
 * Agrega observaciones a la entidad del usuario.
 * @param {string} userId
 * @param {string[]} observations
 */
export async function addUserObservations(userId, observations) {
  const entityName = `user_${userId}`;

  try {
    await mcpHandler.executeTool(MEMORY_SERVER, 'add_observations', {
      observations: [
        {
          entityName,
          contents: observations
        }
      ]
    });
  } catch (error) {
    console.warn('Error agregando observaciones a usuario:', error.message);
  }
}
