# Dispatch recommendations: reads hospitals/ambulances, asks the AI service to rank them
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 5001
CMD ["node", "server.js"]
