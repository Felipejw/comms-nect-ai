

## Instalacao com ZIP em Servidor Limpo

### Fluxo atualizado

1. Voce sobe o ZIP para a VPS (ex: `scp sistema-atendimento-v3.0.0.zip root@ip:/root/`)
2. Executa **1 comando**:

```text
sudo bash -c "apt-get update -qq && apt-get install -y -qq unzip && unzip -o /root/sistema-atendimento-*.zip -d /tmp && mv /tmp/sistema-atendimento-*/ /opt/sistema && chmod +x /opt/sistema/scripts/*.sh && cd /opt/sistema && ./scripts/install-unified.sh"
```

Porem isso e longo demais. A solucao melhor e atualizar o `bootstrap-local.sh` para fazer tudo isso automaticamente.

### O que muda no bootstrap-local.sh

O script sera reescrito para funcionar em **dois modos**:

**Modo 1 - Com argumento (ZIP):**
```text
sudo bash bootstrap-local.sh /root/sistema-atendimento-v3.0.0.zip
```

**Modo 2 - Autodeteccao:**
Se executado de dentro da pasta ja descompactada (como funciona hoje).

### Logica do script atualizado

1. Se receber um arquivo ZIP como argumento:
   - Instala `unzip` se necessario
   - Descompacta o ZIP em `/tmp`
   - Move o conteudo para `/opt/sistema`
   - Da permissao aos scripts
   - Executa `install-unified.sh`
2. Se nao receber argumento:
   - Funciona como hoje (detecta diretorio relativo ao script)

### Comando final para o usuario

Voce sobe 2 arquivos para a VPS: o ZIP e o script `bootstrap-local.sh`. Depois executa:

```text
sudo bash bootstrap-local.sh sistema-atendimento-v3.0.0.zip
```

Ou ainda mais simples: o script pode buscar automaticamente qualquer `.zip` que comece com `sistema-atendimento` no diretorio atual.

### Secao tecnica

| Arquivo | Alteracao |
|---|---|
| `deploy/scripts/bootstrap-local.sh` | Reescrever para suportar modo ZIP (argumento ou autodeteccao) |

O script tera ~90 linhas e cobrira ambos os cenarios:
- ZIP solto no servidor (servidor limpo)
- Ja descompactado manualmente

