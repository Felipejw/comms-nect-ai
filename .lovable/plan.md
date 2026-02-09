
# Corrigir status do servidor e QR Code na pagina Conexoes

## Problema 1: Servidor mostra "Offline" mesmo estando Online

Na pagina `src/pages/Conexoes.tsx`, a funcao `fetchServerInfo` (linha ~63) faz:

```
result.data?.status === 'ok'
```

Porem a Edge Function `serverHealth` retorna os campos na raiz do objeto (ex: `{ success: true, status: "ok", sessions: 0 }`), sem uma propriedade `data` aninhada. Resultado: `result.data` e sempre `undefined`, entao o status e sempre "offline".

### Correcao

Alterar `fetchServerInfo` em `src/pages/Conexoes.tsx` para ler da raiz:

- `result.data?.status` -> `result.status`
- `result.data?.version` -> `result.version`
- `result.data?.sessions` -> `result.sessions`

## Problema 2: API Key desalinhada (acao manual)

A chave salva na interface (`9c23d1af...`) nao corresponde a chave ativa no container Baileys (`3d2e0ed8...`). Todas as chamadas autenticadas (QR, status, etc.) retornam 401.

Comando para alinhar no VPS:

```bash
cat > /opt/sistema/deploy/baileys/.env << 'EOF'
API_KEY=9c23d1af8df0df397b2c776b1db712d63314d24be907c60152438e54d5405d39
PORT=3000
EOF

cd /opt/sistema/deploy
sudo docker compose --profile baileys down
sudo docker compose --profile baileys up -d
```

Ou, alternativamente, atualizar a interface com a chave do container (`3d2e0ed8...`).

## Resumo das alteracoes de codigo

| Arquivo | Alteracao |
|---|---|
| `src/pages/Conexoes.tsx` | Corrigir leitura de `result.data?.X` para `result.X` na funcao `fetchServerInfo` |

Nenhuma alteracao de banco de dados necessaria.
