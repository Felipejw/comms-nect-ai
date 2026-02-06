

## Corrigir erros de build do TypeScript no Baileys v7

O build no VPS falhou porque o compilador TypeScript encontrou 5 erros no arquivo `deploy/baileys/src/baileys.ts`. Isso acontece porque na versao 7 do Baileys, o tipo `proto.IWebMessageInfo` define a propriedade `key` como possivelmente nula (`IMessageKey | null | undefined`), e o codigo acessa `msg.key` sem verificar isso.

### Erros encontrados

1. **Linhas 224, 274, 277, 283** - `msg.key` e acessado diretamente sem verificar se e nulo
2. **Linha 296** - O tipo `IWebMessageInfo` nao e compativel com o parametro esperado por `downloadMediaMessage` porque `key` pode ser nulo

### Correcao

**Arquivo: `deploy/baileys/src/baileys.ts`**

1. Na funcao `processIncomingMessage` (linha 216), adicionar uma verificacao de guarda logo no inicio:
   ```text
   if (!msg.key) return;
   ```
   Isso garante que todo o codigo abaixo pode acessar `msg.key` com seguranca.

2. Na chamada `downloadMediaMessage` (linha 296), fazer cast de `msg` para `any` para resolver a incompatibilidade de tipos:
   ```text
   const buffer = await downloadMediaMessage(
     msg as any,
     'buffer',
     ...
   ```

3. Tambem adicionar guarda nas linhas 196/198 do handler `messages.upsert` por seguranca:
   ```text
   if (!msg.key || msg.key.fromMe) continue;
   if (msg.key.remoteJid === 'status@broadcast') continue;
   ```

### Resultado

Apos essas correcoes, o `npm run build` (tsc) vai compilar sem erros e o Docker vai construir a imagem com sucesso. Depois disso, basta rodar o bootstrap novamente no VPS.

