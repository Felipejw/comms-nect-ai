
# Corrigir Carregamento Infinito em Todas as Telas da VPS

## Diagnostico

O sidebar carrega corretamente (auth, role, branding funcionam), mas o conteudo de TODAS as paginas fica travado no spinner. Isso indica que as queries REST ao banco de dados estao travando sem resposta.

### Causa raiz provavel (VPS)

Apos a reinstalacao, o PostgREST pode nao estar conectado corretamente ao banco, ou nao recarregou o schema. Todas as chamadas REST ficam pendentes indefinidamente.

### Problema no codigo

Mesmo que o PostgREST estivesse funcionando, varios hooks e paginas NAO tem:
- **Timeout nas queries** - se a query travar, o spinner fica eterno
- **Tratamento de erro** - se a query falhar, nao mostra nada util

Paginas COM tratamento de erro: Dashboard, Contatos, Tags, Campanhas, Agendamentos, Kanban, Usuarios
Paginas SEM tratamento de erro: **Atendimento**, ChatInterno, Relatorios, Painel, RespostasRapidas, Conexoes, Configuracoes

## Mudancas Planejadas

### 1. Adicionar timeout a hooks criticos que nao tem

Os seguintes hooks serao atualizados para incluir `AbortSignal.timeout(15000)`:

| Hook | Arquivo |
|------|---------|
| `useConversations` | `src/hooks/useConversations.ts` |
| `useMessages` | `src/hooks/useConversations.ts` |
| `useQuickReplies` | `src/hooks/useQuickReplies.ts` |
| `usePanelStats` | `src/hooks/usePanelStats.ts` |
| `useReportStats` | `src/hooks/useReportStats.ts` |
| `useUsers` | `src/hooks/useUsers.ts` |
| `useWhatsAppConnections` | `src/hooks/useWhatsAppConnections.ts` |

Exemplo da mudanca no `useConversations`:
```text
// Antes
const { data, error } = await query;

// Depois
const { data, error } = await query.abortSignal(AbortSignal.timeout(15000));
```

### 2. Adicionar tratamento de erro na pagina Atendimento

`src/pages/Atendimento.tsx` - apos o check de `conversationsLoading`, adicionar:

```text
if (conversationsLoading) {
  return <Spinner />;
}

// NOVO: tratamento de erro
if (isError) {
  return <ErrorState message={error.message} onRetry={refetch} />;
}
```

Isso substitui o spinner eterno por uma mensagem de erro com botao "Tentar novamente".

### 3. Adicionar tratamento de erro nas demais paginas

As seguintes paginas serao atualizadas com o mesmo padrao de erro:

| Pagina | Arquivo |
|--------|---------|
| ChatInterno | `src/pages/ChatInterno.tsx` |
| Relatorios | `src/pages/Relatorios.tsx` |
| Painel | `src/pages/Painel.tsx` |
| RespostasRapidas | `src/pages/RespostasRapidas.tsx` |
| Conexoes | `src/pages/Conexoes.tsx` |
| Configuracoes | `src/pages/Configuracoes.tsx` |

## Resumo dos arquivos que serao modificados

| Arquivo | Mudanca |
|---------|---------|
| `src/hooks/useConversations.ts` | Timeout de 15s em useConversations e useMessages |
| `src/hooks/useQuickReplies.ts` | Timeout de 15s |
| `src/hooks/usePanelStats.ts` | Timeout de 15s |
| `src/hooks/useReportStats.ts` | Timeout de 15s |
| `src/hooks/useUsers.ts` | Timeout de 15s |
| `src/hooks/useWhatsAppConnections.ts` | Timeout de 15s |
| `src/pages/Atendimento.tsx` | isError + mensagem de erro + botao retry |
| `src/pages/ChatInterno.tsx` | isError + mensagem de erro + botao retry |
| `src/pages/Relatorios.tsx` | isError + mensagem de erro + botao retry |
| `src/pages/Painel.tsx` | isError + mensagem de erro + botao retry |
| `src/pages/RespostasRapidas.tsx` | isError + mensagem de erro + botao retry |
| `src/pages/Conexoes.tsx` | isError + mensagem de erro + botao retry |
| `src/pages/Configuracoes.tsx` | isError + mensagem de erro + botao retry |

## Apos aprovacao - Diagnostico VPS

Depois de aplicar as mudancas de codigo, rode estes comandos na VPS para diagnosticar o PostgREST:

```text
# 1. Ver logs do PostgREST
sudo docker logs supabase-rest 2>&1 | tail -30

# 2. Reiniciar PostgREST para forcar reload do schema
cd /opt/sistema/deploy
sudo docker restart supabase-rest

# 3. Testar se a API REST responde
curl -s http://localhost:3000/rest/v1/profiles?select=id\&limit=1 \
  -H "apikey: SUA_ANON_KEY" \
  -H "Authorization: Bearer SUA_ANON_KEY"

# 4. Se nada funcionar, reiniciar todos os servicos
sudo docker compose --profile baileys restart
```

## Secao Tecnica

### Por que o spinner fica eterno?

```text
useConversations() faz fetch -> PostgREST nao responde -> 
  query fica pendente -> isLoading = true para sempre ->
  pagina exibe <Loader2 /> eternamente
```

Com o timeout de 15s:

```text
useConversations() faz fetch -> PostgREST nao responde ->
  AbortSignal.timeout(15000) cancela apos 15s ->
  retry 1 -> timeout -> retry 2 -> timeout ->
  isLoading = false, isError = true ->
  pagina exibe mensagem de erro + botao "Tentar novamente"
```

### Padrao de erro consistente

Todas as paginas usarao o mesmo layout de erro:
- Icone de alerta (AlertCircle)
- Titulo "Erro ao carregar [nome da pagina]"
- Mensagem tecnica do erro
- Botao "Tentar novamente" que chama refetch()
