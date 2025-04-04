import ContextManager from '../src/modules/context/contextManager.js';
import { mockDiscordClient } from './mocks/discord.js';

describe('ContextManager', () => {
  let cm;

  beforeAll(() => {
    cm = new ContextManager(mockDiscordClient);
  });

  test('should create context with discord history', async () => {
    const ctx = await cm.getFullContext('channel123', 'user456', 'msg789');
    
    expect(ctx).toHaveProperty('discord');
    expect(Array.isArray(ctx.discord.priorMessages)).toBeTruthy();
    expect(Array.isArray(ctx.discord.userMessages)).toBeTruthy();
    expect(typeof ctx.timestamp).toBe('number');
  });

  test('should handle empty memory context', async () => {
    const ctx = await cm.getFullContext('channel123', 'user456', 'msg789');
    expect(ctx.memory).toEqual({
      entities: [],
      relations: []
    });
  });
});
