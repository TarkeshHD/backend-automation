#!/bin/bash
set -e  # Exit immediately on error

# Navigate to the directory of your application
cd /home/ubuntu/vrse-builder-backend

# Backup directory paths
BACKUP_DIR="/home/ubuntu/backup"
UPLOADS_BACKUP="$BACKUP_DIR/uploads_backup"
CONFIG_BACKUP="$BACKUP_DIR/configuration_backup"
PUBLIC_BACKUP="$BACKUP_DIR/public_backup"

# Use NVM to switch to Node.js version 16
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads NVM
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads NVM bash_completion
nvm use 16

# Restore the uploads folder if it exists
if [ -d "$UPLOADS_BACKUP" ]; then
    echo "Restoring the uploads folder..."
    sudo mv "$UPLOADS_BACKUP" /home/ubuntu/vrse-builder-backend/uploads
else
    echo "No uploads backup found."
fi

# Restore the configuration.json file if it exists
if [ -f "$CONFIG_BACKUP" ]; then
    echo "Restoring the configuration.json file..."
    sudo mv "$CONFIG_BACKUP" /home/ubuntu/vrse-builder-backend/configuration.json
else
    echo "No configuration.json backup found."
fi

# Restore the public folder if it exists
if [ -d "$PUBLIC_BACKUP" ]; then
    echo "Restoring the public folder..."
    sudo mv "$PUBLIC_BACKUP" /home/ubuntu/vrse-builder-backend/public
else
    echo "No public folder backup found."
fi

# Stop all running PM2 processes
pm2 stop all

# Ensure correct ownership of the project directory
sudo chown -R $USER:$USER /home/ubuntu/vrse-builder-backend

# Install necessary Node.js packages
npm install

# Start your application with PM2
pm2 start server.js --update-env

# Save the PM2 process list so it can be resurrected on server restart
pm2 save

# Display the status of all PM2 processes
pm2 status
