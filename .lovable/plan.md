

# Diagnostico: Frontend antigo ainda sendo servido no VPS

## O que esta acontecendo

As mudancas JA ESTAO no codigo-fonte (verificado agora):
- `AudioProcessingStatus` foi removido da renderizacao (linha 1949)
- Filtro de `[Audio]` esta implementado (linha 1092-1095)
- `MediaAutoDownloader` tem o design novo com icones e cores

Porem o VPS continua mostrando a versao ANTIGA. Isso indica que:
1. O navegador esta servindo cache antigo, OU
2. O Nginx esta servindo cache antigo

## Solucao

### Passo 1: Limpar cache no navegador

Acesse o sistema no navegador e pressione:
- **Windows/Linux**: `Ctrl + Shift + R`
- **Mac**: `Cmd + Shift + R`

Ou abra em aba anonima/privada.

### Passo 2: Se nao resolver - forcar limpeza no Nginx

Rode no VPS:

```bash
# Verificar se o build novo esta no volume
ls -la /opt/sistema/deploy/volumes/frontend/assets/ | head -20

# Reiniciar Nginx para limpar cache
cd /opt/sistema/deploy && docker compose restart nginx
```

### Passo 3: Se ainda nao resolver - rebuild forcado

```bash
cd /opt/sistema
rm -rf dist
docker run --rm -v "$(pwd)":/app -w /app node:20-alpine sh -c "npm install --legacy-peer-deps && npm run build"
cp -r dist/* deploy/volumes/frontend/
# Preservar config.js se existir
cd deploy && docker compose restart nginx
```

## Sobre o erro de upload de audio (RLS)

As politicas de storage tambem foram corrigidas no `update.sh`, mas so serao aplicadas se o script chegar ate a secao de "Garantindo buckets de storage". Confirme que no output do update voce viu a linha `[OK] Buckets de storage verificados`. Se nao apareceu, rode manualmente no VPS:

```bash
cd /opt/sistema/deploy && docker compose exec -T db psql -U postgres -d postgres -c "
DROP POLICY IF EXISTS \"Auth upload whatsapp-media\" ON storage.objects;
DROP POLICY IF EXISTS \"Auth upload chat-attachments\" ON storage.objects;
DROP POLICY IF EXISTS \"Service role can upload WhatsApp media\" ON storage.objects;
CREATE POLICY \"Auth upload whatsapp-media\" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'whatsapp-media');
CREATE POLICY \"Auth upload chat-attachments\" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'chat-attachments');
"
```

## Resumo

| Problema | Causa | Solucao |
|----------|-------|---------|
| Visual antigo no VPS | Cache do navegador/Nginx | Ctrl+Shift+R ou restart nginx |
| "[Audio]" aparecendo | Cache - codigo ja corrigido | Mesma solucao acima |
| Banner processamento | Cache - codigo ja corrigido | Mesma solucao acima |
| Erro RLS upload | Politica sem TO authenticated | Rodar SQL acima no banco |

