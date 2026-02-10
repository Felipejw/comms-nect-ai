

## Melhorar script de instalacao do Baileys

### Problema
O script de instalacao atual:
1. Nao pede o dominio do usuario -- mostra "SEU_DOMINIO" como placeholder
2. Nao exibe as credenciais de acesso ao sistema (email/senha padrao)
3. Nao configura o Nginx automaticamente com SSL

### Solucao

Modificar o `deploy/baileys/scripts/install-simple.sh` para:

**1. Perguntar o dominio no inicio da instalacao**
- Adicionar um `read -p` interativo pedindo o dominio (ex: `chatbotvital.store`)
- Usar esse dominio em todas as mensagens e no arquivo CREDENCIAIS.txt

**2. Instalar e configurar Nginx + SSL automaticamente**
- Instalar Nginx se nao existir
- Gerar configuracao com proxy para `/baileys/`
- Obter certificado SSL via Certbot/Let's Encrypt (pedir email para SSL)
- Fallback: se SSL falhar, manter HTTP e avisar

**3. Mostrar credenciais do sistema no resumo final**
- Exibir URL completa do Baileys: `https://DOMINIO/baileys`
- Exibir API Key completa
- Exibir credenciais de acesso ao painel: `admin@admin.com` / `123456`
- Salvar tudo no CREDENCIAIS.txt

### Arquivos a modificar

**`deploy/baileys/scripts/install-simple.sh`**
- Adicionar prompt interativo para dominio e email SSL no inicio
- Adicionar etapa de instalacao/configuracao do Nginx com proxy reverso
- Adicionar etapa de obtencao de certificado SSL (Certbot)
- Atualizar resumo final com dominio real e credenciais do sistema
- Atualizar CREDENCIAIS.txt com todas as informacoes

**`deploy/baileys/scripts/bootstrap.sh`**
- Nenhuma alteracao necessaria (ele apenas chama o install-simple.sh)

### Secao tecnica

Fluxo do install-simple.sh atualizado:

```text
1. Verificar root
2. [NOVO] Perguntar dominio (ex: chatbotvital.store)
3. [NOVO] Perguntar email para SSL
4. Verificar/Instalar Docker
5. [NOVO] Instalar Nginx se necessario
6. Gerar API Key e configuracoes
7. Build e iniciar container Baileys
8. [NOVO] Configurar Nginx com proxy /baileys/ -> localhost:3000
9. [NOVO] Obter certificado SSL com Certbot
10. Exibir resumo com:
    - URL do Baileys: https://DOMINIO/baileys
    - API Key completa
    - Credenciais do painel: admin@admin.com / 123456
    - Comandos uteis
```

Configuracao Nginx gerada automaticamente:
```text
server {
    listen 80;
    server_name DOMINIO;

    location /baileys/ {
        rewrite ^/baileys/(.*)$ /$1 break;
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }
}
```

Depois o Certbot converte automaticamente para HTTPS (porta 443).

