

# Plano: Remover WAHA, Evolution API e WPPConnect - Manter apenas Baileys

## Resumo das Mudancas

Este plano remove completamente todas as referencias a engines legadas de WhatsApp (WAHA, Evolution API, WPPConnect), consolidando o sistema para usar exclusivamente **Baileys** como engine principal para conexoes via QR Code.

## Inventario de Arquivos a Modificar

### Edge Functions a DELETAR

| Arquivo | Motivo |
|---------|--------|
| `supabase/functions/waha-instance/` | Engine WAHA removido |
| `supabase/functions/waha-webhook/` | Engine WAHA removido |

### Edge Functions a ATUALIZAR

| Arquivo | Mudanca |
|---------|---------|
| `supabase/functions/send-whatsapp/index.ts` | Remover `sendViaWAHA()`, remover referencias a `EVOLUTION_API_*` |
| `supabase/functions/sync-contacts/index.ts` | Reescrever para usar Baileys API |
| `supabase/functions/update-lid-contacts/index.ts` | Reescrever para usar Baileys API |
| `supabase/functions/resolve-lid-contact/index.ts` | Reescrever para usar Baileys API |
| `supabase/functions/process-schedules/index.ts` | Remover referencias Evolution, usar Baileys |

### Arquivos Frontend a ATUALIZAR

| Arquivo | Mudanca |
|---------|---------|
| `src/hooks/useWhatsAppConnections.ts` | Remover logica de escolha WAHA vs Baileys, usar apenas Baileys |

### Arquivos de Deploy a DELETAR

| Arquivo/Diretorio | Motivo |
|-------------------|--------|
| `deploy/waha/` (diretorio inteiro) | Engine WAHA removido |

### Arquivos de Deploy a ATUALIZAR

| Arquivo | Mudanca |
|---------|---------|
| `deploy/scripts/backup.sh` | Remover secao WPPConnect, adicionar secao Baileys |
| `deploy/CHANGELOG.md` | Adicionar entrada sobre migracao para Baileys |

### Arquivos de Configuracao

| Arquivo | Mudanca |
|---------|---------|
| `supabase/config.toml` | Remover entradas `waha-instance` e `waha-webhook` |

## Detalhamento das Mudancas

### 1. Deletar Edge Functions WAHA

Remover completamente os diretorios:
- `supabase/functions/waha-instance/`
- `supabase/functions/waha-webhook/`

### 2. Atualizar `send-whatsapp/index.ts`

**Antes:**
```typescript
const WAHA_API_URL = Deno.env.get("WAHA_API_URL") || Deno.env.get("EVOLUTION_API_URL");
const WAHA_API_KEY = Deno.env.get("WAHA_API_KEY") || Deno.env.get("EVOLUTION_API_KEY");

// Roteamento por engine
if (connection.type === "meta_api") {
  result = await sendViaMetaAPI(...);
} else if (connection.session_data?.engine === "baileys") {
  result = await sendViaBaileys(...);
} else {
  result = await sendViaWAHA(...);
}
```

**Depois:**
```typescript
// Apenas duas opcoes: Meta API ou Baileys
if (connection.type === "meta_api") {
  result = await sendViaMetaAPI(...);
} else {
  result = await sendViaBaileys(...);
}
```

Remover:
- Constantes `WAHA_API_URL` e `WAHA_API_KEY`
- Funcao `sendViaWAHA()`
- Referencias a Evolution API

### 3. Atualizar `sync-contacts/index.ts`

**Antes:** Usa `EVOLUTION_API_URL` e endpoints da Evolution API
**Depois:** Usa Baileys API via `baileys_server_url`

```typescript
// Buscar configuracao do Baileys
const { data: settings } = await supabase
  .from("system_settings")
  .select("value")
  .eq("key", "baileys_server_url")
  .single();

const baileysUrl = settings?.value;

// Buscar contatos via Baileys
const response = await fetch(
  `${baileysUrl}/sessions/${sessionName}/contacts`,
  { headers: { "X-API-Key": baileysApiKey } }
);
```

### 4. Atualizar `update-lid-contacts/index.ts`

Mesma logica - migrar de Evolution API para Baileys API.

### 5. Atualizar `resolve-lid-contact/index.ts`

**Antes:** Usa WPPConnect endpoints (`/api/${sessionName}/contact/pn-lid/...`)
**Depois:** Usa Baileys endpoints (`/sessions/${sessionName}/resolve-lid/...`)

### 6. Atualizar `process-schedules/index.ts`

**Antes:**
```typescript
const evolutionApiUrl = Deno.env.get("EVOLUTION_API_URL");
const evolutionApiKey = Deno.env.get("EVOLUTION_API_KEY");
// ...
await fetch(`${evolutionApiUrl}/message/sendText/${connection.name}`, ...);
```

**Depois:**
```typescript
// Invocar send-whatsapp que ja sabe usar Baileys
await supabase.functions.invoke('send-whatsapp', {
  body: { conversationId, content: schedule.message_content }
});
```

### 7. Simplificar `useWhatsAppConnections.ts`

**Antes:**
```typescript
const createConnection = useMutation({
  mutationFn: async ({ instanceName, engine = 'baileys' }: { instanceName: string; engine?: 'waha' | 'baileys' }) => {
    const functionName = engine === 'baileys' ? 'baileys-instance' : 'waha-instance';
    // ...
  }
});

const getEdgeFunctionName = (connectionId: string): string => {
  const connection = connections.find(c => c.id === connectionId);
  return connection?.session_data?.engine === 'baileys' ? 'baileys-instance' : 'waha-instance';
};
```

**Depois:**
```typescript
const createConnection = useMutation({
  mutationFn: async ({ instanceName }: { instanceName: string }) => {
    const { data, error } = await supabase.functions.invoke('baileys-instance', {
      body: { action: "create", instanceName },
    });
    // ...
  }
});

// Sempre usar baileys-instance
const EDGE_FUNCTION = 'baileys-instance';
```

### 8. Atualizar `supabase/config.toml`

Remover:
```toml
[functions.waha-instance]
verify_jwt = false

[functions.waha-webhook]
verify_jwt = false
```

### 9. Deletar `deploy/waha/`

Remover diretorio inteiro:
- `deploy/waha/.env.example`
- `deploy/waha/README.md`
- `deploy/waha/docker-compose.yml`
- `deploy/waha/install-waha.sh`
- `deploy/waha/nginx/`
- `deploy/waha/scripts/`

### 10. Atualizar `deploy/scripts/backup.sh`

**Antes:**
```bash
# 4. Backup do WPPConnect (Multi-Instance)
log_info "Fazendo backup das sessões do WhatsApp..."
WPPCONNECT_BACKUP="$BACKUP_DIR/wppconnect_backup_$DATE.tar.gz"
```

**Depois:**
```bash
# 4. Backup do Baileys
log_info "Fazendo backup das sessões do WhatsApp (Baileys)..."
BAILEYS_BACKUP="$BACKUP_DIR/baileys_backup_$DATE.tar.gz"

if [ -d "/opt/baileys/sessions" ]; then
    tar -czf "$BAILEYS_BACKUP" -C /opt/baileys sessions
    log_success "Baileys: baileys_backup_$DATE.tar.gz"
else
    log_info "Pasta baileys/sessions não encontrada, pulando..."
fi
```

### 11. Atualizar `deploy/CHANGELOG.md`

Adicionar nova entrada:

```markdown
## [3.0.0] - 2025-02-03

### Mudancas Importantes
- **Consolidacao para Baileys como unico engine WhatsApp**
  - Removido suporte a WAHA
  - Removido suporte a Evolution API
  - Removido suporte a WPPConnect

### Removido
- Edge functions `waha-instance` e `waha-webhook`
- Diretorio `deploy/waha/`
- Variaveis `WAHA_*`, `EVOLUTION_*`, `WPPCONNECT_*`

### Atualizado
- `send-whatsapp`: Usa apenas Baileys ou Meta API
- `sync-contacts`: Migrado para Baileys API
- `update-lid-contacts`: Migrado para Baileys API
- `resolve-lid-contact`: Migrado para Baileys API
- `process-schedules`: Usa send-whatsapp internamente

### Notas de Migracao
1. Conexoes existentes com engine WAHA precisarao ser recriadas
2. Instale o servidor Baileys: `curl -fsSL .../bootstrap.sh | sudo bash`
3. Configure `baileys_server_url` e `baileys_api_key` em Configuracoes
```

## Arquitetura Final

```text
┌─────────────────────────────────────────────────────────┐
│                    CONEXOES WHATSAPP                    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│   ┌───────────────────┐     ┌───────────────────┐      │
│   │   QR Code         │     │   Meta Cloud API  │      │
│   │   (Baileys)       │     │   (Oficial)       │      │
│   └─────────┬─────────┘     └─────────┬─────────┘      │
│             │                         │                 │
│             ▼                         ▼                 │
│   ┌───────────────────┐     ┌───────────────────┐      │
│   │ baileys-instance  │     │ meta-api-webhook  │      │
│   │ baileys-webhook   │     │ send-meta-message │      │
│   └───────────────────┘     └───────────────────┘      │
│                                                         │
└─────────────────────────────────────────────────────────┘

         REMOVIDOS:
         ✗ waha-instance
         ✗ waha-webhook
         ✗ Evolution API
         ✗ WPPConnect
```

## Ordem de Execucao

1. **Atualizar config.toml** - Remover entradas WAHA
2. **Deletar edge functions WAHA** - waha-instance, waha-webhook
3. **Atualizar send-whatsapp** - Remover sendViaWAHA
4. **Atualizar sync-contacts** - Migrar para Baileys
5. **Atualizar update-lid-contacts** - Migrar para Baileys
6. **Atualizar resolve-lid-contact** - Migrar para Baileys
7. **Atualizar process-schedules** - Usar send-whatsapp
8. **Atualizar useWhatsAppConnections.ts** - Simplificar para Baileys
9. **Deletar deploy/waha/** - Remover diretorio
10. **Atualizar deploy/scripts/backup.sh** - Baileys em vez de WPPConnect
11. **Atualizar CHANGELOG.md** - Documentar mudanca

## Impacto

| Aspecto | Impacto |
|---------|---------|
| Conexoes existentes WAHA | Precisam ser recriadas com Baileys |
| Conexoes Meta API | Nenhum impacto |
| Secrets no Supabase | `EVOLUTION_API_*` podem ser removidos |
| Frontend | Simplificado - sem escolha de engine |
| Deploy | Apenas `deploy/baileys/` necessario |

