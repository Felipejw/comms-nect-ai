

# Corrigir o apontamento do Edge Runtime na VPS

## O que esta acontecendo

Os logs mostram claramente que o container continua executando `main/index.ts` (o arquivo antigo com `../` imports):

```
file:///home/deno/functions/main/index.ts:54:20
Importing admin-write from ../admin-write/index.ts...
FAILED: Module not found
```

Dois problemas causam isso:

1. **`--main-service /home/deno/functions`** (diretorio) -- O Edge Runtime, ao receber um diretorio como main-service, busca automaticamente `main/index.ts` dentro dele. Ele nunca leu o `index.ts` na raiz.

2. **Container nao foi recriado** -- `docker compose up -d` viu o container como "Running" e nao aplicou a mudanca de configuracao. Precisa de `--force-recreate`.

## Solucao

### 1. Alterar `deploy/docker-compose.yml`

Apontar `--main-service` diretamente para o arquivo correto:

De:
```yaml
command:
  - start
  - --main-service
  - /home/deno/functions
  - --port
  - "8000"
```

Para:
```yaml
command:
  - start
  - --main-service
  - /home/deno/functions/index.ts
  - --port
  - "8000"
```

### 2. Nenhuma outra alteracao de codigo

O arquivo `supabase/functions/index.ts` ja esta correto com imports dinamicos (`await import(./${name}/index.ts)`). O `main/index.ts` continua como health-check simples para o Cloud.

### 3. Comandos para aplicar na VPS

Apos o deploy:

```bash
cd /opt/sistema && git pull origin main
cd deploy
sudo docker compose up -d --force-recreate functions
sleep 5
sudo docker logs supabase-functions --tail 15
```

O `--force-recreate` garante que o container seja destruido e recriado com o novo `command`, mesmo que a imagem nao tenha mudado.

## Por que vai funcionar agora

- O Edge Runtime recebe o caminho exato `/home/deno/functions/index.ts` como ponto de entrada
- Esse arquivo usa `await import(./${name}/index.ts)` que resolve para `/home/deno/functions/admin-write/index.ts` -- dentro do sandbox
- O Cloud ignora `index.ts` na raiz (nao esta em subpasta de funcao) e continua deployando cada funcao isoladamente

