# Imagen base oficial de Node.js (versión LTS ligera)
FROM node:20-alpine

# Directorio de trabajo dentro del contenedor
WORKDIR /app

# Copiamos primero los archivos de dependencias
# (esto aprovecha el caché de Docker: si no cambia package.json, no reinstala todo)
COPY package*.json ./

# Instalamos solo dependencias de producción
RUN npm install --omit=dev

# Copiamos el resto del código
COPY . .

# Puerto que expone el contenedor (Render lo lee automáticamente)
EXPOSE 3000

# Comando para arrancar el servidor
CMD ["node", "Server.js"]
