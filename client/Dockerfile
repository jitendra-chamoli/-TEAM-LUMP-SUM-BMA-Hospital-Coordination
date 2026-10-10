# Build the React app, then serve the static files with nginx.
# VITE_* values are baked in at build time and are the URLs the *browser* uses.
FROM node:22-alpine AS build
WORKDIR /app
ARG VITE_API_URL=http://localhost:5000
ARG VITE_ORCHESTRATOR_URL=http://localhost:5001
ENV VITE_API_URL=$VITE_API_URL VITE_ORCHESTRATOR_URL=$VITE_ORCHESTRATOR_URL
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
