
# Migracao para Baileys 7.0 - Correcao definitiva do Connection Failure

## Problema
O erro `Connection Failure` no `noise-handler.js:140` afeta **todas as versoes 6.x** do Baileys. O WhatsApp atualizou seu protocolo de criptografia (Noise Protocol) e as versoes antigas nao conseguem mais completar o handshake. Este e um problema amplamente reportado na comunidade (issues #1914, #1919, #1947, #2159 no GitHub).

A unica solucao e migrar para o **Baileys 7.0** (`7.0.0-rc.9`), que e compativel com o protocolo atual.

## Mudancas necessarias

O Baileys 7.0 requer **ESM (ES Modules)** ao inves de CommonJS. Isso exige alteracoes em varios arquivos do servidor Baileys.

### 1. `deploy/baileys/package.json`
- Adicionar `"type": "module"` para habilitar ESM
- Atualizar pacote de `@whiskeysockets/baileys` versao `6.7.21` para `baileys` versao `7.0.0-rc.9`
- Atualizar script de dev para compatibilidade ESM

### 2. `deploy/baileys/tsconfig.json`
- Mudar `"module": "commonjs"` para `"module": "NodeNext"`
- Adicionar `"moduleResolution": "NodeNext"`
- Atualizar target para `ES2022`

### 3. `deploy/baileys/src/baileys.ts`
- Atualizar import de `'@whiskeysockets/baileys'` para `'baileys'`
- Atualizar imports locais para incluir extensao `.js` (requisito do ESM/NodeNext)
- Adicionar import de `fetchLatestBaileysVersion` para usar a versao correta do protocolo
- Passar a `version` obtida dinamicamente para o `makeWASocket`

### 4. `deploy/baileys/src/index.ts`
- Atualizar import local de `'./baileys'` para `'./baileys.js'`
- Atualizar import local de `'./logger'` para `'./logger.js'`

### 5. `deploy/baileys/src/logger.ts`
- Atualizar para compatibilidade ESM (sem alteracoes funcionais necessarias)

### 6. `deploy/baileys/Dockerfile`
- Nenhuma alteracao necessaria (Node 20 ja suporta ESM nativamente)

## Detalhes tecnicos

### Por que ESM?
O Baileys 7.0 usa pacotes que sao ESM-only e abandonou o CommonJS para simplificar a base de codigo. O `"type": "module"` no `package.json` faz com que o Node.js trate todos os `.js` como modulos ES.

### Por que `fetchLatestBaileysVersion`?
O WhatsApp usa versionamento de protocolo. Usar a versao correta e essencial para o handshake funcionar. A funcao `fetchLatestBaileysVersion()` do Baileys busca a versao mais recente compativel.

### Extensoes `.js` nos imports
O NodeNext exige que imports locais tenham a extensao `.js` (mesmo em arquivos `.ts`). Isso e porque o TypeScript compila `.ts` para `.js`, e o runtime do Node precisa da extensao explicita em modo ESM.

## Apos o deploy

O usuario precisara atualizar na VPS:

1. Atualizar os arquivos em `/opt/baileys/`
2. Limpar sessoes antigas: `sudo rm -rf sessions/*`
3. Rebuild com `--no-cache`: `sudo docker compose build --no-cache`
4. Reiniciar: `sudo docker compose up -d`
5. Verificar logs: `sudo docker compose logs -f baileys`

O resultado esperado e que o QR Code seja gerado com sucesso nos logs, com a mensagem "QR Code generated".
