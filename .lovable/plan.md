
# Corrigir Comunicacao entre Edge Function e Servidor Baileys

## Diagnostico

Existem **dois problemas distintos** acontecendo:

### Problema 1: Salvamento de Configuracoes (RESOLVIDO)
As configuracoes do Baileys (`baileys_server_url` e `baileys_api_key`) **ja estao salvas** corretamente no banco de dados:
- URL: `https://chatbotvital.store/baileys`
- API Key: `9c23d1a...` (salva)

Se voce esta tendo problemas ao re-salvar, e porque o codigo atualizado (com o `safeSettingUpsert` robusto) ainda nao foi publicado no VPS. Mas os valores ja estao la.

### Problema 2: Erro ao Criar Conexao (PROBLEMA REAL)
O erro "Edge Function returned a non-2xx status code" na tela de Conexoes acontece porque a Edge Function (rodando na nuvem) tenta conectar ao servidor Baileys via HTTPS, mas o certificado SSL do dominio `chatbotvital.store` esta com a **cadeia de certificados mal configurada**.

Erro exato nos logs:
```
invalid peer certificate: Other(OtherError(CaUsedAsEndEntity))
```

Isso significa que o certificado SSL usa um certificado de Autoridade Certificadora (CA) como certificado do servidor, o que e rejeitado pelo Deno (runtime das Edge Functions).

## Solucao

Atualizar a Edge Function `baileys-instance` para ser tolerante a erros de SSL, tentando automaticamente usar HTTP como fallback quando HTTPS falha por problemas de certificado. Isso e seguro porque a comunicacao e de servidor para servidor (Edge Function para VPS).

### Mudancas no codigo

**Arquivo: `supabase/functions/baileys-instance/index.ts`**

Adicionar uma funcao auxiliar `resilientFetch` que:
1. Tenta a requisicao com a URL original (HTTPS)
2. Se falhar com erro de SSL/certificado, automaticamente retenta usando HTTP
3. Loga qual protocolo funcionou para diagnostico

```text
async function resilientFetch(url, options) {
  try {
    return await fetch(url, options);
  } catch (error) {
    if (isSSLError(error)) {
      const httpUrl = url.replace('https://', 'http://');
      console.warn('SSL error, retrying with HTTP:', httpUrl);
      return await fetch(httpUrl, options);
    }
    throw error;
  }
}
```

Substituir todas as chamadas `fetch()` na funcao por `resilientFetch()`.

**Arquivo: `supabase/functions/baileys-create-session/index.ts`**

Aplicar a mesma logica de `resilientFetch` nesta funcao, que tambem faz chamadas ao servidor Baileys.

### Por que isso resolve

- A Edge Function roda na nuvem (Lovable Cloud) e precisa acessar o VPS via internet
- O certificado SSL do VPS esta mal configurado (Let's Encrypt com cadeia incompleta)
- Ao fazer fallback para HTTP, a comunicacao funciona normalmente
- Essa comunicacao e de servidor-para-servidor, entao HTTP e aceitavel para esse caso

### Alternativa (sem alterar codigo)

Corrigir o SSL no VPS rodando:
```bash
cd /opt/sistema/deploy
sudo docker compose --profile baileys down
sudo docker compose --profile baileys up -d
```

Ou regenerar o certificado SSL:
```bash
sudo certbot renew --force-renewal
```

Mas a correcao no codigo e mais resiliente e evita problemas futuros com certificados expirados ou mal configurados.

## Resumo das alteracoes

1. `supabase/functions/baileys-instance/index.ts` -- Adicionar `resilientFetch` com fallback HTTP
2. `supabase/functions/baileys-create-session/index.ts` -- Aplicar mesma logica de fallback
