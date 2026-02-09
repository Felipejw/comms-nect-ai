

# Correção: QR Code fica carregando infinitamente

## Problemas Encontrados

Encontrei **2 problemas** que impedem o QR Code de aparecer:

### Problema 1: Webhook não encontra a conexão
Quando o servidor Baileys gera o QR Code, ele envia um webhook. Mas o webhook procura conexões com `engine: "baileys"` no campo `session_data`, e a criação da conexão **não salva esse campo**.

- Criação salva: `{ sessionName: "BABA" }`
- Webhook procura: `sessionData?.engine === "baileys"` -- nunca encontra!

### Problema 2: Polling não reconhece status `waiting_qr`
Quando o QR Code é salvo pelo polling (via Edge Function), o status muda de `connecting` para `waiting_qr`. Mas o polling só busca QR quando `status === "connecting"`. Resultado: depois que o status muda, o polling não busca mais, mas também não para -- fica girando infinitamente.

## Correções

### 1. `supabase/functions/baileys-instance/index.ts`
Na criação da conexão, incluir `engine: "baileys"` no `session_data`:
```text
session_data: { sessionName, engine: "baileys" }
```

### 2. `supabase/functions/baileys-webhook/index.ts`
Flexibilizar a busca da conexão para também encontrar conexões sem o campo `engine`:
```text
return sessionData?.sessionName === session;
```
(Remover a exigência de `engine === "baileys"`)

### 3. `src/pages/Conexoes.tsx`
Ajustar a condição de polling para incluir o status `waiting_qr`:
```text
if ((connection.status === "connecting" || connection.status === "waiting_qr") && !connection.qr_code) {
```

E adicionar `waiting_qr` como condição para exibir o indicador de QR Code.

## Resultado Esperado
Após as correções:
1. O webhook conseguirá encontrar a conexão e salvar o QR Code no banco
2. O polling aceitará o status `waiting_qr` e continuará tentando buscar o QR
3. O QR Code aparecerá na tela para o usuário escanear

## Detalhes Técnicos

Arquivos modificados:
- `supabase/functions/baileys-instance/index.ts` -- adicionar `engine: "baileys"` ao `session_data` na criação
- `supabase/functions/baileys-webhook/index.ts` -- remover exigência de `engine === "baileys"` na busca
- `src/pages/Conexoes.tsx` -- incluir `waiting_qr` nas condições de polling

Nota: As conexões já existentes (BR, Teste) não têm `engine: "baileys"`. A correção no webhook resolve isso flexibilizando a busca. Novas conexões terão o campo correto.

