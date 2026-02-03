

# Plano: Corrigir Erro de Build do Docker (Baileys)

## Problema Identificado

O comando `npm run build` falha porque faltam dependências no `package.json`:

1. **`@hapi/boom`** - Usado no arquivo `baileys.ts` linha 9:
   ```typescript
   import { Boom } from '@hapi/boom';
   ```

2. **`pino-pretty`** - Usado no arquivo `logger.ts` linha 5-8:
   ```typescript
   transport: process.env.NODE_ENV !== 'production' ? {
     target: 'pino-pretty',  // <-- Requer pino-pretty instalado
     ...
   }
   ```

## Solucao

Adicionar as dependências faltantes ao `package.json`:

| Pacote | Tipo | Motivo |
|--------|------|--------|
| `@hapi/boom` | dependencies | Tratamento de erros de conexão Baileys |
| `pino-pretty` | devDependencies | Formatação de logs em desenvolvimento |
| `@types/qrcode` | devDependencies | Tipos TypeScript para qrcode (já existe) |

## Alteracoes no Arquivo

**Arquivo:** `deploy/baileys/package.json`

```json
{
  "dependencies": {
    "@whiskeysockets/baileys": "^6.7.16",
    "@hapi/boom": "^10.0.1",       // ADICIONAR
    "express": "^4.21.2",
    "pino": "^9.6.0",
    "qrcode": "^1.5.4",
    "dotenv": "^16.4.7"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "@types/node": "^22.10.5",
    "@types/qrcode": "^1.5.5",
    "pino-pretty": "^11.0.0",      // ADICIONAR
    "ts-node-dev": "^2.0.0",
    "typescript": "^5.7.2"
  }
}
```

## Apos Correcao

Execute novamente no servidor:

```bash
cd /opt/baileys
sudo docker compose build --no-cache
sudo docker compose up -d
```

## Alternativa Rapida (no Servidor)

Se preferir corrigir diretamente no servidor sem esperar deploy:

```bash
cd /opt/baileys
nano package.json
# Adicionar @hapi/boom e pino-pretty manualmente
docker compose build --no-cache
docker compose up -d
```

