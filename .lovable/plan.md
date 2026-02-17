

# Corrigir build da VPS - `.env` sobrepondo variáveis de ambiente

## Problema raiz

O comando `docker run -v "$(pwd)":/app` monta o diretorio inteiro do projeto dentro do container, **incluindo o arquivo `.env`**. O Vite le esse `.env` automaticamente e as URLs do Lovable Cloud contidas nele acabam sendo embutidas no JavaScript, mesmo com as flags `-e` do Docker.

Embora a documentacao do Vite diga que variaveis de ambiente do processo tem prioridade sobre `.env`, na pratica o comportamento dentro do Docker pode variar dependendo de como o shell processa as variaveis.

## Solucao

Alterar o comando de build no `deploy/scripts/update.sh` para **substituir temporariamente o conteudo do `.env`** dentro do container antes de compilar, garantindo que o Vite leia apenas valores placeholder.

### Alteracao no arquivo `deploy/scripts/update.sh` (linhas 86-90)

Trocar:

```text
docker run --rm -v "$(pwd)":/app -w /app \
  -e VITE_SUPABASE_URL=placeholder \
  -e VITE_SUPABASE_PUBLISHABLE_KEY=placeholder \
  -e VITE_SUPABASE_PROJECT_ID=self-hosted \
  node:20-alpine sh -c "npm install --legacy-peer-deps && npm run build"
```

Por:

```text
docker run --rm -v "$(pwd)":/app -w /app \
  node:20-alpine sh -c "\
    cp .env .env.lovable.bak 2>/dev/null || true && \
    echo 'VITE_SUPABASE_URL=placeholder' > .env && \
    echo 'VITE_SUPABASE_PUBLISHABLE_KEY=placeholder' >> .env && \
    echo 'VITE_SUPABASE_PROJECT_ID=self-hosted' >> .env && \
    npm install --legacy-peer-deps && npm run build; \
    EXIT_CODE=\$?; \
    cp .env.lovable.bak .env 2>/dev/null || true && \
    rm -f .env.lovable.bak; \
    exit \$EXIT_CODE"
```

### O que faz

1. Faz backup do `.env` original
2. Sobrescreve o `.env` com valores placeholder
3. Executa o build (Vite agora le "placeholder" do `.env`)
4. Restaura o `.env` original ao final

### Por que isso resolve

O Vite carrega o `.env` do diretorio de trabalho antes de verificar variaveis de ambiente do processo. Ao sobrescrever o arquivo diretamente, garantimos que nao importa a ordem de prioridade -- o unico valor disponivel e "placeholder", ativando o fallback para `config.js`.

