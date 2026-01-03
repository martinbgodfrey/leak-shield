# Use the official Playwright image (Includes Node.js + Browsers + Linux Dependencies)
FROM mcr.microsoft.com/playwright:v1.41.0-jammy

# 1. Set the working directory inside the container
WORKDIR /app

# 2. Copy package files first (better caching)
COPY package*.json ./

# 3. Install dependencies
RUN npm install

# 4. Copy the rest of your code
COPY . .

# 5. Expose the port Railway expects
ENV PORT=3000
EXPOSE 3000

# 6. Start the server (with a specific host binding for Docker)
CMD ["node", "server.js"]