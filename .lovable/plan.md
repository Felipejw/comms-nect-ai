

## Corrigir input interativo no bootstrap via pipe

### Problema
Quando o script e executado via `curl ... | sudo bash`, o stdin do bash vem do pipe (conteudo do script), nao do teclado. Isso faz com que qualquer `read -p` dentro do `install-simple.sh` receba vazio imediatamente.

### Solucao

Modificar **`deploy/baileys/scripts/bootstrap.sh`** para redirecionar `/dev/tty` ao chamar o `install-simple.sh`:

Trocar:
```text
./scripts/install-simple.sh
```

Por:
```text
./scripts/install-simple.sh < /dev/tty
```

O `/dev/tty` conecta diretamente ao terminal do usuario, ignorando o pipe.

### Arquivos a modificar
- `deploy/baileys/scripts/bootstrap.sh` -- uma unica linha: adicionar `< /dev/tty` na chamada do install-simple.sh

### Nenhuma outra alteracao necessaria
O `install-simple.sh` ja esta correto com os prompts interativos. O problema e exclusivamente no redirecionamento de stdin pelo bootstrap.

### Workaround imediato (na VPS)
Enquanto a correcao nao e publicada no GitHub, o usuario pode rodar:
```text
cd /opt/baileys && sudo ./scripts/install-simple.sh
```
