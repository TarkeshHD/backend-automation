# Use official Node.js LTS Alpine base image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files first to install dependencies
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Install PM2 globally
RUN npm install -g pm2

# Copy the rest of the application
COPY . .

# Expose the port the app runs on
EXPOSE 3000

# Start the app using PM2 runtime
CMD ["pm2-runtime", "server.js"]
