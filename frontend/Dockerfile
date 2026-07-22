# Multi-stage build: compile the SPA with Node, serve the static bundle with
# nginx. frontend/dist is no longer committed, so `docker compose up` must be
# able to produce the bundle from a fresh clone on its own.
FROM node:24-alpine AS build

WORKDIR /build

# Install dependencies first so source edits don't invalidate the npm cache.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:alpine

COPY --from=build /build/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
