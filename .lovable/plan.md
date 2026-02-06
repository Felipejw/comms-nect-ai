

# Melhorar exibicao de contatos LID na pagina de Contatos

## Situacao Atual

Na pagina de Contatos, os contatos que vieram do WhatsApp possuem apenas um identificador interno (LID) e nao o numero de telefone real. Atualmente, a coluna "Telefone" mostra "-" com um badge "LID", o que nao e informativo.

O problema raiz: o WhatsApp mais recente usa identificadores LID ao inves de numeros de telefone em algumas situacoes. O sistema tem uma funcao para resolver esses LIDs (`resolve-lid-contact`), mas ela so e chamada manualmente na tela de Atendimento.

## Solucao

Melhorar a exibicao na pagina de Contatos para:
1. Mostrar "Pendente" em vez de "-" com badge "LID" 
2. Adicionar botao para tentar resolver o numero individualmente
3. Adicionar botao de resolucao em massa para todos os contatos com LID

---

## Detalhes Tecnicos

### Arquivo: `src/pages/Contatos.tsx`

**Alteracao 1 - Coluna Telefone (linhas 604-621)**

Substituir a exibicao atual:
- Em vez de mostrar "-" com badge "LID", mostrar "Pendente" com um botao pequeno para tentar resolver o numero
- Quando o contato tem `whatsapp_lid` mas nao tem `phone`, exibir:
  - Texto "Pendente" em cor suave
  - Botao com icone de busca para chamar `resolve-lid-contact`
  - Mostrar o numero real se a resolucao for bem-sucedida

**Alteracao 2 - Botao "Resolver Numeros" na barra de acoes**

Adicionar um botao ao lado do "Sincronizar" para resolver todos os contatos LID de uma vez:
- Contar quantos contatos tem LID sem telefone real
- Ao clicar, iterar sobre esses contatos chamando `resolve-lid-contact` para cada um
- Mostrar progresso e resultado

**Alteracao 3 - Substituir icone AlertTriangle por Info**

Trocar `AlertTriangle` por `Info` na importacao e nos indicadores de LID (consistente com as mudancas feitas na tela de Atendimento).

### Resumo das Alteracoes

| Arquivo | Alteracao |
|---------|-----------|
| `src/pages/Contatos.tsx` | Melhorar exibicao da coluna Telefone para contatos LID; adicionar botao de resolucao individual e em massa; trocar AlertTriangle por Info |

