import logger from './logger.js';

// Simple in-memory storage for user entities
const memoryStore = new Map();

/**
 * Busca o crea una entidad para un usuario.
 * @param {string} userId - ID único del usuario (ej. Discord ID)
 * @param {string} userName - Nombre del usuario
 * @returns {Promise<Object>} entidad con observaciones y relaciones
 */
export async function getOrCreateUserEntity(userId, userName) {
  const entityName = `user_${userId}`;

  try {
    if (memoryStore.has(entityName)) {
      return memoryStore.get(entityName);
    }

    // Crear entidad si no existe
    const entity = {
      name: entityName,
      entityType: 'person',
      observations: [`username: ${userName}`]
    };

    memoryStore.set(entityName, entity);
    return entity;

  } catch (error) {
    logger.warn('Error en getOrCreateUserEntity:', error.message);
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
    const entity = memoryStore.get(entityName);
    if (entity) {
      entity.observations.push(...observations);
    } else {
      logger.warn('Entity not found for user:', userId);
    }
  } catch (error) {
    logger.warn('Error agregando observaciones a usuario:', error.message);
  }
}
