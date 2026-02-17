
# Fix: Adicionar `cd /tmp` no inicio do bootstrap.sh

## Problema

Quando o usuario executa o bootstrap estando dentro de `/opt/sistema/deploy`, o script deleta esse diretorio durante a reinstalacao. O shell perde a referencia ao diretorio atual, causando o erro `getcwd: cannot access parent directories`.

## Correcao

Adicionar `cd /tmp 2>/dev/null || cd /` logo apos o `set -e` (linha 13) no arquivo `deploy/scripts/bootstrap.sh`. Isso garante que o script sempre rode de um diretorio seguro antes de deletar `/opt/sistema`.

### Arquivo: `deploy/scripts/bootstrap.sh`

Apos a linha `set -e`, adicionar:

```bash
# Garantir diretorio de trabalho seguro (evita erro se /opt/sistema for deletado)
cd /tmp 2>/dev/null || cd /
```

Uma unica alteracao, uma unica linha. Resolve o problema permanentemente.
