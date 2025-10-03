import logger from './logger.js';
import aiManager from './ai/AIManager.js';

let tiktoken = null;
let defaultEncoder = null;

async function loadTiktoken() {
  try {
    // Dynamic import to avoid blocking if not installed
    const tiktokenModule = await import('tiktoken');
    tiktoken = tiktokenModule;
    defaultEncoder = tiktoken.get_encoding('cl100k_base');
    logger.info('Tiktoken loaded successfully');
  } catch (error) {
    logger.warn('Tiktoken not available. Using fallback token counter. Install with: npm install tiktoken');
    tiktoken = null;
  }
}

// Load tiktoken on module init
loadTiktoken();

class TokenCounter {
  constructor(modelName = 'gpt-3.5-turbo') {
    this.modelName = modelName;
    this.encoder = null;
    this.loadEncoder();
  }

  loadEncoder() {
    if (tiktoken) {
      try {
        this.encoder = tiktoken.get_encoding_for_model(this.modelName);
        logger.info(`Loaded encoder for model: ${this.modelName}`);
      } catch (error) {
        logger.warn(`Model encoding not found for ${this.modelName}, using default cl100k_base`);
        this.encoder = defaultEncoder;
      }
    } else {
      this.encoder = null; // Fallback will be used
    }
  }

  countTokens(text) {
    if (!text || typeof text !== 'string') {
      return 0;
    }

    if (this.encoder) {
      const tokens = this.encoder.encode(text);
      const count = tokens.length;
      this.logTokenCount(text, count);
      this.checkContextLimit(count);
      return count;
    } else {
      // Fallback approximate counter: rough estimate for GPT models (avg 4 chars per token)
      const count = Math.ceil(text.length / 4);
      this.logTokenCount(text, count, true);
      this.checkContextLimit(count);
      return count;
    }
  }

  countPromptTokens(prompt) {
    // For now, handle string input; extend for objects later
    if (typeof prompt === 'string') {
      return this.countTokens(prompt);
    } else if (typeof prompt === 'object') {
      // Basic handling: stringify and count (improve as needed for prompt structures)
      const promptText = JSON.stringify(prompt);
      logger.warn('Prompt object stringified for token counting; consider custom handling');
      return this.countTokens(promptText);
    }
    logger.error('Invalid prompt type for token counting');
    return 0;
  }

  logTokenCount(text, count, isFallback = false) {
    const preview = text.length > 50 ? text.substring(0, 50) + '...' : text;
    logger.info(`Token count for "${preview}": ${count}${isFallback ? ' (fallback)' : ''}`);
  }

  checkContextLimit(tokens) {
    const maxLength = aiManager.getMaxContextLength(this.modelName);
    if (maxLength !== 'Unknown' && tokens > maxLength) {
      logger.warn(`Token count ${tokens} exceeds context limit ${maxLength} for model ${this.modelName}`);
    }
  }

  // Utility to get max context length
  getMaxContextLength() {
    return aiManager.getMaxContextLength(this.modelName);
  }
}

// Simple test at module level
if (process.env.NODE_ENV !== 'production') {
  const testCounter = new TokenCounter('gpt-3.5-turbo');
  const testText = 'Hello, this is a test for token counting.';
  console.log(`Test token count: ${testCounter.countTokens(testText)}`);
}

export default TokenCounter;