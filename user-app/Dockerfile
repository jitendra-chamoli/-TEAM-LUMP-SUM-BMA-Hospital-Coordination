# Build the citizen app, then serve the static files with nginx.
# VITE_API_URL is baked in at build time: it's the URL the *browser* uses.
FROM node:22-alpine AS build
WORKDIR /app
ARG VITE_API_URL=http://localhost:5000
ENV VITE_API_URL=$VITE_API_URL
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
