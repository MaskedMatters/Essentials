FROM node:20-alpine
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install
COPY backend/ ./
RUN npm run build

ENV PORT=3000
EXPOSE 3000

CMD ["node", "dist/index.js"]
