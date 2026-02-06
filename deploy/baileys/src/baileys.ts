import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  proto,
  downloadMediaMessage,
  getContentType
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import * as fs from 'fs';
import * as path from 'path';
import * as QRCode from 'qrcode';
import { logger } from './logger';

// ==========================================
// Tipos
// ==========================================

interface SessionData {
  sock: WASocket;
  status: 'connecting' | 'connected' | 'disconnected';
  qrCode: string | null;
  qrCodeBase64: string | null;
  webhookUrl: string;
  phoneNumber: string | null;
  name: string;
}

interface SessionInfo {
  name: string;
  status: string;
  phoneNumber: string | null;
  hasQrCode: boolean;
}

// ==========================================
// Armazenamento de Sessoes
// ==========================================

const sessions = new Map<string, SessionData>();
const SESSIONS_DIR = process.env.SESSIONS_DIR || './sessions';

// Garantir que o diretorio de sessoes existe
if (!fs.existsSync(SESSIONS_DIR)) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

// ==========================================
// Funcoes de Sessao
// ==========================================

export async function createSession(name: string, webhookUrl: string): Promise<SessionInfo> {
  // Se ja existe, retornar info
  if (sessions.has(name)) {
    const existing = sessions.get(name)!;
    return {
      name,
      status: existing.status,
      phoneNumber: existing.phoneNumber,
      hasQrCode: !!existing.qrCode
    };
  }

  const sessionPath = path.join(SESSIONS_DIR, name);
  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
    logger: logger as any,
    browser: ['CommsNect', 'Chrome', '120.0.0'],
    connectTimeoutMs: 60000,
    qrTimeout: 60000,
    defaultQueryTimeoutMs: 60000,
  });

  const sessionData: SessionData = {
    sock,
    status: 'connecting',
    qrCode: null,
    qrCodeBase64: null,
    webhookUrl,
    phoneNumber: null,
    name
  };

  sessions.set(name, sessionData);

  // Salvar credenciais quando atualizadas
  sock.ev.on('creds.update', saveCreds);

  // Eventos de conexao
  sock.ev.on('connection.update', async (update) => {
    const { connection, qr, lastDisconnect } = update;

    if (qr) {
      sessionData.qrCode = qr;
      // Gerar QR Code como base64
      try {
        sessionData.qrCodeBase64 = await QRCode.toDataURL(qr);
      } catch (err) {
        logger.error({ err }, 'Error generating QR code base64');
      }
      logger.info({ session: name }, 'QR Code generated');

      // Enviar webhook de QR disponivel
      await sendWebhook(webhookUrl, {
        event: 'qr.update',
        session: name,
        payload: { qrCode: sessionData.qrCodeBase64 }
      });
    }

    if (connection === 'open') {
      sessionData.status = 'connected';
      sessionData.qrCode = null;
      sessionData.qrCodeBase64 = null;

      // Obter numero de telefone
      const me = sock.user;
      if (me?.id) {
        sessionData.phoneNumber = me.id.split(':')[0].replace('@s.whatsapp.net', '');
      }

      logger.info({ session: name, phone: sessionData.phoneNumber }, 'Session connected');

      // Webhook de conexao
      await sendWebhook(webhookUrl, {
        event: 'session.status',
        session: name,
        payload: { 
          status: 'WORKING',
          me: { id: sessionData.phoneNumber }
        }
      });
    }

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
      
      logger.info({ session: name, shouldReconnect }, 'Connection closed');

      if (shouldReconnect) {
        sessionData.status = 'connecting';
        // Reconectar
        setTimeout(() => createSession(name, webhookUrl), 3000);
      } else {
        sessionData.status = 'disconnected';
        sessions.delete(name);
        
        // Webhook de desconexao
        await sendWebhook(webhookUrl, {
          event: 'session.status',
          session: name,
          payload: { status: 'STOPPED' }
        });
      }
    }
  });

  // Eventos de mensagem
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      // Ignorar mensagens enviadas por mim
      if (msg.key.fromMe) continue;
      // Ignorar mensagens de status/broadcast
      if (msg.key.remoteJid === 'status@broadcast') continue;

      try {
        await processIncomingMessage(name, msg, webhookUrl);
      } catch (err) {
        logger.error({ err, msgId: msg.key.id }, 'Error processing message');
      }
    }
  });

  return {
    name,
    status: sessionData.status,
    phoneNumber: sessionData.phoneNumber,
    hasQrCode: !!sessionData.qrCode
  };
}

async function processIncomingMessage(sessionName: string, msg: proto.IWebMessageInfo, webhookUrl: string) {
  const session = sessions.get(sessionName);
  if (!session) return;

  const messageContent = msg.message;
  if (!messageContent) return;

  const contentType = getContentType(messageContent);
  const from = msg.key.remoteJid?.replace('@s.whatsapp.net', '').replace('@g.us', '') || '';
  const isGroup = msg.key.remoteJid?.endsWith('@g.us') || false;

  let body = '';
  let mediaUrl: string | null = null;
  let mediaType = 'text';
  let mimetype: string | undefined;
  let filename: string | undefined;

  // Extrair conteudo baseado no tipo
  switch (contentType) {
    case 'conversation':
      body = messageContent.conversation || '';
      break;
    case 'extendedTextMessage':
      body = messageContent.extendedTextMessage?.text || '';
      break;
    case 'imageMessage':
      mediaType = 'image';
      body = messageContent.imageMessage?.caption || '';
      mimetype = messageContent.imageMessage?.mimetype ?? undefined;
      break;
    case 'videoMessage':
      mediaType = 'video';
      body = messageContent.videoMessage?.caption || '';
      mimetype = messageContent.videoMessage?.mimetype ?? undefined;
      break;
    case 'audioMessage':
      mediaType = msg.message?.audioMessage?.ptt ? 'ptt' : 'audio';
      mimetype = messageContent.audioMessage?.mimetype ?? undefined;
      break;
    case 'documentMessage':
      mediaType = 'document';
      body = messageContent.documentMessage?.caption || '';
      mimetype = messageContent.documentMessage?.mimetype ?? undefined;
      filename = messageContent.documentMessage?.fileName || undefined;
      break;
    case 'stickerMessage':
      mediaType = 'sticker';
      mimetype = messageContent.stickerMessage?.mimetype ?? undefined;
      break;
  }

  // Payload do webhook
  const payload = {
    event: 'message',
    session: sessionName,
    payload: {
      id: msg.key.id,
      from,
      fromMe: msg.key.fromMe || false,
      isGroup,
      body,
      timestamp: msg.messageTimestamp,
      pushName: msg.pushName,
      type: mediaType,
      hasMedia: ['image', 'video', 'audio', 'ptt', 'document', 'sticker'].includes(mediaType),
      mimetype,
      filename,
      mediaUrl: null as string | null, // Sera preenchido se necessario
    }
  };

  // Se tem midia, fazer download e gerar URL base64
  if (payload.payload.hasMedia && msg.message) {
    try {
      const buffer = await downloadMediaMessage(
        msg,
        'buffer',
        {},
        {
          logger: logger as any,
          reuploadRequest: session.sock.updateMediaMessage
        }
      );
      
      if (buffer) {
        const base64 = (buffer as Buffer).toString('base64');
        payload.payload.mediaUrl = `data:${mimetype || 'application/octet-stream'};base64,${base64}`;
      }
    } catch (err) {
      logger.error({ err }, 'Error downloading media');
    }
  }

  // Enviar webhook
  await sendWebhook(webhookUrl, payload);
}

export function getSession(name: string): SessionInfo | null {
  const session = sessions.get(name);
  if (!session) return null;

  return {
    name,
    status: session.status,
    phoneNumber: session.phoneNumber,
    hasQrCode: !!session.qrCode
  };
}

export function getAllSessions(): SessionInfo[] {
  const result: SessionInfo[] = [];
  sessions.forEach((session, name) => {
    result.push({
      name,
      status: session.status,
      phoneNumber: session.phoneNumber,
      hasQrCode: !!session.qrCode
    });
  });
  return result;
}

export async function getQrCode(name: string, format?: string): Promise<{ qrCode: string | null; format: string } | null> {
  const session = sessions.get(name);
  if (!session) return null;

  if (format === 'raw') {
    return { qrCode: session.qrCode, format: 'raw' };
  }

  return { qrCode: session.qrCodeBase64, format: 'base64' };
}

export async function deleteSession(name: string): Promise<void> {
  const session = sessions.get(name);
  if (session) {
    try {
      await session.sock.logout();
    } catch (err) {
      logger.error({ err }, 'Error during logout');
    }
    sessions.delete(name);
  }

  // Remover arquivos de sessao
  const sessionPath = path.join(SESSIONS_DIR, name);
  if (fs.existsSync(sessionPath)) {
    fs.rmSync(sessionPath, { recursive: true, force: true });
  }
}

// ==========================================
// Funcoes de Mensagem
// ==========================================

export async function sendTextMessage(sessionName: string, to: string, text: string) {
  const session = sessions.get(sessionName);
  if (!session) throw new Error('Session not found');
  if (session.status !== 'connected') throw new Error('Session not connected');

  const jid = formatJid(to);
  const result = await session.sock.sendMessage(jid, { text });

  return {
    messageId: result?.key?.id,
    status: 'sent'
  };
}

export async function sendMediaMessage(
  sessionName: string, 
  to: string, 
  mediaUrl: string, 
  caption?: string,
  mediaType?: string
) {
  const session = sessions.get(sessionName);
  if (!session) throw new Error('Session not found');
  if (session.status !== 'connected') throw new Error('Session not connected');

  const jid = formatJid(to);

  // Baixar midia
  const response = await fetch(mediaUrl);
  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get('content-type') || 'application/octet-stream';

  let messageContent: any;

  // Determinar tipo de midia
  const type = mediaType || (contentType.startsWith('image') ? 'image' : 
                            contentType.startsWith('video') ? 'video' :
                            contentType.startsWith('audio') ? 'audio' : 'document');

  switch (type) {
    case 'image':
      messageContent = { image: buffer, caption };
      break;
    case 'video':
      messageContent = { video: buffer, caption };
      break;
    case 'audio':
      messageContent = { audio: buffer, mimetype: contentType };
      break;
    case 'document':
      messageContent = { 
        document: buffer, 
        mimetype: contentType,
        caption,
        fileName: caption || 'document'
      };
      break;
    default:
      messageContent = { document: buffer, mimetype: contentType };
  }

  const result = await session.sock.sendMessage(jid, messageContent);

  return {
    messageId: result?.key?.id,
    status: 'sent'
  };
}

// ==========================================
// Funcoes Auxiliares
// ==========================================

function formatJid(number: string): string {
  // Remover caracteres nao numericos
  const clean = number.replace(/\D/g, '');
  
  // Verificar se ja tem @s.whatsapp.net
  if (number.includes('@')) return number;
  
  return `${clean}@s.whatsapp.net`;
}

async function sendWebhook(url: string, payload: any): Promise<void> {
  if (!url) return;

  try {
    const webhookHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    
    // Incluir apikey para Supabase Edge Functions
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
    if (SUPABASE_ANON_KEY) {
      webhookHeaders['apikey'] = SUPABASE_ANON_KEY;
      webhookHeaders['Authorization'] = `Bearer ${SUPABASE_ANON_KEY}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: webhookHeaders,
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      logger.warn({ status: response.status, url, error: errorText.substring(0, 200) }, 'Webhook request failed');
    } else {
      logger.info({ url: url.split('?')[0] }, 'Webhook sent successfully');
    }
  } catch (err) {
    logger.error({ err, url: url.split('?')[0] }, 'Error sending webhook');
  }
}

// ==========================================
// Restaurar sessoes existentes ao iniciar
// ==========================================

export async function restoreSessions(): Promise<void> {
  const webhookUrl = process.env.WEBHOOK_URL || '';
  
  if (!fs.existsSync(SESSIONS_DIR)) return;

  const dirs = fs.readdirSync(SESSIONS_DIR, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  for (const name of dirs) {
    logger.info({ session: name }, 'Restoring session');
    try {
      await createSession(name, webhookUrl);
    } catch (err) {
      logger.error({ err, session: name }, 'Error restoring session');
    }
  }
}

// Restaurar sessoes ao importar o modulo
restoreSessions().catch(err => logger.error({ err }, 'Error in restoreSessions'));
