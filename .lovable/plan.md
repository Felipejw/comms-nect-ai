

# Plano: Migrar de WAHA para Baileys

## Visao Geral

Substituir o backend WAHA por Baileys como motor de conexao WhatsApp. O Baileys sera rodado em VPS do cliente via container Docker, comunicando-se com o sistema via API HTTP e webhooks.

## Por que Baileys?

| Aspecto | WAHA | Baileys |
|---------|------|---------|
| Licenca | Proprietaria (WAHA Plus pago) | Open source (MIT) |
| Dependencias | Servidor WAHA separado | Node.js puro |
| Estabilidade | Depende de atualizacoes do vendedor | Comunidade ativa |
| Customizacao | Limitada | Total controle |
| Recursos | Limitado na versao free | Todos disponiveis |

## Arquitetura Proposta

```text
┌─────────────────────────────────────────────────────────────┐
│                      VPS do Cliente                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   ┌─────────────────────────────────────────────────────┐   │
│   │              Docker Container: Baileys               │   │
│   │                                                      │   │
│   │  ┌──────────────┐  ┌──────────────┐  ┌───────────┐  │   │
│   │  │ Express API  │  │ Baileys Core │  │  Session  │  │   │
│   │  │   :3000      │  │   (WhatsApp) │  │  Storage  │   │   │
│   │  └──────┬───────┘  └──────────────┘  └───────────┘  │   │
│   │         │                                            │   │
│   │         │ Webhook                                    │   │
│   └─────────┼────────────────────────────────────────────┘   │
│             │                                                │
│   ┌─────────▼───────────────────────────────────────────┐   │
│   │                     Nginx                            │   │
│   │              (SSL + Proxy Pass)                      │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                              │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           │ HTTPS
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Lovable Cloud                             │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐  ┌──────────────────────────────────┐ │
│  │ baileys-webhook  │  │      baileys-instance            │ │
│  │ (Edge Function)  │  │      (Edge Function)             │ │
│  │                  │  │                                  │ │
│  │ - Recebe msgs    │  │ - create/delete session          │ │
│  │ - Salva no DB    │  │ - get QR code                    │ │
│  │                  │  │ - send message                   │ │
│  └──────────────────┘  └──────────────────────────────────┘ │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                   Supabase                            │   │
│  │   (connections, conversations, messages, contacts)   │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Componentes a Criar

### 1. Servidor Baileys (VPS)

Novo diretorio `deploy/baileys/` contendo:

```text
deploy/baileys/
├── docker-compose.yml      # Container Node.js + Baileys
├── Dockerfile              # Build do servidor
├── src/
│   ├── index.ts            # Express server principal
│   ├── baileys.ts          # Wrapper do Baileys
│   ├── routes/
│   │   ├── sessions.ts     # CRUD de sessoes
│   │   ├── messages.ts     # Envio de mensagens
│   │   └── health.ts       # Health check
│   └── store/              # Persistencia de sessao
├── scripts/
│   ├── install.sh          # Instalador automatizado
│   └── update.sh           # Atualizacao
├── nginx/
│   └── nginx.conf.template
└── .env.example
```

### 2. API do Servidor Baileys

Endpoints REST:

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| POST | `/sessions` | Criar nova sessao |
| GET | `/sessions/:name` | Status da sessao |
| GET | `/sessions/:name/qr` | Obter QR Code |
| DELETE | `/sessions/:name` | Desconectar/excluir |
| POST | `/sessions/:name/send/text` | Enviar texto |
| POST | `/sessions/:name/send/media` | Enviar midia |
| GET | `/health` | Health check |

### 3. Edge Functions (Lovable Cloud)

**baileys-instance** (novo):
- Mesma interface do `waha-instance` atual
- Adapta chamadas para API Baileys

**baileys-webhook** (novo):
- Recebe eventos do servidor Baileys
- Processa mensagens recebidas
- Salva no banco de dados

### 4. Atualizacoes no Frontend

Minimas - o hook `useWhatsAppConnections` ja abstrai a engine:
- Adicionar campo para URL do servidor Baileys nas configuracoes
- Indicador visual da engine em uso

## Detalhes Tecnicos

### Codigo do Servidor Baileys (Express + TypeScript)

**src/index.ts**:
```typescript
import express from 'express';
import { createSession, getSession, deleteSession, sendMessage } from './baileys';

const app = express();
app.use(express.json());

// Autenticacao via API Key
app.use((req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// Criar sessao
app.post('/sessions', async (req, res) => {
  const { name, webhookUrl } = req.body;
  const session = await createSession(name, webhookUrl);
  res.json(session);
});

// Status da sessao
app.get('/sessions/:name', async (req, res) => {
  const session = getSession(req.params.name);
  res.json(session);
});

// QR Code
app.get('/sessions/:name/qr', async (req, res) => {
  const session = getSession(req.params.name);
  res.json({ qrCode: session?.qrCode });
});

// Enviar mensagem
app.post('/sessions/:name/send/text', async (req, res) => {
  const { to, text } = req.body;
  const result = await sendMessage(req.params.name, to, { text });
  res.json(result);
});

app.listen(3000, () => console.log('Baileys server running on :3000'));
```

**src/baileys.ts**:
```typescript
import makeWASocket, { 
  DisconnectReason, 
  useMultiFileAuthState 
} from '@whiskeysockets/baileys';

const sessions = new Map();

export async function createSession(name: string, webhookUrl: string) {
  const { state, saveCreds } = await useMultiFileAuthState(`./sessions/${name}`);
  
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
  });

  sock.ev.on('creds.update', saveCreds);
  
  sock.ev.on('connection.update', async (update) => {
    const { connection, qr, lastDisconnect } = update;
    
    if (qr) {
      sessions.get(name).qrCode = qr;
      // Opcional: enviar webhook de QR disponivel
    }
    
    if (connection === 'open') {
      sessions.get(name).status = 'connected';
      sessions.get(name).qrCode = null;
      // Webhook de conexao estabelecida
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          event: 'session.status', 
          session: name,
          payload: { status: 'WORKING' }
        })
      });
    }
    
    if (connection === 'close') {
      const shouldReconnect = 
        (lastDisconnect?.error as any)?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) {
        createSession(name, webhookUrl);
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    
    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      
      // Enviar para webhook
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'message',
          session: name,
          payload: {
            id: msg.key.id,
            from: msg.key.remoteJid,
            body: msg.message?.conversation || msg.message?.extendedTextMessage?.text,
            timestamp: msg.messageTimestamp,
            pushName: msg.pushName,
            hasMedia: !!msg.message?.imageMessage || !!msg.message?.audioMessage,
            // ... mais campos
          }
        })
      });
    }
  });

  sessions.set(name, { sock, status: 'connecting', qrCode: null, webhookUrl });
  return { name, status: 'connecting' };
}

export async function sendMessage(sessionName: string, to: string, content: any) {
  const session = sessions.get(sessionName);
  if (!session) throw new Error('Session not found');
  
  const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;
  const result = await session.sock.sendMessage(jid, content);
  return { success: true, messageId: result.key.id };
}
```

### Dockerfile

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["node", "dist/index.js"]
```

### docker-compose.yml

```yaml
version: '3.8'

services:
  baileys:
    build: .
    container_name: baileys-server
    restart: always
    ports:
      - "3000:3000"
    environment:
      - API_KEY=${API_KEY}
      - WEBHOOK_URL=${WEBHOOK_URL}
    volumes:
      - ./sessions:/app/sessions  # Persistir sessoes

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf
      - /etc/letsencrypt:/etc/letsencrypt
    depends_on:
      - baileys
```

## Plano de Migracao

### Fase 1: Criar Servidor Baileys (Semana 1)
1. Criar estrutura `deploy/baileys/`
2. Implementar servidor Express com Baileys
3. Testar localmente com Docker
4. Criar script de instalacao automatizado

### Fase 2: Edge Functions (Semana 1-2)
1. Criar `baileys-instance` (clone adaptado do waha-instance)
2. Criar `baileys-webhook` (clone adaptado do waha-webhook)
3. Testar integracao ponta-a-ponta

### Fase 3: Frontend (Semana 2)
1. Adicionar configuracao de URL do servidor Baileys
2. Detectar engine automaticamente
3. Manter compatibilidade com WAHA existente

### Fase 4: Documentacao (Semana 2)
1. Guia de instalacao para VPS
2. Guia de migracao WAHA -> Baileys
3. Troubleshooting

## Arquivos a Criar/Modificar

| Arquivo | Acao |
|---------|------|
| `deploy/baileys/` | Criar diretorio completo |
| `supabase/functions/baileys-instance/` | Criar edge function |
| `supabase/functions/baileys-webhook/` | Criar edge function |
| `supabase/config.toml` | Adicionar novas functions |
| `src/hooks/useWhatsAppConnections.ts` | Adicionar suporte a Baileys |
| `src/pages/Conexoes.tsx` | Config de URL do servidor |

## Vantagens da Migracao

1. **Sem custos de licenca**: Baileys e 100% open source
2. **Maior controle**: Codigo fonte disponivel para customizacoes
3. **Comunidade ativa**: Atualizacoes frequentes
4. **Recursos completos**: Todas features do WhatsApp disponiveis
5. **Persistencia robusta**: Multi-file auth state nativo
6. **Tipagem TypeScript**: Melhor DX

## Riscos e Mitigacoes

| Risco | Mitigacao |
|-------|-----------|
| Bloqueio WhatsApp | Usar delays entre mensagens, nao fazer spam |
| Perda de sessao | Persistir auth state em volume Docker |
| Downtime na migracao | Manter WAHA funcionando em paralelo inicialmente |

