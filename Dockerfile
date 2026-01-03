FROM node:18

# Install dependencies for Playwright
RUN npx playwright install-deps
RUN npx playwright install chromium

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

EXPOSE 3000
CMD ["node", "server.js"]