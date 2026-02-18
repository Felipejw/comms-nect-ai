

# Corrigir Exclusao de Contatos e Conversas

## Problema 1: Erro ao excluir contatos

A edge function `bulk-delete-contacts` NAO esta registrada no `config.toml`. Isso significa que a verificacao JWT padrao esta ativada, e como o token enviado pelo navegador nao passa pela validacao interna do Supabase (a funcao ja faz sua propria validacao de auth), a chamada retorna erro.

**Correcao:** Adicionar `[functions.bulk-delete-contacts]` com `verify_jwt = false` no `config.toml`.

## Problema 2: Conversa nao desaparece apos excluir

O hook `useDeleteConversation` deleta mensagens e depois a conversa, mas:
- A tabela `conversation_tags` pode ter registros vinculados que bloqueiam a exclusao (foreign key)
- O `refetchInterval: 3000` e o canal realtime re-buscam as conversas imediatamente, fazendo parecer que a conversa ainda existe
- A invalidacao do cache acontece no `onSuccess`, mas o refetch automatico pode trazer dados antigos antes do banco processar

**Correcao:**
1. Deletar `conversation_tags` antes de deletar mensagens e a conversa
2. Remover otimisticamente a conversa do cache antes de esperar o banco confirmar
3. Garantir que a conversa selecionada seja limpa imediatamente

## Detalhes Tecnicos

### Arquivo 1: `supabase/config.toml`
Adicionar entrada para a funcao bulk-delete-contacts:
```toml
[functions.bulk-delete-contacts]
verify_jwt = false
```

### Arquivo 2: `src/hooks/useConversations.ts` - `useDeleteConversation`
Atualizar para deletar conversation_tags antes e usar invalidacao otimista:

```typescript
export function useDeleteConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (conversationId: string) => {
      // 1. Deletar tags da conversa
      await supabase
        .from('conversation_tags')
        .delete()
        .eq('conversation_id', conversationId);

      // 2. Deletar mensagens
      await supabase
        .from('messages')
        .delete()
        .eq('conversation_id', conversationId);

      // 3. Deletar a conversa
      const { error } = await supabase
        .from('conversations')
        .delete()
        .eq('id', conversationId);

      if (error) throw error;
    },
    onMutate: async (conversationId) => {
      // Cancelar refetches pendentes
      await queryClient.cancelQueries({ queryKey: ['conversations'] });

      // Remover otimisticamente do cache
      queryClient.setQueriesData(
        { queryKey: ['conversations'] },
        (old: any) => old?.filter((c: any) => c.id !== conversationId) ?? []
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast.success('Conversa excluida!');
    },
    onError: (error: Error) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast.error('Erro ao excluir conversa: ' + error.message);
    },
  });
}
```

### Arquivo 3: `src/hooks/useBulkConversationActions.ts`
Mesma correcao para exclusao em massa: deletar `conversation_tags` antes.

## Resumo

| Arquivo | Alteracao |
|---------|-----------|
| `supabase/config.toml` | Registrar `bulk-delete-contacts` com `verify_jwt = false` |
| `src/hooks/useConversations.ts` | Deletar tags antes da conversa + update otimista do cache |
| `src/hooks/useBulkConversationActions.ts` | Deletar tags antes da conversa em exclusao em massa |

## Apos implementar

1. Publicar no Lovable
2. Na VPS: `cd /opt/sistema && sudo bash deploy/scripts/update.sh`
3. Testar exclusao de contato (individual e em massa)
4. Testar exclusao de conversa (deve sumir imediatamente)
