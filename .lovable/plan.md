

# Analise Completa do Sistema de Deploy VPS

## Status: ✅ CONCLUÍDO

Todas as correções foram implementadas.

## Correções Aplicadas

### ✅ Passo 1: `index.html` - Script tag permanente
- Adicionado `<script src="/config.js"></script>` diretamente no source `index.html`
- No Lovable Cloud, o arquivo não existe (404 silencioso, sem efeito)
- Na VPS, o `config.js` é servido pelo Nginx com headers no-cache

### ✅ Passo 2: `deploy/scripts/update.sh` - Caminhos corrigidos + config.js automático
- Trocado `volumes/frontend/` por `frontend/dist/` (alinhado com docker-compose.yml)
- Adicionada geração automática do `config.js` a partir do `ANON_KEY` do `.env`
- Mantida injeção da script tag como fallback no index.html

### ✅ Passo 3: `deploy/scripts/install.sh` - Redirecionamento
- Substituído por redirect para `install-unified.sh`
- Mantida compatibilidade para quem chamar o antigo script

### ✅ Passo 4: `deploy/scripts/install-unified.sh` - Kong com ACLs
- Kong config agora inclui `consumers`, `acls`, `key-auth` e `acl` plugin em todas as rotas
- Auth com rotas abertas (verify, callback, authorize) + rota principal com key-auth
- Alinhado com o formato do antigo `install.sh`

### ✅ Passo 5: `deploy/nginx/nginx.conf` - Sem alteração necessária
- Já contém `location = /config.js` com headers no-cache
- Suporta HTTP e HTTPS

## Fluxo Automatizado Resultante

### Instalação nova (`install-unified.sh`):
1. Gera JWT keys, .env, kong.yml com ACLs
2. Compila frontend com placeholders
3. Gera `config.js` com `window.location.origin` e `anonKey`
4. Injeta `<script src="/config.js">` no index.html (fallback, já está no source)
5. Inicia todos os serviços

### Atualização (`update.sh`):
1. Git pull + rebuild frontend
2. Copia build para `frontend/dist/` (caminho correto)
3. Preserva `config.js` existente OU gera novo automaticamente
4. Injeta script tag no index.html se ausente (fallback)
5. Reinicia containers
