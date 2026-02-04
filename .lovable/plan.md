
# Plano: Simplificacao Completa da Instalacao Baileys

## Resumo do Problema Atual

Voce identificou corretamente: a instalacao esta muito complexa. Existem varios problemas:

1. **Conflito de portas**: O VPS ja tem um Nginx rodando nas portas 80/443, e o script tenta criar OUTRO Nginx
2. **WEBHOOK_URL errada**: O .env foi configurado com o projeto Supabase errado
3. **Dois sistemas de proxy**: Um Nginx do host + um Nginx do Docker (baileys-proxy) competindo
4. **Scripts interativos**: Pedem muitas informacoes ao inves de detectar automaticamente

## Causa Raiz

O design atual assume que o Baileys tera controle total das portas 80/443, mas seu VPS ja tem um Nginx gerenciando o dominio `chatbotvital.store`. A solucao correta e:

- O Baileys deve rodar APENAS na porta 3000 (como ja esta)
- O Nginx do HOST deve fazer o proxy de `/baileys` para `localhost:3000`
- NAO precisamos do container `baileys-proxy`

## Solucao Proposta

### Parte 1: Simplificar o Docker Compose

Remover completamente o servico `nginx` do docker-compose.yml do Baileys. Ele so precisa expor a porta 3000.

**Arquivo:** `deploy/baileys/docker-compose.yml`
```yaml
services:
  baileys:
    build: .
    container_name: baileys-server
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - API_KEY=${API_KEY}
      - WEBHOOK_URL=${WEBHOOK_URL}
      - NODE_ENV=production
    volumes:
      - ./sessions:/app/sessions
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

### Parte 2: Script de Instalacao Zero-Config

Criar um novo script `install-simple.sh` que:

1. Detecta automaticamente o IP publico
2. Gera API Key automaticamente
3. Configura WEBHOOK_URL com o project_id correto (hardcoded: `qducanwbpleoceynmend`)
4. Inicia apenas o container baileys (sem proxy)
5. Gera arquivo de configuracao Nginx para o usuario copiar

**Arquivo:** `deploy/baileys/scripts/install-simple.sh`

O script ira:
- Instalar Docker se necessario
- Gerar `API_KEY` automaticamente
- Configurar `WEBHOOK_URL=https://qducanwbpleoceynmend.supabase.co/functions/v1/baileys-webhook`
- Rodar `docker compose up -d`
- Mostrar snippet Nginx para o usuario adicionar ao Nginx do host

### Parte 3: Configuracao Nginx Simplificada

Gerar um arquivo `nginx-snippet.conf` que o usuario pode incluir no Nginx existente:

```nginx
# Adicionar dentro do bloco server que escuta 443
location /baileys/ {
    proxy_pass http://127.0.0.1:3000/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

### Parte 4: Atualizar URL no Banco de Dados

A URL do Baileys no banco (`system_settings`) esta correta:
- `baileys_server_url` = `https://chatbotvital.store/baileys`

O problema e que o Nginx do host nao tem a regra de proxy configurada.

### Parte 5: Script de Diagnostico

O script `diagnostico.sh` vai verificar:
- Container rodando
- Health check local (porta 3000)
- WEBHOOK_URL correta
- Snippet Nginx necessario

## Arquivos a Serem Modificados

| Arquivo | Acao |
|---------|------|
| `deploy/baileys/docker-compose.yml` | Remover servico nginx, simplificar |
| `deploy/baileys/scripts/install-simple.sh` | Criar script zero-config |
| `deploy/baileys/scripts/diagnostico.sh` | Atualizar para nova arquitetura |
| `deploy/baileys/scripts/bootstrap.sh` | Apontar para install-simple.sh |
| `deploy/baileys/nginx-snippet.conf` | Criar arquivo com snippet |

## Resultado Final

Apos a implementacao, a instalacao sera:

```bash
curl -fsSL <url>/bootstrap.sh | sudo bash
```

E ele ira:
1. Instalar Docker
2. Baixar e iniciar o container
3. Mostrar na tela:
   - A API Key gerada
   - O snippet Nginx para adicionar ao servidor
   - Instrucao para rodar `sudo nginx -t && sudo systemctl reload nginx`
4. Funcionando!

## Secao Tecnica

### Por que o QR Code nao aparece?

1. A Edge Function `baileys-instance` tenta acessar `https://chatbotvital.store/baileys/sessions/xxx/qr`
2. O Nginx do host nao tem regra para `/baileys/`, entao retorna 502/404
3. A Edge Function recebe HTML (`<html>...`) em vez de JSON
4. O parse JSON falha, mostrando o erro que voce viu

### Fluxo Correto Apos a Correcao

```text
Frontend -> Edge Function -> https://chatbotvital.store/baileys/sessions/xxx/qr
                                         |
                          Nginx do Host (443)
                                         |
                          proxy_pass localhost:3000/sessions/xxx/qr
                                         |
                          Container Baileys (3000)
                                         |
                          Retorna JSON com QR Code
```

### Configuracao Nginx Necessaria no Host

O arquivo de configuracao do Nginx no seu VPS precisa ter algo assim:

```text
server {
    listen 443 ssl http2;
    server_name chatbotvital.store;

    ssl_certificate /etc/letsencrypt/live/chatbotvital.store/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/chatbotvital.store/privkey.pem;

    # Outras configuracoes existentes...

    # ADICIONAR ESTE BLOCO:
    location /baileys/ {
        proxy_pass http://127.0.0.1:3000/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }
}
```
