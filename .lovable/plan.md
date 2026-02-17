

# Correcao do Script de Update - Diretorio Errado do Frontend

## Problema identificado

O `docker-compose.yml` monta o volume do Nginx assim:

```text
./frontend/dist:/usr/share/nginx/html:ro
```

Isso significa que o Nginx serve os arquivos de `deploy/frontend/dist/`.

Porem, o `update.sh` copia o build para `deploy/volumes/frontend/`, que e um diretorio completamente diferente. O resultado: o Nginx continua servindo a versao antiga que esta em `deploy/frontend/dist/`.

## Solucao

Corrigir o `update.sh` para copiar os arquivos compilados para o caminho correto: `deploy/frontend/dist/`.

### Arquivo: `deploy/scripts/update.sh`

Alterar a secao "Deploy do Frontend" (linhas ~100-120) para usar o caminho correto:

| Antes | Depois |
|-------|--------|
| `$DEPLOY_DIR/volumes/frontend/` | `$DEPLOY_DIR/frontend/dist/` |

As referencias a `config.js` tambem serao atualizadas para usar o caminho correto.

Alem disso, adicionar um `docker exec` para recarregar o Nginx apos copiar os arquivos, garantindo que ele sirva o conteudo novo imediatamente (ja que o volume esta montado como read-only, um reload do Nginx e suficiente).

### Resumo das alteracoes

| Arquivo | Acao |
|---------|------|
| `deploy/scripts/update.sh` | Corrigir caminho de deploy do frontend + reload do Nginx |

