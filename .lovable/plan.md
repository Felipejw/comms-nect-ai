

# Correcoes: Indicador LID e Bug "Gerenciar Tags"

## Problema 1 - Icone de alerta no "Contato sem numero identificado"

O indicador de contato LID (sem numero real) usa o icone `AlertTriangle` e o estilo `variant="destructive"`, o que transmite a impressao de erro. Na verdade, e apenas um aviso informativo.

**Alteracoes**:

### Arquivo: `src/components/atendimento/LidContactIndicator.tsx`
- Trocar o icone `AlertTriangle` por `Info` (do lucide-react)
- Mudar o `variant` do Alert de `"destructive"` para nenhum (padrao), mantendo o estilo visual `border-warning/50 bg-warning/10`
- Atualizar o titulo para algo mais neutro, como "Contato com identificador temporario"

### Arquivo: `src/pages/Atendimento.tsx`
- Na lista de conversas (linha ~1526): trocar o icone `AlertTriangle` no badge do avatar por `Info`, com cor mais suave
- No header da conversa (linha ~1734): trocar `AlertTriangle` por `Info` e ajustar o tooltip para tom informativo

---

## Problema 2 - "Gerenciar tags" nao abre ao clicar

O botao "Gerenciar tags" no `DropdownMenu` (menu de opcoes da conversa) chama `setShowTagPopover(true)`. Porem, o `Popover` das tags esta vinculado a um `PopoverTrigger` que e um botao separado no header. Quando o `DropdownMenu` fecha (ao clicar no item), ele captura o foco e impede que o `Popover` abra corretamente -- um conflito conhecido entre Radix `DropdownMenu` e `Popover`.

**Solucao**: Usar um `setTimeout` para atrasar a abertura do Popover, garantindo que o `DropdownMenu` tenha tempo de fechar completamente antes do Popover abrir.

### Arquivo: `src/pages/Atendimento.tsx`
- No `DropdownMenuItem` de "Gerenciar tags" (linha ~1828): envolver o `setShowTagPopover(true)` em um `setTimeout` com delay de ~100ms para que o DropdownMenu feche antes do Popover tentar abrir

```text
onClick={() => {
  setTimeout(() => setShowTagPopover(true), 100);
}}
```

---

## Resumo das Alteracoes

| Arquivo | Alteracao |
|---------|-----------|
| `src/components/atendimento/LidContactIndicator.tsx` | Trocar `AlertTriangle` por `Info`; remover `variant="destructive"` |
| `src/pages/Atendimento.tsx` | Trocar icones `AlertTriangle` por `Info` nos indicadores LID; adicionar `setTimeout` no "Gerenciar tags" |

