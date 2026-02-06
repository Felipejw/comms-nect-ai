

# Analise Completa do Sistema - Bugs, Conflitos e Codigo Legado

## Resumo Executivo

Foram identificados **18 problemas** divididos em 3 categorias: referencias a engines legados (WPPConnect/Evolution API), bugs funcionais e codigo morto/conflitos.

---

## CATEGORIA 1: Codigo Legado (WPPConnect / Evolution API)

Estes sao resquicios das versoes anteriores que deveriam ter sido removidos na v3.0.0.

### 1.1 - `src/pages/Diagnostico.tsx` (CRITICO - Pagina inteira quebrada)

A pagina de Diagnostico **inteira** ainda usa WPPConnect:

- **Linha 84**: Query key `"wppconnect-health"`
- **Linha 86**: Chama `supabase.functions.invoke("wppconnect-instance")` - funcao que NAO EXISTE mais
- **Linhas 338-443**: Card "Instancias WPPConnect" exibindo texto e instrucoes sobre WPPConnect
- **Linhas 412-516**: Secao detalhada de instancias WPPConnect com interfaces desatualizadas
- **Linhas 436-442**: Instrucoes para configurar `WPPCONNECT_API_URL` e `WPPCONNECT_SECRET_KEY` (variaveis removidas)

**Impacto**: A pagina gera erros no console ao tentar chamar uma edge function inexistente. O card "Status Geral" sempre mostra erro porque depende da resposta do WPPConnect.

**Correcao**: Reescrever a pagina Diagnostico para usar a API Baileys (`baileys-instance` com action `serverHealth`), substituir labels e remover toda referencia a WPPConnect.

### 1.2 - `src/pages/Conexoes.tsx` (MENOR - Apenas comentario)

- **Linha 363**: Comentario `{/* WPPConnect Dialog */}` no dialog de criacao de conexao

**Correcao**: Alterar comentario para `{/* WhatsApp Dialog */}` ou `{/* Baileys Dialog */}`.

### 1.3 - `supabase/functions/execute-campaign/index.ts` (CRITICO - Campanhas quebradas)

A edge function de execucao de campanhas usa **integralmente** a Evolution API:

- **Linhas 46-47**: Le `EVOLUTION_API_URL` e `EVOLUTION_API_KEY` das variaveis de ambiente
- **Linha 93**: Busca `instanceName` ao inves de `sessionName`
- **Linhas 98-101**: Verifica status de conexao via Evolution API (`/instance/connectionState/`)
- **Linhas 288-313**: Envia mensagens via Evolution API (`/message/sendText/`, `/message/sendMedia/`)
- **Linha 317**: Referencia `evolutionResult` e `evolutionResponse`

**Impacto**: Campanhas de disparo em massa NAO FUNCIONAM. Toda a logica de envio usa endpoints da Evolution API que nao existem no Baileys.

**Correcao**: Reescrever `sendWhatsAppMessage` para usar a API Baileys (mesma logica do `send-whatsapp`), lendo `baileys_server_url` e `baileys_api_key` de `system_settings`.

### 1.4 - `supabase/functions/execute-flow/index.ts` (CRITICO - Chatbot quebrado)

O executor de fluxos do chatbot usa **integralmente** a Evolution API (154 referencias):

- **Linhas 1064-1067**: Le `EVOLUTION_API_URL` e `EVOLUTION_API_KEY`
- **Linhas 52-91**: Funcao `sendWhatsAppMessage()` usa endpoints Evolution API
- **Linha 1151**: Busca `instanceName` ao inves de `sessionName` do Baileys
- **Linhas 1157-1171**: Comentarios dizem "Evolution API does NOT accept LID" - incompativel com o fato de o Baileys aceitar LID
- Mais de 20 chamadas a `sendWhatsAppMessage(evolutionUrl, evolutionKey, instanceName, ...)` ao longo do arquivo

**Impacto**: Chatbot visual (Flow Builder) NAO FUNCIONA para enviar mensagens. Respostas automaticas, menus interativos e IA nao enviam nada porque usam endpoints inexistentes.

**Correcao**: Reescrever `sendWhatsAppMessage()` para usar Baileys, mudar de `instanceName` para `sessionName`, e ler configuracoes de `system_settings` ao inves de envvars.

### 1.5 - `supabase/functions/fetch-whatsapp-profile/index.ts` (CRITICO - Perfil nao funciona)

Inteiramente baseada na Evolution API:

- **Linhas 18-19**: Le `EVOLUTION_API_URL` e `EVOLUTION_API_KEY`
- **Linhas 21-27**: Retorna erro se Evolution API nao configurada
- **Linhas 87-106**: Busca foto de perfil via Evolution API (`/chat/fetchProfilePictureUrl/`)
- **Linhas 128-140**: Busca presenca via Evolution API (`/chat/fetchPresence/`)

**Impacto**: Fotos de perfil e status online de contatos nao funcionam.

**Correcao**: Reescrever para usar Baileys API ou desativar temporariamente se o Baileys nao suportar esses endpoints.

### 1.6 - `deploy/nginx/wppconnect-lb.conf` (Arquivo morto)

Arquivo inteiro de Load Balancer do WPPConnect (140 linhas). Nao e usado em lugar nenhum.

**Correcao**: Deletar o arquivo.

### 1.7 - `deploy/docs/INSTALACAO.md` (Documentacao desatualizada)

- **Linhas 9-11**: Tabela lista WAHA e WPPConnect como engines suportadas
- **Linha 153**: Referencia `WHATSAPP_ENGINE=baileys` (variavel removida na v3.0)
- **Linhas 350-357**: Tabela "Multi-Engine" com capacidade estimada

**Correcao**: Atualizar documentacao para refletir apenas Baileys como engine.

---

## CATEGORIA 2: Bugs Funcionais

### 2.1 - `execute-flow/index.ts` - instanceName vs sessionName (BUG)

- **Linha 1151**: `(connection.session_data)?.instanceName` - O campo correto no Baileys e `sessionName`, nao `instanceName`. Isso faz com que o fallback `connection.name` seja usado, que nao corresponde ao nome real da sessao no servidor Baileys.

**Impacto**: Mesmo se a funcao `sendWhatsAppMessage` fosse corrigida para usar Baileys, o nome da sessao estaria errado.

### 2.2 - `execute-campaign/index.ts` - instanceName vs sessionName (BUG)

- **Linha 93**: `connection.session_data?.instanceName || connection.name` - Mesmo problema do item 2.1.

### 2.3 - `execute-flow/index.ts` - LID nao suportado para envio (BUG)

- **Linhas 1168-1171**: O codigo assume que LIDs nao podem ser usados para envio, o que era verdade na Evolution API mas e FALSO no Baileys. O Baileys suporta envio via LID usando o sufixo `@lid`.

**Impacto**: Contatos que so possuem LID (sem telefone real) nao recebem mensagens do chatbot, mesmo que o Baileys suporte esse envio.

### 2.4 - `Diagnostico.tsx` - Tabela `activity_logs` pode nao existir (POTENCIAL)

- **Linhas 144-157**: A pagina consulta `activity_logs` que esta definida nos types do Supabase, mas nao aparece na lista de tabelas com RLS configurado. Se a tabela nao tiver dados ou nao existir em producao, a secao de logs aparecera sempre vazia ou com erro.

---

## CATEGORIA 3: Codigo Morto e Inconsistencias

### 3.1 - Secrets legados ainda configurados

Os seguintes secrets ainda existem no projeto mas nao sao mais necessarios (a menos que `execute-campaign` e `execute-flow` sejam migrados):
- `EVOLUTION_API_KEY`
- `EVOLUTION_API_URL`

Apos a migracao das edge functions, devem ser removidos.

### 3.2 - `download-whatsapp-media/index.ts` - Import antigo

- **Linha 1**: Usa `import { serve } from "https://deno.land/std@0.168.0/http/server.ts"` ao inves do `Deno.serve()` moderno. Funciona, mas e inconsistente com as outras edge functions.

### 3.3 - `fetch-whatsapp-profile/index.ts` - Import antigo

- **Linha 1**: Mesmo problema - usa `serve()` antigo.

---

## Plano de Correcao (Priorizado)

### Fase 1 - Correcoes Criticas (Edge Functions quebradas)

1. **`execute-flow/index.ts`** - Migrar de Evolution API para Baileys
   - Reescrever `sendWhatsAppMessage()` para usar Baileys
   - Trocar `instanceName` por `sessionName`
   - Ler configuracoes de `system_settings` ao inves de env vars
   - Adicionar suporte a envio via LID

2. **`execute-campaign/index.ts`** - Migrar de Evolution API para Baileys
   - Reescrever logica de envio para Baileys
   - Trocar verificacao de status de conexao
   - Trocar `instanceName` por `sessionName`

3. **`fetch-whatsapp-profile/index.ts`** - Migrar ou desativar
   - Verificar se Baileys tem endpoints equivalentes
   - Se sim, migrar. Se nao, retornar dados basicos sem erro

### Fase 2 - Correcoes de Interface

4. **`src/pages/Diagnostico.tsx`** - Reescrever para Baileys
   - Usar `baileys-instance` com action `serverHealth`
   - Renomear labels de "WPPConnect" para "Baileys"
   - Remover interfaces e cards legados

5. **`src/pages/Conexoes.tsx`** - Atualizar comentario

### Fase 3 - Limpeza

6. **Deletar** `deploy/nginx/wppconnect-lb.conf`
7. **Atualizar** `deploy/docs/INSTALACAO.md`
8. **Padronizar** imports antigos (`serve()` para `Deno.serve()`)
9. **Remover** secrets `EVOLUTION_API_KEY` e `EVOLUTION_API_URL` apos migracao

### Detalhes Tecnicos - Funcao sendWhatsAppMessage para Baileys

A nova funcao seguira o padrao ja usado em `send-whatsapp/index.ts`:

```text
1. Ler baileys_server_url e baileys_api_key de system_settings
2. Obter sessionName de connection.session_data.sessionName
3. Para texto: POST /sessions/{sessionName}/send/text com { to, text }
4. Para media: POST /sessions/{sessionName}/send/media com { to, mediaUrl, caption, mediaType }
5. Header: X-API-Key com a api key
6. Para LID: enviar com sufixo @lid no campo "to"
```

