FROM node:20-alpine
LABEL org.opencontainers.image.description="Backend API service for the Essentials application, handling authentication and container management."

WORKDIR /app/backend

# Install build dependencies for native modules (like bcrypt)
RUN apk add --no-cache python3 make g++

COPY backend/package*.json ./
RUN npm install
COPY backend/ ./
RUN npm run build

ENV PORT=3000
EXPOSE 3000

CMD ["node", "dist/index.js"]
