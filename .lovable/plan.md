
# Corrigir VPS conectando ao banco do Lovable Cloud

## Problema

Quando o `update.sh` compila o frontend na VPS, o Vite embute as variaveis de ambiente do arquivo `.env` diretamente no codigo JavaScript. Como o `.env` contem a URL do Lovable Cloud (`qducanwbpleoceynmend.supabase.co`), o frontend da VPS conecta ao banco errado.

O mecanismo de `config.js` (que define `window.__SUPABASE_CONFIG__` com a URL correta da VPS) existe, mas e ignorado porque o `client.ts` so usa o runtime config quando a URL do env e "placeholder" ou vazia.

## Solucao

Alterar o comando de build no `deploy/scripts/update.sh` para passar variaveis de ambiente placeholder, forcando o `client.ts` a usar o `config.js` em vez dos valores embutidos.

### Alteracao no arquivo `deploy/scripts/update.sh` (linha 86)

Trocar:

```text
docker run --rm -v "$(pwd)":/app -w /app node:20-alpine sh -c "npm install --legacy-peer-deps && npm run build"
```

Por:

```text
docker run --rm -v "$(pwd)":/app -w /app \
  -e VITE_SUPABASE_URL=placeholder \
  -e VITE_SUPABASE_PUBLISHABLE_KEY=placeholder \
  -e VITE_SUPABASE_PROJECT_ID=self-hosted \
  node:20-alpine sh -c "npm install --legacy-peer-deps && npm run build"
```

### Por que funciona

O `client.ts` tem esta logica:

```text
if (!envUrl || envUrl.includes('placeholder') || envUrl === 'undefined') {
    // Usar runtime config (window.__SUPABASE_CONFIG__)
}
```

Ao compilar com `VITE_SUPABASE_URL=placeholder`, o codigo embutido contera "placeholder", ativando o fallback para o `config.js` que aponta para o banco local da VPS.

### Resumo

| Antes | Depois |
|-------|--------|
| Build usa URL do Lovable Cloud | Build usa "placeholder" |
| `config.js` e ignorado | `config.js` assume o controle |
| VPS conecta ao banco errado | VPS conecta ao banco local |

Nenhuma alteracao no frontend ou no `client.ts` e necessaria. Apenas o script de build precisa ser ajustado.
