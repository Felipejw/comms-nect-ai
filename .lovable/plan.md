
# Atualizar exibicao automaticamente quando numero do contato for resolvido

## Problema

Quando o sistema resolve o numero real de um contato LID (seja via edge function `resolve-lid-contact` ou via webhook `baileys-webhook`), a interface nao atualiza automaticamente. O usuario precisa recarregar a pagina para ver o numero real no lugar do nome/LID.

Isso acontece porque:
1. A tabela `contacts` nao esta habilitada para realtime no banco de dados
2. Nao existe nenhuma subscription de realtime ouvindo mudancas na tabela `contacts`

## Solucao

### Etapa 1: Habilitar realtime para a tabela `contacts`
Criar uma migracao SQL para adicionar a tabela `contacts` a publicacao `supabase_realtime`, permitindo que mudancas nela sejam transmitidas em tempo real.

### Etapa 2: Adicionar subscription de realtime no hook `useConversations`
No hook `useConversations`, que ja escuta mudancas na tabela `conversations`, adicionar um canal adicional que escuta mudancas na tabela `contacts`. Quando um contato for atualizado (ex: campo `phone` preenchido), invalidar automaticamente as queries de conversas para que a lista e o header atualizem.

### Etapa 3: Atualizar o `LidContactIndicator` para nao pedir "recarregar a pagina"
Atualmente, quando o numero e encontrado com sucesso, o componente mostra "Numero encontrado! Recarregue a pagina." Como a atualizacao sera automatica, essa mensagem sera simplificada para apenas "Numero encontrado!" sem pedir para recarregar.

## Resultado esperado

1. Contato esta com LID e sem numero
2. Edge function (ou webhook) resolve o numero e atualiza o banco
3. O realtime detecta a mudanca na tabela `contacts`
4. As queries sao invalidadas automaticamente
5. A lista de conversas e o header atualizam sozinhos, mostrando o numero real

## Detalhes tecnicos

### Migracao SQL
```text
ALTER PUBLICATION supabase_realtime ADD TABLE public.contacts;
```

### Hook `useConversations` - novo canal de realtime
Adicionar dentro do `useEffect` existente (ou um novo `useEffect`) uma subscription para a tabela `contacts`:
```text
const contactsChannel = supabase
  .channel('contacts-realtime')
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'contacts',
  }, () => {
    queryClient.invalidateQueries({ queryKey: ['conversations'] });
    queryClient.invalidateQueries({ queryKey: ['contacts'] });
  })
  .subscribe();
```

### Componente `LidContactIndicator`
- Remover texto "Recarregue a pagina" da mensagem de sucesso
- Manter o invalidateQueries que ja existe para garantir atualizacao imediata quando a busca manual encontra o numero

### Arquivos a modificar
- Nova migracao SQL (habilitar realtime para `contacts`)
- `src/hooks/useConversations.ts` - adicionar subscription para tabela `contacts`
- `src/components/atendimento/LidContactIndicator.tsx` - remover mensagem de "recarregar pagina"
