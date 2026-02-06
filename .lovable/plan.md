

# Analise Completa - 15 Secoes do Sistema

## Resumo

Foram analisadas todas as 15 secoes da aplicacao. A maioria esta estruturalmente funcional, mas foram identificados **11 problemas** que precisam de correcao para garantir 100% de funcionamento.

---

## Secoes Funcionais (sem problemas encontrados)

As seguintes secoes estao 100% funcionais:

- **Dashboard** - Cards, graficos e conversas recentes funcionam corretamente com queries ao banco
- **WhatsApp (Atendimento)** - Envio/recebimento de mensagens, realtime, filtros, tabs, bulk actions, emojis, midias, tags, agendamento - tudo funcional
- **Respostas Rapidas** - CRUD completo com permissoes, atalhos, categorias e variaveis de template
- **CRM (Kanban)** - Drag-and-drop, colunas customizaveis, permissoes - tudo funcional
- **Contatos** - CRUD, importacao CSV, selecao em massa, sincronizacao - tudo funcional
- **Agendamentos** - Criacao, filtragem por data, status (pendente/concluido/cancelado), calendario - funcional
- **Tags** - CRUD com cores, descricao, permissoes - funcional
- **Disparo em Massa** - Criacao, selecao de contatos por tags, dashboard de metricas - funcional
- **Chatbot** - Flow Builder com canvas, configuracao de nodes, sidebar - funcional
- **Setores** - CRUD completo de filas com cores e status - funcional
- **Diagnostico** - Status do servidor Baileys, conexoes, logs de atividades com filtros e paginacao - funcional

---

## Problemas Encontrados

### BUG 1 - Chat Interno: Contador de mensagens nao lidas NUNCA aparece (CRITICO)

**Arquivo**: `src/hooks/useChatInterno.ts` (linhas 161-183) e `src/pages/ChatInterno.tsx` (linha 206)

O hook `useUnreadMessageCounts` retorna um `Map<string, number>`, mas no `ChatInterno.tsx` ele e acessado com notacao de colchetes: `unreadCounts[member.id]`. A notacao `map["key"]` nao funciona em objetos `Map` do JavaScript - e necessario usar `map.get("key")`.

**Resultado**: Os badges de contagem de mensagens nao lidas nunca aparecem na lista de membros da equipe.

**Correcao**: Mudar `useUnreadMessageCounts` para retornar um objeto simples `Record<string, number>` ao inves de um `Map`, ou alterar o acesso para usar `.get()`.

### BUG 2 - Relatorios: Satisfacao do atendente e dado FALSO (MEDIO)

**Arquivo**: `src/hooks/useReportStats.ts` (linha 167)

```
const satisfaction = Math.round(70 + Math.random() * 25);
```

O campo "Satisfacao" na tabela de desempenho por atendente gera numeros **aleatorios** entre 70% e 95%. Nao ha dados reais de NPS/satisfacao no sistema. Os valores mudam a cada render, o que e enganoso.

**Correcao**: Remover a coluna "Satisfacao" da tabela de relatorios ou mostrar "N/D" (nao disponivel) ate que exista um sistema real de avaliacao.

### BUG 3 - Relatorios: Botao "Exportar" nao funciona (MENOR)

**Arquivo**: `src/pages/Relatorios.tsx` (linhas 78-81)

O botao "Exportar" nao tem `onClick` handler. Ao clicar, nada acontece.

**Correcao**: Implementar exportacao CSV dos dados do relatorio (stats, monthly, agent performance) ou remover o botao.

### BUG 4 - Painel: Atividades nao mostram quem executou a acao (MENOR)

**Arquivo**: `src/hooks/usePanelStats.ts` (linhas 59-78) e `src/pages/Painel.tsx` (linhas 153-159)

O hook `useActivityLog` no Painel faz `select("*")` na tabela `activity_logs`, que retorna `user_id` mas nao o nome do usuario. A interface mostra apenas a acao sem identificar quem a executou.

**Correcao**: Fazer join com a tabela `profiles` para buscar o nome do usuario e exibir "Fulano criou contato" ao inves de apenas "criou contato".

### BUG 5 - Usuarios: Botoes "Editar" e "Excluir" nao funcionam (CRITICO)

**Arquivo**: `src/pages/Usuarios.tsx` (linhas 442-453)

Os itens de dropdown "Editar" e "Excluir" no menu de cada atendente **nao possuem onClick handlers**. Ao clicar, nada acontece.

- "Editar" (linha 442): Nao abre dialog de edicao
- "Excluir" (linha 450): Nao abre confirmacao de exclusao

**Correcao**: Implementar dialog de edicao de atendente (nome, email) e dialog de confirmacao de exclusao.

### BUG 6 - Contatos: Botao "Filtrar" nao funciona (MENOR)

**Arquivo**: `src/pages/Contatos.tsx` (linhas 495-498)

O botao "Filtrar" ao lado da busca nao tem `onClick` handler e nao abre nenhum popover de filtros.

**Correcao**: Implementar popover de filtros (por status, tags, empresa) ou remover o botao.

### BUG 7 - Usuarios: Botao "Filtrar" nao funciona (MENOR)

**Arquivo**: `src/pages/Usuarios.tsx` (linhas 342-345)

Mesmo problema do item anterior - botao sem funcionalidade.

**Correcao**: Implementar filtro por nivel (admin/atendente) e status (online/offline) ou remover o botao.

### BUG 8 - Campanhas: Botao "Filtrar" nao funciona (MENOR)

**Arquivo**: `src/pages/Campanhas.tsx` (linhas 202-205)

Mesmo problema - botao sem funcionalidade.

**Correcao**: Implementar filtro por status da campanha ou remover o botao.

### BUG 9 - Dashboard e Relatorios: Limite de 1000 linhas (POTENCIAL)

**Arquivo**: `src/hooks/useDashboardStats.ts` (linhas 26-29)

A query `supabase.from('conversations').select('status')` busca todas as conversas para contar por status. Supabase tem um limite padrao de 1000 linhas por query. Se houver mais de 1000 conversas, os numeros serao incorretos.

O mesmo problema existe em `useReportStats.ts` e `useTeamPerformance()`.

**Correcao**: Usar `count: 'exact'` com filtros `.eq('status', 'new')` etc., ou usar queries separadas com head:true para cada status.

### BUG 10 - Campanhas: Botao "Ver estatisticas" nao funciona (MENOR)

**Arquivo**: `src/pages/Campanhas.tsx` (linhas 258-260)

O item "Ver estatisticas" no dropdown de cada campanha nao tem `onClick` handler.

**Correcao**: Navegar para a tab de metricas com a campanha selecionada ou abrir dialog de detalhes.

### BUG 11 - Painel: Tag filter nas conversas nao funciona completamente (MENOR)

**Arquivo**: `src/pages/Atendimento.tsx` (linha 320)

O filtro de tags esta implementado mas `matchesTags` sempre retorna `true` quando `tagFilter.length === 0`. Porem quando tags sao selecionadas, o filtro nao verifica as tags da conversa (nao ha `else` para filtrar realmente):

```
const matchesTags = tagFilter.length === 0;
```

Deveria ser: se tags foram selecionadas, verificar se a conversa possui ao menos uma das tags.

**Correcao**: Implementar `const matchesTags = tagFilter.length === 0 || conv.tags?.some(t => tagFilter.includes(t.id));`

---

## Plano de Correcao (Priorizado)

### Prioridade Alta (Funcionalidade quebrada)

1. **Chat Interno - Unread counts**: Converter retorno de `Map` para `Record<string, number>` no hook `useUnreadMessageCounts`
2. **Usuarios - Editar/Excluir**: Adicionar dialogs e handlers para edicao de nome/email e exclusao de atendentes
3. **Relatorios - Satisfacao falsa**: Remover a coluna de satisfacao ou mostrar "N/D"

### Prioridade Media (Funcionalidade incompleta)

4. **Atendimento - Tag filter**: Corrigir logica do `matchesTags`
5. **Painel - Nome do usuario nas atividades**: Fazer join com profiles
6. **Dashboard - Limite 1000**: Reescrever queries para usar contagens separadas

### Prioridade Baixa (Botoes sem funcao)

7. **Relatorios - Exportar**: Implementar download CSV/PDF dos dados
8. **Contatos - Filtrar**: Remover botao inutil
9. **Usuarios - Filtrar**: Remover botao inutil
10. **Campanhas - Filtrar**: Remover botao inutil
11. **Campanhas - Ver estatisticas**: Conectar ao dashboard de metricas

---

## Detalhes Tecnicos

### Correcao 1 - useUnreadMessageCounts

Mudar o retorno do hook de `Map` para objeto:

```text
// Antes
const counts = new Map<string, number>();
data?.forEach(...);
return counts;

// Depois  
const counts: Record<string, number> = {};
data?.forEach(msg => {
  counts[msg.sender_id] = (counts[msg.sender_id] || 0) + 1;
});
return counts;
```

### Correcao 2 - Usuarios Editar/Excluir

Adicionar:
- State para `editingUser` e `deletingUser`
- Dialog de edicao com campos nome e email (usando edge function `update-user-email` existente)
- Dialog de confirmacao de exclusao
- Funcao para excluir usuario (nova edge function ou admin API)

### Correcao 5 - Painel Activity com nomes

No hook `useActivityLog`, buscar profiles dos user_ids:

```text
const userIds = [...new Set(data?.map(log => log.user_id).filter(Boolean))];
const { data: profiles } = await supabase
  .from("profiles")
  .select("user_id, name")
  .in("user_id", userIds);
// Mapear names para cada log
```

### Correcao 6 - Dashboard contagens seguras

Substituir a query unica por contagens individuais:

```text
const [newCount, inProgressCount, resolvedCount, archivedCount] = await Promise.all([
  supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('status', 'new'),
  supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('status', 'in_progress'),
  supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('status', 'resolved'),
  supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('status', 'archived'),
]);
```

### Correcao 11 - Tag filter

```text
// Antes
const matchesTags = tagFilter.length === 0;

// Depois
const matchesTags = tagFilter.length === 0 || (c.tags?.some(t => tagFilter.includes(t.id)) ?? false);
```

