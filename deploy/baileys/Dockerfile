FROM node:20-alpine

# Instalar dependencias do sistema para compilacao nativa
RUN apk add --no-cache python3 make g++ git

WORKDIR /app

# Copiar arquivos de dependencias
COPY package*.json ./

# Instalar dependencias
RUN npm install

# Copiar codigo fonte
COPY . .

# Compilar TypeScript
RUN npm run build

# Criar diretorio de sessoes
RUN mkdir -p /app/sessions

# Expor porta
EXPOSE 3000

# Comando de inicio
CMD ["node", "dist/index.js"]
