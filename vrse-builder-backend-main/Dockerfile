# Base image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json first for caching
COPY package*.json ./

# Install dependencies
RUN npm install --only=production

# Copy the rest of the app
COPY . .

# Install PM2 globally for process management
RUN npm install pm2 -g

# Expose app port
EXPOSE 5000

# Start the application using PM2
CMD ["pm2-runtime", "server.js"]
