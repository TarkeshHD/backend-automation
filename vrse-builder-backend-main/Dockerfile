<<<<<<< HEAD
# Base image
=======
# Use official Node.js LTS Alpine base image
>>>>>>> 19a7cee3dd0f4a25f8b8b028ef329d9c5d9da81e
FROM node:20-alpine

# Set working directory
WORKDIR /app

<<<<<<< HEAD
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
=======
# Copy package files first to install dependencies
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Install PM2 globally
RUN npm install -g pm2

# Copy rest of the application
COPY . .

# Expose the port the app runs on
EXPOSE 3000

# Start the app using PM2 runtime
>>>>>>> 19a7cee3dd0f4a25f8b8b028ef329d9c5d9da81e
CMD ["pm2-runtime", "server.js"]
