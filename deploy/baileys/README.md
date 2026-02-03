# Baileys WhatsApp Server

Servidor WhatsApp usando a biblioteca Baileys para conexao via QR Code.

## Requisitos

- VPS com Ubuntu 20.04+ ou Debian 11+
- Minimo 1GB RAM, 1 vCPU
- Dominio apontando para o servidor
- Portas 80 e 443 liberadas

## Instalacao Rapida

```bash
# Clonar repositorio
git clone https://github.com/seu-usuario/comms-nect-ai.git
cd comms-nect-ai/deploy/baileys

# Dar permissao e executar instalador
chmod +x scripts/*.sh
sudo ./scripts/install.sh
```

O instalador ira:
1. Instalar Docker e Docker Compose
2. Gerar API Key automaticamente
3. Configurar SSL com Let's Encrypt
4. Iniciar o servidor

## Configuracao Manual

1. Copie o arquivo de exemplo:
```bash
cp .env.example .env
```

2. Edite o arquivo `.env`:
```bash
nano .env
```

3. Gere uma API Key:
```bash
openssl rand -hex 32
```

4. Inicie os containers:
```bash
docker compose up -d
```

## API Endpoints

### Health Check
```bash
curl https://seu-dominio.com/health
```

### Criar Sessao
```bash
curl -X POST https://seu-dominio.com/sessions \
  -H "X-API-Key: SUA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "minha-sessao"}'
```

### Obter QR Code
```bash
curl https://seu-dominio.com/sessions/minha-sessao/qr \
  -H "X-API-Key: SUA_API_KEY"
```

### Enviar Mensagem
```bash
curl -X POST https://seu-dominio.com/sessions/minha-sessao/send/text \
  -H "X-API-Key: SUA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"to": "5511999999999", "text": "Ola!"}'
```

### Deletar Sessao
```bash
curl -X DELETE https://seu-dominio.com/sessions/minha-sessao \
  -H "X-API-Key: SUA_API_KEY"
```

## Logs

```bash
# Ver todos os logs
docker compose logs -f

# Apenas Baileys
docker compose logs -f baileys

# Apenas Nginx
docker compose logs -f nginx
```

## Atualizacao

```bash
sudo ./scripts/update.sh
```

## Estrutura de Diretorios

```
deploy/baileys/
├── docker-compose.yml      # Configuracao Docker
├── Dockerfile              # Build do servidor
├── .env                    # Variaveis de ambiente
├── sessions/               # Dados das sessoes (persistente)
├── nginx/
│   └── nginx.conf          # Configuracao do proxy
├── scripts/
│   ├── install.sh          # Instalador
│   └── update.sh           # Atualizador
└── src/
    ├── index.ts            # Servidor Express
    ├── baileys.ts          # Logica do Baileys
    └── logger.ts           # Logging
```

## Webhooks

O servidor envia webhooks para a URL configurada em `WEBHOOK_URL`:

### Eventos

- `session.status` - Mudanca de status da sessao
- `qr.update` - QR Code disponivel
- `message` - Mensagem recebida

### Formato do Payload

```json
{
  "event": "message",
  "session": "nome-da-sessao",
  "payload": {
    "id": "ABCD1234",
    "from": "5511999999999",
    "body": "Texto da mensagem",
    "type": "text",
    "hasMedia": false,
    "timestamp": 1234567890
  }
}
```

## Solucao de Problemas

### QR Code nao aparece
- Verifique os logs: `docker compose logs baileys`
- Tente recriar a sessao

### Conexao cai frequentemente
- O WhatsApp pode banir conexoes suspeitas
- Evite enviar muitas mensagens em sequencia
- Use delays entre mensagens

### Certificado SSL invalido
- Verifique se o dominio aponta corretamente
- Renove o certificado: `sudo certbot renew`
