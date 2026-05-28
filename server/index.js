import express from 'express';
import cors from 'cors';
import { createAiModelMiddleware } from './middleware.js';

const app = express();
const PORT = process.env.PORT || 9271;

app.use(cors());
app.use(express.json());
app.use('/api', createAiModelMiddleware());

app.listen(PORT, () => {
  console.log(`[ai-model-form] Server running at http://localhost:${PORT}`);
  console.log(`[ai-model-form] API endpoint: http://localhost:${PORT}/api/ai-model`);
});
