import express from 'express';
import aiProvider from '../services/aiProvider.js';
import logger from '../services/logger.js';
import 'dotenv/config';

export default async function startServer() {
  const app = express();
  app.use(express.json());

  app.post('/select-ai', (req, res) => {
    const { aiName } = req.body;
    const ai = aiProvider.getProvider(aiName);
    if (ai) {
      res.json({ success: true, ai });
    } else {
      res.status(404).json({ success: false, message: 'AI not found' });
    }
  });

  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    logger.info(`Server listening on port ${port}`);
  });
}
