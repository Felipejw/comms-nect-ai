

## Diagnostico

O problema eh que a API Key no banco de dados (`9c23d1af...`) nao corresponde a chave ativa no container Baileys (`19dee7ad...`). Quando voce salvou pela interface na VPS, o salvamento falhou silenciosamente (provavelmente por erro de RLS ou a Edge Function nao estar disponivel no ambiente self-hosted).

O servidor aparece como "Online" porque o health check (`/health`) nao exige autenticacao, mas as chamadas para criar sessao e buscar QR Code exigem o header `X-API-Key` correto.

## Solucao Imediata

Existem duas opcoes para sincronizar as chaves:

### Opcao A: Atualizar o banco de dados (recomendado)

Executar diretamente no banco PostgreSQL do VPS:

```sql
UPDATE system_settings 
SET value = '19dee7ad74a98f10e5dc793dd261962ac56945188db8eec5fcc851dc33b216ba' 
WHERE key = 'baileys_api_key';
```

Para executar, rode no VPS:

```bash
sudo docker exec -i supabase-db psql -U supabase_admin -d postgres -c "UPDATE public.system_settings SET value = '19dee7ad74a98f10e5dc793dd261962ac56945188db8eec5fcc851dc33b216ba' WHERE key = 'baileys_api_key';"
```

### Opcao B: Atualizar o container Baileys

```bash
cd /opt/sistema/deploy

# Editar o .env do Baileys
cat > baileys/.env << 'EOF'
API_KEY=9c23d1af8df0df397b2c776b1db712d63314d24be907c60152438e54d5405d39
PORT=3000
EOF

# Recriar o container
sudo docker compose --profile baileys up -d --force-recreate baileys
```

### Apos sincronizar

1. Acesse a pagina de Conexoes
2. Exclua a conexao "Teste" existente (que esta em estado de erro)
3. Clique em "ADICIONAR WHATSAPP" para criar uma nova conexao
4. Clique em "QR CODE" - o QR Code deve aparecer

## Correcao no codigo (para evitar o problema no futuro)

O salvamento de configuracoes na interface da VPS provavelmente falha porque a Edge Function `save-system-setting` nao esta disponivel no ambiente self-hosted, e o fallback direto via Supabase client pode falhar por politicas de RLS. Vou investigar e corrigir o fluxo de salvamento para garantir que funcione no ambiente self-hosted.

### Detalhes tecnicos

- **Arquivo**: `src/lib/safeSettingUpsert.ts` - O fallback direto pode estar falhando silenciosamente
- **Arquivo**: `src/components/configuracoes/BaileysConfigSection.tsx` - O toast de sucesso pode estar disparando mesmo quando o salvamento falhou (pois o `createOrUpdateSetting` pode nao estar propagando o erro corretamente quando a Edge Function retorna erro mas o fallback tambem falha)

