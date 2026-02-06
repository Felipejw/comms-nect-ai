

# Corrigir bootstrap.sh e restaurar Baileys no VPS

## O que aconteceu

O script `bootstrap.sh` tem um bug critico: ele deleta a instalacao antiga ANTES de verificar se consegue baixar a nova. Quando o `git clone` falha (porque o repositorio GitHub nao esta acessivel), o `set -e` mata o script silenciosamente, deixando o servidor sem nenhuma instalacao.

## Correcoes necessarias

### 1. Corrigir o bug no `bootstrap.sh`

**Arquivo: `deploy/baileys/scripts/bootstrap.sh`**

Duas correcoes:
- Adicionar `|| true` no `git clone` para que o `set -e` nao mate o script silenciosamente
- Mover a delecao da instalacao antiga para DEPOIS de confirmar que o download foi bem-sucedido

Logica corrigida:
```text
# Primeiro: baixar arquivos em /tmp (SEM deletar instalacao antiga)
git clone --depth 1 --branch "$BRANCH" "$REPO_URL" /tmp/comms-nect-ai 2>/dev/null || true

# Verificar se download funcionou
if [ ! -d "/tmp/comms-nect-ai/deploy/baileys" ]; then
    log_error "Falha ao baixar arquivos do GitHub."
    log_error "Verifique se o repositorio existe: $REPO_URL"
    exit 1
fi

# SO AGORA deletar instalacao antiga (pois temos a nova garantida)
if [ -d "$INSTALL_DIR" ]; then
    # backup sessions...
    # parar containers...
    rm -rf "$INSTALL_DIR"
fi
```

### 2. Corrigir o mesmo bug no `deploy/scripts/bootstrap.sh`

O bootstrap principal (`deploy/scripts/bootstrap.sh`) tem o mesmo padrao perigoso: deleta `/opt/sistema` antes de confirmar que o clone funcionou. Aplicar a mesma correcao.

### 3. Publicar no GitHub

Apos as correcoes, o projeto precisa ser sincronizado com o GitHub para que o VPS consiga baixar os arquivos. Verifique em **Settings > GitHub** se o repositorio esta conectado.

## Restauracao imediata do VPS

Enquanto isso, para restaurar o servidor Baileys agora, o usuario pode testar manualmente no VPS se o repositorio esta acessivel:

```text
git clone --depth 1 https://github.com/Felipejw/comms-nect-ai.git /tmp/teste-clone
```

Se falhar, confirma que o repositorio nao esta disponivel e o projeto precisa ser publicado no GitHub primeiro.

Se funcionar (talvez houve uma falha temporaria de rede), basta re-executar o bootstrap:
```text
curl -fsSL https://raw.githubusercontent.com/Felipejw/comms-nect-ai/main/deploy/baileys/scripts/bootstrap.sh | sudo bash
```

## Detalhes tecnicos

### Arquivo: `deploy/baileys/scripts/bootstrap.sh`

Reorganizar a ordem das operacoes:
1. Limpar /tmp/comms-nect-ai residual
2. Clonar repositorio em /tmp
3. Verificar se clone funcionou
4. SO ENTAO fazer backup e remover instalacao antiga
5. Copiar arquivos novos
6. Restaurar sessoes
7. Executar install-simple.sh

### Arquivo: `deploy/scripts/bootstrap.sh`

Mesma logica: mover o `rm -rf "$INSTALL_DIR"` para depois do `git clone` bem-sucedido.

### Resumo dos arquivos a modificar
- `deploy/baileys/scripts/bootstrap.sh` - reordenar operacoes para seguranca
- `deploy/scripts/bootstrap.sh` - mesma correcao

