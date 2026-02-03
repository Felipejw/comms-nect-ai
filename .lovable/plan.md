

# Plano: Corrigir Erros de Tipo TypeScript no Baileys Server

## Problema Identificado

O build do TypeScript falha com 10 erros de tipo:

| Arquivo | Linha | Erro | Causa |
|---------|-------|------|-------|
| `baileys.ts` | 215, 220, 224, 229, 234 | `null` nao e atribuivel a `string \| undefined` | Propriedades `mimetype` do Baileys podem retornar `null` |
| `index.ts` | 83, 98, 114, 135, 152 | `string \| string[]` nao e atribuivel a `string` | `req.params.name` em Express pode ser array |

## Solucao

### 1. Corrigir `baileys.ts` (linhas 215-234)

Converter `null` para `undefined` usando nullish coalescing:

```typescript
// Antes
mimetype = messageContent.imageMessage?.mimetype;

// Depois
mimetype = messageContent.imageMessage?.mimetype ?? undefined;
```

Aplicar em todas as 5 ocorrencias.

### 2. Corrigir `index.ts` (linhas 83-152)

Extrair o nome da sessao como string segura:

```typescript
// Antes
const session = getSession(req.params.name);

// Depois
const sessionName = Array.isArray(req.params.name) 
  ? req.params.name[0] 
  : req.params.name;
const session = getSession(sessionName);
```

Aplicar em todas as 5 rotas que usam `req.params.name`.

## Arquivos a Modificar

| Arquivo | Mudancas |
|---------|----------|
| `deploy/baileys/src/baileys.ts` | Adicionar `?? undefined` em 5 atribuicoes de mimetype |
| `deploy/baileys/src/index.ts` | Adicionar conversao segura de `req.params.name` em 5 rotas |

## Apos Correcao

Execute novamente no servidor:

```bash
cd /opt/baileys
sudo docker compose build --no-cache
sudo docker compose up -d
```

