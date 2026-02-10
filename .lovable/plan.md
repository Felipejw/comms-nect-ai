

## Hospedar sistema completo na VPS com chatbotvital.store

### Situacao atual

- A VPS tem apenas o **Baileys standalone** instalado em `/opt/baileys` (motor WhatsApp, sem frontend)
- O sistema completo (frontend + banco + auth + Baileys integrado) requer a instalacao via `deploy/scripts/install-unified.sh`, que instala tudo em `/opt/sistema`
- O `bootstrap.sh` do sistema completo tem o **mesmo bug de stdin** que ja corrigimos no Baileys

### Pre-requisitos na VPS (antes de rodar)

O usuario precisa parar o Baileys standalone para liberar as portas 80/443:

```text
cd /opt/baileys && sudo docker compose down
sudo systemctl stop nginx
```

### Alteracoes necessarias

#### 1. `deploy/scripts/bootstrap.sh` -- Corrigir stdin do pipe

Adicionar `< /dev/tty` na chamada do `install-unified.sh` (linha 135), identico ao fix ja aplicado no Baileys bootstrap:

```text
./scripts/install-unified.sh < /dev/tty
```

#### 2. `deploy/scripts/install-unified.sh` -- Adicionar prompt de dominio

A funcao `collect_user_info()` (linha 166) atualmente detecta o IP automaticamente sem perguntar o dominio. Precisa ser modificada para:

- Perguntar o dominio ao usuario interativamente (`read -p`)
- Usar o IP publico como fallback caso o usuario nao informe nada
- Perguntar o email para SSL

Trecho a modificar na funcao `collect_user_info()` (linhas 170-175):

Substituir a logica de auto-deteccao por:

```text
# Dominio: perguntar ao usuario
echo ""
echo -e "  Digite o dominio do servidor (ex: meudominio.com.br)"
echo -e "  Deixe vazio para usar o IP publico"
read -p "  Dominio: " DOMAIN

if [ -z "$DOMAIN" ]; then
    DOMAIN=$(curl -s ifconfig.me 2>/dev/null || echo "localhost")
fi

echo ""
read -p "  Email para certificado SSL: " SSL_EMAIL
if [ -z "$SSL_EMAIL" ]; then
    SSL_EMAIL="admin@${DOMAIN}"
fi
```

### Nenhuma outra alteracao necessaria

O restante do `install-unified.sh` (JWT, Kong, SSL, frontend build, banco, admin) ja esta funcional. O Nginx conf ja suporta frontend SPA + todas as APIs + Baileys integrado.

### Comando que o usuario vai rodar na VPS

Apos as alteracoes serem publicadas no GitHub:

```text
cd /opt/baileys && sudo docker compose down
sudo systemctl stop nginx
cd /tmp && sudo rm -rf /opt/baileys
curl -fsSL https://raw.githubusercontent.com/Felipejw/comms-nect-ai/main/deploy/scripts/bootstrap.sh | sudo bash
```

### Resultado esperado

O sistema completo estara acessivel em `https://chatbotvital.store` com:
- Frontend (tela de login, dashboard, atendimento)
- Backend completo (banco PostgreSQL, auth, storage, realtime)
- Baileys integrado em `https://chatbotvital.store/baileys`
- SSL configurado automaticamente
- Admin: admin@admin.com / 123456

### Secao tecnica

Arquivos modificados:
1. `deploy/scripts/bootstrap.sh` -- 1 linha: `< /dev/tty`
2. `deploy/scripts/install-unified.sh` -- ~10 linhas na funcao `collect_user_info()`

