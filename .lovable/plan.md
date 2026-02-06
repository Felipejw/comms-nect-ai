
# Correção: Erro ao Salvar Configurações no VPS

## Causa Raiz Identificada

O Nginx no VPS bloqueia operações de escrita (PATCH, POST) por causa de headers CORS incompletos.

O Supabase JS envia estes headers em operações de escrita:
- `content-profile: public` (obrigatorio para PATCH/POST)
- `accept-profile: public` (para SELECT)
- `prefer: return=minimal` (para mutations)

Mas o Nginx so permite:
```text
Authorization, Content-Type, apikey, X-Client-Info, x-upsert
```

Resultado: o browser envia um preflight OPTIONS antes do PATCH. O Nginx responde que `content-profile` nao e permitido. O browser bloqueia a requisicao real e o frontend mostra "Erro ao salvar".

As leituras (GET) funcionam porque o browser pode nao exigir preflight para certos headers ou o preflight pode ter sido cacheado por outra rota.

## Correção

### 1. Atualizar CORS no Nginx (deploy/nginx/nginx.conf)

Adicionar os headers ausentes em TODOS os blocos de location que tem CORS (REST, Auth, Storage, Functions):

**De:**
```
Access-Control-Allow-Headers "Authorization, Content-Type, apikey, X-Client-Info, x-upsert"
```

**Para:**
```
Access-Control-Allow-Headers "Authorization, Content-Type, apikey, X-Client-Info, x-upsert, accept-profile, content-profile, prefer, x-supabase-api-version"
```

Sao 8 blocos que precisam ser atualizados (4 locations x 2 servers HTTP/HTTPS), cada um com 2 ocorrencias (dentro do `if OPTIONS` e fora).

### 2. Corrigir mensagem de erro generica (src/hooks/useSystemSettings.ts)

O hook `useSystemSettings` tem handlers `onError` que mostram mensagens genericas, dificultando o diagnostico:

**De:**
```typescript
onError: () => {
  toast.error("Erro ao salvar configuração");
}
```

**Para:**
```typescript
onError: (error: any) => {
  toast.error(`Erro ao salvar: ${error?.message || 'desconhecido'}`);
}
```

Isso se aplica a ambas as mutations: `updateSetting` e `createOrUpdateSetting`.

### 3. Apos implementacao, atualizar VPS

```bash
cd /opt/sistema && git pull origin main
cd deploy
sudo docker compose restart nginx
```

## Detalhes Tecnicos

### Arquivos modificados

| Arquivo | Alteracao |
|---------|-----------|
| `deploy/nginx/nginx.conf` | Adicionar 4 headers CORS faltantes em 16 diretivas `add_header` |
| `src/hooks/useSystemSettings.ts` | Mostrar erro real nas 2 mutations |

### Por que GET funciona mas PATCH nao

O browser faz preflight (OPTIONS) antes de qualquer requisicao com headers customizados. Para PATCH, o header `content-profile` e enviado pelo Supabase JS e nao esta na lista de permitidos. O browser recebe a resposta do OPTIONS dizendo que `content-profile` nao e aceito, e bloqueia o PATCH completamente -- sem sequer enviar a requisicao ao servidor.

Para GET, o `accept-profile` tambem nao esta na lista, mas o browser pode ter cacheado um preflight anterior (Kong tambem tem plugin CORS e pode ter respondido com headers mais permissivos), ou ha uma race condition no cache de preflight.
