# Single image: builds the client, then serves it from the API (one origin,
# first-party cookies, WebSockets on the same host).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --ignore-scripts
COPY . .
ARG VITE_APP_NAME=Duo
ENV VITE_APP_NAME=$VITE_APP_NAME
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --omit=dev --workspace server --ignore-scripts && npm cache clean --force
COPY server/src server/src
COPY server/scripts server/scripts
COPY --from=build /app/client/dist client/dist
# Named volumes inherit this ownership, so the non-root app can write uploads.
RUN mkdir -p /data/uploads && chown node:node /data/uploads
USER node
EXPOSE 5000
CMD ["node", "server/src/server.js"]
