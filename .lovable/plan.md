

# Analise Completa do Sistema de Deploy VPS

## Problemas Identificados

### 1. CRITICO: Caminho do frontend inconsistente entre scripts

O `docker-compose.yml` monta o frontend de **dois caminhos diferentes** dependendo do script usado:

- **docker-compose.yml** (Nginx volume): `./frontend/dist:/usr/share/nginx/html:ro`
- **install-unified.sh**: copia para `deploy/frontend/dist/` (correto)
- **update.sh**: copia para `deploy/volumes/frontend/` (ERRADO - caminho inexistente no docker-compose)
- **install.sh**: copia para `deploy/frontend/dist/` (correto)

O `update.sh` precisa ser corrigido para copiar para `deploy/frontend/dist/` em vez de `deploy/volumes/frontend/`.

### 2. CRITICO: config.js nao e gerado automaticamente no update

O `update.sh` preserva `config.js` de `volumes/frontend/` (caminho errado). Se o config.js nao existir nesse local, o frontend fica sem configuracao runtime e conecta no Lovable Cloud ou falha.

### 3. CRITICO: index.html nao inclui `<script src="/config.js">` no source

O arquivo `index.html` do repositorio NAO tem a tag `<script src="/config.js">`. Ela so e injetada via `sed` durante a instalacao. Se o build sobrescreve o `index.html`, a tag se perde e precisa ser re-injetada.

### 4. MEDIO: Dois scripts de instalacao duplicados e divergentes

Existem **dois scripts de instalacao** com logicas diferentes:
- `deploy/scripts/install.sh` (1240 linhas) - gera nginx.conf inline, nao usa `generate_frontend_config()`
- `deploy/scripts/install-unified.sh` (1185 linhas) - mais robusto, gera `config.js` com `window.location.origin`

O `bootstrap-local.sh` chama `install-unified.sh`. O `install.sh` fica orfao mas pode ser chamado por engano.

### 5. MEDIO: Nginx config divergente entre install.sh e o arquivo em disco

O `install.sh` gera um `nginx.conf` inline (linhas 547-766) que e **diferente** do `deploy/nginx/nginx.conf` em disco:
- O inline redireciona HTTP->HTTPS e NAO tem `location = /config.js`
- O em disco serve em HTTP e HTTPS, com `location = /config.js` e headers no-cache

### 6. MENOR: Kong config inconsistente

O `install-unified.sh` gera kong.yml **sem ACLs** (sem `acl` plugin nas rotas REST/Storage). O `install.sh` gera kong.yml **com ACLs** e consumers com `keyauth_credentials`. Ambos devem ter a mesma config.

---

## Plano de Correcoes

### Passo 1: Corrigir `update.sh` - Caminho do frontend

Alterar todas as referencias de `volumes/frontend/` para `frontend/dist/` no `update.sh`, alinhando com o docker-compose.yml.

### Passo 2: Gerar config.js automaticamente no `update.sh`

Apos copiar o build, o `update.sh` deve:
1. Ler `ANON_KEY` do `.env`
2. Gerar `config.js` com `window.location.origin` e a `anonKey`
3. Injetar `<script src="/config.js">` no `index.html` se ausente

### Passo 3: Adicionar `<script src="/config.js">` ao `index.html` no source

Incluir a tag diretamente no `index.html` do repositorio. Assim, nao depende de `sed` pos-build. O Lovable Cloud simplesmente ignora o arquivo (404 silencioso, sem efeito). Na VPS, o `config.js` sera servido pelo Nginx.

### Passo 4: Eliminar `install.sh` duplicado

Renomear ou remover `deploy/scripts/install.sh` (o antigo). O `install-unified.sh` e o script principal e mais robusto. Criar um symlink `install.sh -> install-unified.sh` para compatibilidade.

### Passo 5: Sincronizar `nginx.conf` unico

O `install-unified.sh` e o `install.sh` ambos geram nginx.conf inline. Remover a geracao inline e usar o arquivo `deploy/nginx/nginx.conf` que ja existe e e mais completo (tem `location = /config.js`, suporta HTTP e HTTPS, headers corretos).

### Passo 6: Tornar Kong config consistente

Unificar a geracao do `kong.yml` para incluir ACLs e consumers em ambos os scripts (na pratica, so no `install-unified.sh` apos remover o duplicado).

---

## Detalhes Tecnicos das Alteracoes

### Arquivo: `index.html`
Adicionar antes de `</head>`:
```html
<script src="/config.js"></script>
```

### Arquivo: `deploy/scripts/update.sh`
- Linha 99-113: Trocar `volumes/frontend/` por `frontend/dist/`
- Adicionar geracao automatica do `config.js` usando ANON_KEY do `.env`
- Manter a logica de injecao do script tag como fallback

### Arquivo: `deploy/scripts/install-unified.sh`
- Remover geracao inline do nginx.conf (usar o arquivo existente em `deploy/nginx/nginx.conf`)
- Adicionar ACLs no kong.yml gerado
- Na funcao `generate_frontend_config()`, tambem copiar para `frontend/dist/` (ja faz)

### Arquivo: `deploy/scripts/install.sh`
- Substituir conteudo por redirect para `install-unified.sh` (manter compatibilidade)

### Arquivo: `deploy/nginx/nginx.conf`
- Ja esta correto (tem `location = /config.js`, suporta HTTP+HTTPS)
- Nenhuma alteracao necessaria

