import startServer from './server/index.js';
import startBot from './bot/index.js';

async function main() {
  try {
    await startServer();
    await startBot();
  } catch (error) {
    console.error('Error al iniciar la aplicación:', error);
    process.exit(1);
  }
}

main();
