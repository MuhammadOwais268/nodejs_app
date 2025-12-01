FROM node:18-slim
WORKDIR /usr/src/app
COPY package*.json ./
# Use npm install to avoid CI lockfile mismatch in the container build environment
RUN npm install --omit=dev --no-audit --no-fund
COPY . .
ENV PORT=3004
EXPOSE 3004
CMD ["node", "src/app.js"]
