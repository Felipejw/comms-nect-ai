

## Criar script `install.sh` na raiz do projeto

### Problema
Comandos longos com nomes de arquivo como `bootstrap-local.sh` quebram em multiplas linhas no terminal, causando erros repetidos de "No such file or directory".

### Solucao
Criar um arquivo `install.sh` na raiz do projeto (ao lado de `package.json`) que serve como atalho para o `bootstrap-local.sh`. Assim o comando de instalacao fica curto e impossivel de quebrar.

### Comando final de instalacao

```text
sudo bash -c "unzip chatbot.zip -d /tmp/sx && bash /tmp/sx/*/install.sh"
```

### Detalhes tecnicos

**Novo arquivo: `install.sh` (raiz do projeto)**
- Script de 5 linhas que detecta seu proprio diretorio
- Redireciona para `deploy/scripts/bootstrap-local.sh`
- Passa argumentos e stdin (`< /dev/tty`) para manter prompts interativos

**Conteudo do script:**
```bash
#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
exec bash "$DIR/deploy/scripts/bootstrap-local.sh" "$@" < /dev/tty
```

Nenhum outro arquivo sera alterado.
