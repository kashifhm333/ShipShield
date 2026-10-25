FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
USER 10001:10001
CMD ["node", "dist/index.js"]
