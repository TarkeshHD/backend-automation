#!/bin/bash
set -e  # Exit immediately on error

# Define paths
APP_DIR="/home/ubuntu/vrse-builder-backend"
BACKUP_DIR="/home/ubuntu/backup"
UPLOADS_BACKUP="$BACKUP_DIR/uploads_backup"
CONFIG_BACKUP="$BACKUP_DIR/configuration_backup"
PUBLIC_BACKUP="$BACKUP_DIR/public_backup"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Backup the uploads folder
if [ -d "$APP_DIR/uploads" ]; then
    echo "Backing up the uploads folder..."
    cp -r "$APP_DIR/uploads" "$UPLOADS_BACKUP"
else
    echo "No uploads folder to backup."
fi

# Backup the configuration.json file
if [ -f "$APP_DIR/configuration.json" ]; then
    echo "Backing up configuration.json..."
    cp "$APP_DIR/configuration.json" "$CONFIG_BACKUP"
else
    echo "No configuration.json file to backup."
fi

# Backup the public folder
if [ -d "$APP_DIR/public" ]; then
    echo "Backing up the public folder..."
    cp -r "$APP_DIR/public" "$PUBLIC_BACKUP"
else
    echo "No public folder to backup."
fi

# Remove the vrse-builder-backend directory
cd /home/ubuntu
sudo rm -rf "$APP_DIR"

echo "Backup and removal completed successfully."
