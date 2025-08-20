# Use Node 20 Alpine base image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy only package files to install dependencies first
COPY package*.json ./

# Install production dependencies
RUN npm install --only=production

# Copy the rest of the application
COPY . .

# Install PM2 globally
RUN npm install -g pm2

# Expose port 5000
EXPOSE 5000

# Start the app using PM2
CMD ["pm2-runtime", "server.js"]
