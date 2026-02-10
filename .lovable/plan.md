

## Corrigir instalacao standalone do Baileys

### Problema
O `docker-compose.yml` do Baileys referencia a rede `deploy_supabase-network` como `external: true`. Quando o Baileys e instalado de forma standalone (sem o sistema completo), essa rede nao existe, causando falha no `docker compose up`.

### Solucao

**1. Atualizar `deploy/baileys/docker-compose.yml`**
- Remover a dependencia de rede externa
- Usar uma rede propria ou a rede bridge padrao
- O Baileys standalone nao precisa de rede compartilhada com Supabase

Antes:
```text
networks:
  supabase-network:
    name: deploy_supabase-network
    external: true
```

Depois:
```text
networks:
  baileys-network:
    driver: bridge
```

E no servico `baileys`, trocar `supabase-network` por `baileys-network`.

**2. Atualizar `deploy/baileys/scripts/install-simple.sh`**
- Adicionar criacao automatica da rede caso o docker-compose ainda dependa dela (fallback)
- Ou simplesmente confiar no novo docker-compose corrigido

### Arquivos a modificar
- `deploy/baileys/docker-compose.yml` -- trocar rede externa por rede local
- `deploy/baileys/scripts/install-simple.sh` -- nenhuma mudanca necessaria apos correcao do compose

### Secao tecnica
- A rede `deploy_supabase-network` so existe quando o sistema completo (deploy/docker-compose.yml) esta rodando
- Para instalacao standalone do Baileys, uma rede bridge propria e suficiente
- A comunicacao com o Supabase/Cloud acontece via HTTPS (webhook), nao via rede Docker interna

