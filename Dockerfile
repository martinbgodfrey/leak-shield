# Use the official Playwright image (Browsers are already installed!)
FROM mcr.microsoft.com/playwright:v1.40.0-jammy

# Set up the folder
WORKDIR /app

# Copy dependency files first
COPY package*.json ./

# Install standard Node packages
RUN npm install

# Copy the rest of your code
COPY . .

# Tell Railway where the door is
ENV PORT=3000
EXPOSE 3000

# Start the engine
CMD ["node", "server.js"]