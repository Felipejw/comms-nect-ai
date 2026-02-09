

# Correcao de Bug + Guia de Atualizacao do VPS

## Causa Raiz dos Erros

Os erros persistem por uma razao simples: **o VPS nao foi atualizado com o novo codigo**. As mudancas feitas no Lovable Cloud (criar admin-write, save-system-setting, atualizar hooks) existem apenas aqui. O VPS em `chatbotvital.store` continua rodando a versao antiga.

```text
Lovable Cloud (onde editamos)     VPS (chatbotvital.store)
-------------------------------   ---------------------------
admin-write/index.ts [NOVO]       [NAO EXISTE]
save-system-setting/index.ts      [NAO EXISTE]
main/index.ts [ATUALIZADO]        [VERSAO ANTIGA]
adminWrite.ts [NOVO]              [NAO EXISTE]
safeSettingUpsert.ts [ATUALIZADO] [VERSAO ANTIGA]
useQueues.ts [ATUALIZADO]         [VERSAO ANTIGA]
```

Alem disso, ha um **bug** no `save-system-setting/index.ts`:
- Usa `auth.getClaims(token)` que NAO existe no Supabase JS v2
- O metodo correto e `auth.getUser(token)`
- Isso causaria um crash 500 mesmo se o arquivo estivesse no VPS

## Correcoes de Codigo Necessarias

### 1. Corrigir `supabase/functions/save-system-setting/index.ts`

Substituir `auth.getClaims(token)` por `auth.getUser(token)` e ajustar a leitura do userId:

```typescript
// ANTES (bugado):
const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
const userId = claimsData.claims.sub as string;

// DEPOIS (correto):
const { data: userData, error: authError } = await anonClient.auth.getUser(token);
const userId = userData.user.id;
```

### 2. Corrigir ordem de export no mesmo arquivo

```typescript
// ANTES (pode causar conflito no router VPS):
Deno.serve(handler);
export default handler;

// DEPOIS (padrao correto - export primeiro):
export default handler;
Deno.serve(handler);
```

## Guia de Atualizacao do VPS

Apos aprovar essas correcoes, voce precisara rodar estes comandos no VPS para aplicar as mudancas:

### Passo 1: Baixar o codigo atualizado

```bash
cd /opt/sistema
git pull origin main
```

Se nao estiver usando git, sera necessario copiar os arquivos manualmente (via SCP ou similar).

### Passo 2: Reiniciar o container de Edge Functions

As Edge Functions sao montadas via volume Docker (`../supabase/functions`), entao basta reiniciar:

```bash
cd /opt/sistema/deploy
sudo docker compose --profile baileys restart functions
```

### Passo 3: Reconstruir o frontend

O frontend precisa ser recompilado para incluir os novos helpers (`adminWrite.ts`, `safeSettingUpsert.ts` atualizado, etc.):

```bash
cd /opt/sistema

# Instalar dependencias e compilar
npm install
VITE_SUPABASE_URL="https://placeholder.supabase.co" \
VITE_SUPABASE_PUBLISHABLE_KEY="placeholder" \
npm run build

# Copiar build para o diretorio servido pelo Nginx
rm -rf deploy/frontend/dist/*
cp -r dist/* deploy/frontend/dist/

# Reinjetar config.js
cat > deploy/frontend/dist/config.js << 'EOF'
window.__SUPABASE_CONFIG__ = {
  url: window.location.origin,
  anonKey: "SUA_ANON_KEY_AQUI"
};
EOF

# Injetar script tag no index.html
sed -i 's|</head>|<script src="/config.js"></script>\n</head>|' deploy/frontend/dist/index.html

# Reiniciar nginx para servir o novo frontend
sudo docker compose --profile baileys restart nginx
```

(Substitua `SUA_ANON_KEY_AQUI` pela sua ANON_KEY real do arquivo `deploy/.env`)

### Passo 4 (alternativo): Reinstalacao completa

Se preferir, rode o script de instalacao unificada que faz tudo automaticamente:

```bash
cd /opt/sistema/deploy
sudo DOMAIN=chatbotvital.store ./scripts/install-unified.sh
```

**ATENCAO**: Esse script recria o banco de dados. Faca backup antes!

## Arquivos Afetados (apenas correcao do bug)

1. `supabase/functions/save-system-setting/index.ts` - Corrigir getClaims para getUser e ordem do export

