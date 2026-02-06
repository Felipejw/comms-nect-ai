import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import { createSession, getSession, getAllSessions, deleteSession, sendTextMessage, sendMediaMessage, getQrCode, restoreSessions } from './baileys.js';
import { logger } from './logger.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY;

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  logger.info({ method: req.method, path: req.path }, 'Request received');
  next();
});

// Health check (sem autenticacao)
app.get('/health', (req: Request, res: Response) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    sessions: getAllSessions().length
  });
});

// Autenticacao via API Key
app.use((req: Request, res: Response, next: NextFunction) => {
  // Ignorar health check
  if (req.path === '/health') {
    return next();
  }
  
  const apiKey = req.headers['x-api-key'];
  if (!API_KEY || apiKey !== API_KEY) {
    logger.warn({ path: req.path }, 'Unauthorized request');
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  next();
});

// ==========================================
// Rotas de Sessao
// ==========================================

// Criar nova sessao
app.post('/sessions', async (req: Request, res: Response) => {
  try {
    const { name, webhookUrl } = req.body;
    
    if (!name) {
      return res.status(400).json({ success: false, error: 'Session name is required' });
    }
    
    const webhook = webhookUrl || process.env.WEBHOOK_URL;
    const session = await createSession(name, webhook);
    
    res.json({ success: true, data: session });
  } catch (error) {
    logger.error({ error }, 'Error creating session');
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// Listar todas as sessoes
app.get('/sessions', (req: Request, res: Response) => {
  try {
    const sessions = getAllSessions();
    res.json({ success: true, data: sessions });
  } catch (error) {
    logger.error({ error }, 'Error listing sessions');
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// Status de uma sessao
app.get('/sessions/:name', (req: Request, res: Response) => {
  try {
    const sessionName = Array.isArray(req.params.name) ? req.params.name[0] : req.params.name;
    const session = getSession(sessionName);
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }
    res.json({ success: true, data: session });
  } catch (error) {
    logger.error({ error }, 'Error getting session');
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// Obter QR Code
app.get('/sessions/:name/qr', async (req: Request, res: Response) => {
  try {
    const { format } = req.query;
    const sessionName = Array.isArray(req.params.name) ? req.params.name[0] : req.params.name;
    const qrData = await getQrCode(sessionName, format as string);
    
    if (!qrData) {
      return res.status(404).json({ success: false, error: 'QR Code not available' });
    }
    
    res.json({ success: true, data: qrData });
  } catch (error) {
    logger.error({ error }, 'Error getting QR code');
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// Desconectar/excluir sessao
app.delete('/sessions/:name', async (req: Request, res: Response) => {
  try {
    const sessionName = Array.isArray(req.params.name) ? req.params.name[0] : req.params.name;
    await deleteSession(sessionName);
    res.json({ success: true, message: 'Session deleted' });
  } catch (error) {
    logger.error({ error }, 'Error deleting session');
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// ==========================================
// Rotas de Mensagem
// ==========================================

// Enviar mensagem de texto
app.post('/sessions/:name/send/text', async (req: Request, res: Response) => {
  try {
    const { to, text } = req.body;
    
    if (!to || !text) {
      return res.status(400).json({ success: false, error: 'to and text are required' });
    }
    
    const sessionName = Array.isArray(req.params.name) ? req.params.name[0] : req.params.name;
    const result = await sendTextMessage(sessionName, to, text);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error({ error }, 'Error sending text message');
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// Enviar midia
app.post('/sessions/:name/send/media', async (req: Request, res: Response) => {
  try {
    const { to, mediaUrl, caption, mediaType } = req.body;
    
    if (!to || !mediaUrl) {
      return res.status(400).json({ success: false, error: 'to and mediaUrl are required' });
    }
    
    const sessionName = Array.isArray(req.params.name) ? req.params.name[0] : req.params.name;
    const result = await sendMediaMessage(sessionName, to, mediaUrl, caption, mediaType);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error({ error }, 'Error sending media message');
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// ==========================================
// Iniciar servidor
// ==========================================

app.listen(PORT, async () => {
  logger.info({ port: PORT }, 'Baileys server started');
  console.log(`🚀 Baileys server running on port ${PORT}`);

  // Restaurar sessoes existentes ao iniciar
  try {
    await restoreSessions();
    logger.info('Sessions restored successfully');
  } catch (err) {
    logger.error({ err }, 'Error restoring sessions on startup');
  }
});
