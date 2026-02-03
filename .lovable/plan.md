

# Plano: Corrigir Nginx e Disponibilizar o Sistema

## Problemas Identificados

### Problema 1: Nginx Crashando
O erro nos logs:
```
host not found in upstream "kong:8000" in /etc/nginx/nginx.conf:47
```

**Causa**: O Nginx define upstreams para containers que podem nao existir (`evolution`, `studio`) ou que ainda nao iniciaram quando o Nginx tenta resolver os nomes DNS.

### Problema 2: Firewall/Portas
O erro `ERR_CONNECTION_REFUSED` indica que as portas 80/443 podem estar bloqueadas no firewall do servidor.

---

## Solucao

### Parte 1: Corrigir nginx.conf

Vou modificar o arquivo para:
1. Usar `resolver` do Docker para resolucao DNS dinamica
2. Usar `set $upstream` com variaveis para upstreams que podem nao existir
3. Adicionar fallback para quando Kong nao estiver disponivel

### Parte 2: Verificacoes no Servidor

Voce precisara executar alguns comandos para verificar e liberar as portas.

---

## Arquivos a Modificar

| Arquivo | Acao | Descricao |
|---------|------|-----------|
| `deploy/nginx/nginx.conf` | Modificar | Corrigir resolucao DNS e remover upstreams inexistentes |

---

## Alteracoes Tecnicas

### nginx.conf - Antes (problematico)
```nginx
upstream supabase_kong {
    server kong:8000;
    keepalive 32;
}

upstream evolution_api {
    server evolution:8080;  # NAO EXISTE!
    keepalive 8;
}
```

### nginx.conf - Depois (corrigido)
```nginx
# Usar resolver do Docker
resolver 127.0.0.11 valid=10s ipv6=off;

# Remover upstreams estaticos problematicos
# Usar variaveis com set $upstream para resolucao dinamica

server {
    # Kong proxy com fallback
    location /rest/v1/ {
        set $upstream_kong kong:8000;
        proxy_pass http://$upstream_kong/rest/v1/;
        # ...
    }
}
```

---

## Comandos que Voce Precisara Executar

### 1. Verificar se as portas estao abertas no firewall

```bash
# Ver status do firewall
sudo ufw status

# Se estiver ativo, liberar as portas
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw reload
```

### 2. Verificar se ha algo ja usando as portas

```bash
sudo ss -tulpn | grep -E ':80|:443'
```

### 3. Verificar o DNS do dominio

```bash
# Verificar se o dominio aponta para o IP do servidor
dig chatbotvital.store +short

# Pegar o IP publico do servidor
curl -s ifconfig.me
```

### 4. Apos eu aplicar a correcao, reiniciar

```bash
cd /opt/sistema/deploy
sudo docker compose down
sudo docker compose --profile baileys up -d
```

---

## Fluxo de Correcao

```text
1. Vou corrigir o nginx.conf
   |
2. Voce executa os comandos de verificacao
   |
3. Confirma se o IP do dominio esta correto
   |
4. Reinicia os containers
   |
5. Sistema deve estar acessivel em https://chatbotvital.store
```

---

## Secao Tecnica Detalhada

### Por que o Nginx falha ao resolver "kong"?

O Nginx por padrao resolve nomes de host no momento da inicializacao. Se o container `kong` ainda nao estiver pronto na rede Docker, a resolucao falha e o Nginx nao inicia.

A solucao e usar:
1. **`resolver 127.0.0.11`** - O DNS interno do Docker
2. **Variaveis com `set $upstream`** - Forca resolucao dinamica em runtime

### Upstreams que nao existem

O arquivo atual define upstreams para:
- `evolution:8080` - Nao existe no docker-compose.yml
- `studio:3000` - So existe se voce subir o profile studio

Isso causa erro fatal porque o Nginx valida todos os upstreams na inicializacao.

