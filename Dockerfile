FROM node:24-slim

WORKDIR /app
ENV HOST=0.0.0.0 PORT=3000

COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/web/package.json packages/web/
RUN npm ci

COPY . .
RUN mkdir -p data && chown node:node data

USER node
EXPOSE 3000
CMD ["npm", "start"]
