FROM node:20-slim

WORKDIR /app

# Copiar manifiestos primero para aprovechar la cache de Docker.
# Si package.json no cambia, npm install no vuelve a correr en cada build.
COPY package.json package-lock.json* ./
RUN npm install

# Copiar el resto del codigo fuente
COPY . .

EXPOSE 3000

# --host 0.0.0.0 es obligatorio dentro de Docker:
# sin esto Vite escucha solo en 127.0.0.1 (dentro del contenedor)
# y el puerto no es accesible desde el host.
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
