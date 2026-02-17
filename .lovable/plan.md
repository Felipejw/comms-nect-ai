
# Correcao Definitiva do Script de Update

## Diagnostico

O script atual tem problemas que impedem a atualizacao correta:

1. **Cache do Vite**: O build pode usar cache antigo. O script limpa `dist/` mas nao limpa `.vite` cache nem `node_modules/.vite`
2. **Diretorio errado para docker-compose**: Os comandos de reload do Nginx rodam de `$PROJECT_DIR`, mas o `docker-compose.yml` esta em `$DEPLOY_DIR`. Embora o force-recreate posterior resolva, o fluxo e fragil
3. **Sem verificacao de build**: O script nao verifica se o `dist/` realmente foi gerado com conteudo novo

## Solucao

Corrigir o `deploy/scripts/update.sh` com as seguintes melhorias:

### Alteracoes no arquivo `deploy/scripts/update.sh`

1. **Limpar caches antes do build** (secao 2 - Rebuild):
   - Adicionar `rm -rf node_modules/.vite .vite` antes do build
   - Manter o `rm -rf dist` existente

2. **Executar docker-compose do diretorio correto** (secao 3 - Deploy):
   - Mover o `cd "$DEPLOY_DIR"` para ANTES dos comandos docker-compose de reload do Nginx
   - Ou usar `$DOCKER_COMPOSE -f "$DEPLOY_DIR/docker-compose.yml"` explicitamente

3. **Adicionar verificacao de build**:
   - Apos o build, verificar se `dist/index.html` existe
   - Se nao existir, abortar com erro

4. **Forcar limpeza do cache do navegador via hash**:
   - O Vite ja gera hashes nos nomes dos arquivos, mas garantir que o `index.html` nao esteja sendo cacheado pelo Nginx

### Detalhes tecnicos

```text
Secao 2 - Antes do build:
  Adicionar: rm -rf node_modules/.vite .vite
  
Secao 2 - Apos o build:
  Adicionar verificacao: 
    if [ ! -f "dist/index.html" ]; then
        log_error "Build nao gerou dist/index.html"
        exit 1
    fi

Secao 3 - Reload do Nginx:
  Usar: docker exec app-nginx nginx -s reload
  (nome fixo do container conforme docker-compose.yml: container_name: app-nginx)
```

A mudanca mais importante e usar `docker exec app-nginx` em vez de `$DOCKER_COMPOSE ps -q nginx`, pois o container tem nome fixo `app-nginx` definido no docker-compose.yml (linha 345). Isso elimina a dependencia do diretorio atual.

### Resumo

| Problema | Correcao |
|----------|----------|
| Cache do Vite | Limpar `.vite` e `node_modules/.vite` |
| Nginx nao recarrega | Usar `docker exec app-nginx` diretamente |
| Build sem verificacao | Checar se `dist/index.html` existe |
