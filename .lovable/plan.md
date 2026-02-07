

# Correção: Spinner Infinito e Falta de Tratamento de Erros

## Problema

Todas as páginas do sistema (Contatos, Dashboard, Tags, etc.) mostram um spinner de carregamento infinito quando a consulta ao banco de dados falha ou demora muito. Nenhuma página verifica se ocorreu um erro -- elas apenas checam `isLoading` e mostram o spinner para sempre se a requisição travar.

Isso afeta diretamente o servidor self-hosted porque:
- Consultas pesadas (ex: Contatos sem limite) podem demorar ou travar
- Sem tratamento de erro, o usuario nao sabe o que esta acontecendo
- Sem timeout, requisições podem ficar pendentes indefinidamente

## Diagnostico Imediato (rodar no servidor)

Antes de implementar, rode estes comandos no VPS para verificar o estado dos servicos:

```bash
# Verificar se todos os containers estão rodando
sudo docker compose ps

# Verificar logs do PostgREST (API REST)
sudo docker compose logs --tail=50 rest

# Verificar se o PostgREST responde
curl -s http://localhost:3000/rest/v1/contacts?limit=1 \
  -H "apikey: SUA_ANON_KEY" \
  -H "Authorization: Bearer SUA_ANON_KEY" | head -c 200

# Verificar quantidade de contatos
sudo docker exec supabase-db psql -U postgres -c "SELECT count(*) FROM contacts;"

# Verificar se há queries travadas
sudo docker exec supabase-db psql -U postgres -c "SELECT pid, state, query_start, left(query, 80) FROM pg_stat_activity WHERE state != 'idle' AND query NOT LIKE '%pg_stat%';"
```

## Correcoes no Codigo

### 1. Adicionar timeout global ao QueryClient (src/App.tsx)

O `QueryClient` nao tem nenhuma configuracao. Adicionar:
- `retry: 2` (maximo 2 tentativas, em vez de 3)
- `staleTime: 30000` (dados validos por 30s)
- Um wrapper que adiciona `AbortSignal.timeout()` nas queries

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 30000,
      refetchOnWindowFocus: false,
    },
  },
});
```

### 2. Adicionar tratamento de erro em TODAS as paginas com loading

Atualmente, 7 paginas tem o mesmo problema -- so checam `isLoading`:

| Pagina | Hook usado |
|--------|-----------|
| Contatos.tsx | useContacts() |
| Dashboard.tsx | useDashboardStats() |
| Tags.tsx | useTags() |
| Campanhas.tsx | useCampaigns() |
| Usuarios.tsx | useUsers() |
| Kanban.tsx | useKanbanColumns() + useConversations() |
| Agendamentos.tsx | useSchedules() |

Todas precisam extrair `isError` e `error` do hook e mostrar uma mensagem quando a query falha:

```typescript
// DE:
const { data: contacts, isLoading } = useContacts();

if (isLoading) {
  return <Loader2 ... />;
}

// PARA:
const { data: contacts, isLoading, isError, error, refetch } = useContacts();

if (isLoading) {
  return <Loader2 ... />;
}

if (isError) {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-4">
      <p className="text-destructive">Erro ao carregar dados</p>
      <p className="text-sm text-muted-foreground">{error?.message}</p>
      <Button variant="outline" onClick={() => refetch()}>
        Tentar novamente
      </Button>
    </div>
  );
}
```

### 3. Adicionar limite na query de contatos (useContacts.ts)

A query atual carrega TODOS os contatos sem limite. Se existem milhares de contatos, isso causa timeout:

```typescript
// DE:
.order('created_at', { ascending: false });

// PARA:
.order('created_at', { ascending: false })
.limit(500);
```

Adicionar tambem suporte a busca server-side para quando o usuario pesquisa.

### 4. Adicionar timeout nas queries criticas

Para evitar que requisicoes fiquem pendentes indefinidamente, adicionar AbortController com timeout:

```typescript
queryFn: async ({ signal }) => {
  const timeoutSignal = AbortSignal.timeout(15000); // 15 segundos
  const { data, error } = await supabase
    .from('contacts')
    .select(...)
    .abortSignal(timeoutSignal);
  // ...
}
```

## Arquivos a serem modificados

| Arquivo | Alteracao |
|---------|-----------|
| src/App.tsx | Configurar QueryClient com retry e staleTime |
| src/pages/Contatos.tsx | Adicionar isError/error/refetch + UI de erro |
| src/pages/Dashboard.tsx | Adicionar isError/error/refetch + UI de erro |
| src/pages/Tags.tsx | Adicionar isError/error/refetch + UI de erro |
| src/pages/Campanhas.tsx | Adicionar isError/error/refetch + UI de erro |
| src/pages/Usuarios.tsx | Adicionar isError/error/refetch + UI de erro |
| src/pages/Kanban.tsx | Adicionar isError/error/refetch + UI de erro |
| src/pages/Agendamentos.tsx | Adicionar isError/error/refetch + UI de erro |
| src/hooks/useContacts.ts | Adicionar .limit(500) e timeout |
| src/hooks/useDashboardStats.ts | Adicionar timeout |

## Resultado Esperado

Apos as alteracoes:
- Paginas mostram mensagem de erro clara em vez de spinner infinito
- Botao "Tentar novamente" permite recarregar sem refresh da pagina
- Mensagem tecnica do erro aparece para facilitar diagnostico
- Queries nao ficam pendentes por mais de 15 segundos
- Lista de contatos limitada a 500 por consulta para evitar timeout
- Menos requisicoes desnecessarias (staleTime de 30s)

