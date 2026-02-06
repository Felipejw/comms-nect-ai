

# Plano: Conectar Baileys Automaticamente a Rede do Supabase

## Problema

O arquivo `deploy/baileys/docker-compose.yml` nao declara nenhuma rede Docker. Quando voce sobe o Baileys com `docker compose up`, ele cria sua propria rede isolada. O Nginx (container `app-nginx`) esta na rede `deploy_supabase-network` e nao consegue se comunicar com o `baileys-server`, resultando no erro 502.

## Solucao

Modificar o `deploy/baileys/docker-compose.yml` para conectar o container `baileys-server` a rede `deploy_supabase-network` como rede externa.

### Alteracao no arquivo `deploy/baileys/docker-compose.yml`

Adicionar:
- A rede `deploy_supabase-network` como rede externa na secao `networks` do arquivo
- A referencia a essa rede no servico `baileys`

O arquivo ficara assim:

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
      - LOG_LEVEL=${LOG_LEVEL:-info}
    volumes:
      - ./sessions:/app/sessions
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s
    networks:
      - supabase-network
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

networks:
  supabase-network:
    name: deploy_supabase-network
    external: true
```

## O que muda

| Antes | Depois |
|-------|--------|
| Container em rede isolada | Container na mesma rede do Nginx e Supabase |
| Precisa de `docker network connect` manual | Conexao automatica ao subir o container |
| Erro 502 no proxy | Nginx resolve `baileys-server:3000` via DNS interno |

## Passos apos publicacao

No VPS, basta recriar o container do Baileys:

```bash
cd /caminho/do/baileys
sudo docker compose down
sudo docker compose up -d --build
```

E recarregar o Nginx:

```bash
sudo docker exec app-nginx nginx -s reload
```

Depois testar:

```bash
curl https://chatbotvital.store/baileys/health
```

## Secao Tecnica

A chave da solucao e declarar a rede como `external: true` com o atributo `name: deploy_supabase-network`. Isso indica ao Docker Compose que a rede ja existe (criada pelo compose principal do Supabase) e o container deve se juntar a ela em vez de criar uma nova. O atributo `name` e necessario porque o Docker Compose prefixa automaticamente o nome do diretorio ao nome da rede -- sem ele, o compose tentaria criar `baileys_supabase-network` em vez de usar `deploy_supabase-network`.
