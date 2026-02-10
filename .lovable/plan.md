

# Corrigir Frontend para Priorizar Configuracao Dinamica

## Problema

O arquivo `client.ts` verifica se a URL compilada contem "placeholder" para decidir se usa o `window.__SUPABASE_CONFIG__`. Quando o build nao usa placeholders (por qualquer motivo), o frontend tenta conectar ao Lovable Cloud em vez do servidor local, causando "Failed to fetch".

## Solucao

Inverter a logica: se `window.__SUPABASE_CONFIG__` existir, **sempre** usa-lo, independente das variaveis de ambiente compiladas. Isso garante que o `config.js` injetado no VPS sempre tenha prioridade.

## Mudanca Tecnica

**Arquivo:** `src/integrations/supabase/client.ts`

Alterar a funcao `getRuntimeConfig()` de:

```text
// Atual: so usa runtime config se env tem "placeholder"
if (!envUrl || envUrl.includes('placeholder') || envUrl === 'undefined') {
    const runtimeConfig = window.__SUPABASE_CONFIG__;
    if (runtimeConfig) { ... }
}
```

Para:

```text
// Novo: runtime config SEMPRE tem prioridade
const runtimeConfig = window.__SUPABASE_CONFIG__;
if (runtimeConfig?.url && runtimeConfig?.anonKey) {
    return { url: runtimeConfig.url, key: runtimeConfig.anonKey };
}
// Fallback: usar variaveis de ambiente (Lovable Cloud)
return { url: envUrl, key: envKey };
```

## Impacto

- **VPS/Self-hosted**: Funciona sempre, pois o `config.js` define `window.__SUPABASE_CONFIG__`
- **Lovable Cloud**: Continua funcionando, pois nao tem `config.js` e usa as env vars normais
- **Elimina a necessidade** de rebuild com placeholders no futuro

## Apos Aprovacao

Depois de implementar, o usuario precisara apenas rodar na VPS:

```bash
cd /opt/sistema/deploy
sudo docker compose --profile baileys restart nginx
```

E fazer hard refresh no navegador (Cmd+Shift+R).

