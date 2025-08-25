// db.js

import mongoose from 'mongoose';
import { DB, CONF } from './constants.js';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import performanceTracker from './utils/performanceLogger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { databaseConnection } = CONF;

const getAtlasConnectionString = () => {
  const { ATLAS_USERNAME, ATLAS_PASSWORD, ATLAS_CLUSTER, ATLAS_DBNAME } =
    process.env;
  if (!ATLAS_USERNAME || !ATLAS_PASSWORD || !ATLAS_CLUSTER || !ATLAS_DBNAME) {
    throw new Error('Missing MongoDB Atlas environment variables');
  }

  console.log(
    `String mongodb+srv://${ATLAS_USERNAME}:${encodeURIComponent(
      ATLAS_PASSWORD,
    )}@${ATLAS_CLUSTER}.mongodb.net/${ATLAS_DBNAME}?retryWrites=true&w=majority`,
  );

  return `mongodb+srv://${ATLAS_USERNAME}:${encodeURIComponent(
    ATLAS_PASSWORD,
  )}@${ATLAS_CLUSTER}.mongodb.net/${ATLAS_DBNAME}?retryWrites=true&w=majority`;
};

const getDocumentDBConnectionString = async () => {
  const {
    DOCDB_USERNAME,
    DOCDB_CLUSTER,
    DOCDB_DBNAME,
    DOC_DB_SECRET_MANAGER_NAME,
    DOC_DB_SECRET_MANAGER_REGION,
  } = process.env;

  let { DOCDB_PASSWORD } = process.env;

  if (!DOCDB_USERNAME || !DOCDB_CLUSTER || !DOCDB_DBNAME) {
    throw new Error('Missing Amazon DocumentDB environment variables');
  }

  // Check if DOCDB_PASSWORD is missing
  if (!DOCDB_PASSWORD) {
    if (!DOC_DB_SECRET_MANAGER_NAME || !DOC_DB_SECRET_MANAGER_REGION) {
      throw new Error(
        'Missing DocumentDB password and Secrets Manager configuration.',
      );
    }

    // Fetch password from AWS Secrets Manager
    try {
      const client = new SecretsManagerClient({
        region: DOC_DB_SECRET_MANAGER_REGION,
      });

      const command = new GetSecretValueCommand({
        SecretId: DOC_DB_SECRET_MANAGER_NAME,
      });

      const response = await client.send(command);

      console.log('Secrets Manager response:', response);
      if (response.SecretString) {
        console.log('SecretString:', response.SecretString);
        const secret = JSON.parse(response.SecretString);
        console.log('Secret:', secret);
        DOCDB_PASSWORD = secret.password || '';
      }

      if (!DOCDB_PASSWORD) {
        throw new Error('Password not found in AWS Secrets Manager');
      }
    } catch (error) {
      throw new Error(
        `Error fetching password from Secrets Manager: ${error.message}`,
      );
    }
  }
  return `mongodb://${DOCDB_USERNAME}:${encodeURIComponent(
    DOCDB_PASSWORD,
  )}@${DOCDB_CLUSTER}:27017/${DOCDB_DBNAME}?tls=true&retryWrites=false`;
};

const getCosmosDBConnectionString = () => {
  const {
    COSMOSDB_USERNAME,
    COSMOSDB_PASSWORD,
    COSMOSDB_CLUSTER,
    COSMOSDB_DBNAME,
  } = process.env;
  if (
    !COSMOSDB_USERNAME ||
    !COSMOSDB_PASSWORD ||
    !COSMOSDB_CLUSTER ||
    !COSMOSDB_DBNAME
  ) {
    throw new Error('Missing Azure Cosmos DB environment variables');
  }
  return `mongodb://${COSMOSDB_USERNAME}:${encodeURIComponent(
    COSMOSDB_PASSWORD,
  )}@${COSMOSDB_CLUSTER}.mongo.cosmos.azure.com:10255/${COSMOSDB_DBNAME}?ssl=true&replicaSet=globaldb&retryWrites=false&maxIdleTimeMS=120000&appName=@${COSMOSDB_USERNAME}@`;
};

export const getConnectionString = async () => {
  switch (databaseConnection) {
    case 'atlas':
      return getAtlasConnectionString();
    case 'documentdb':
      return await getDocumentDBConnectionString();
    case 'cosmosdb':
      return getCosmosDBConnectionString();
    default:
      return DB.url; // Default to local DB URL or other config
  }
};

const getConnectionOptions = () => {
  const baseOptions = {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 60000, // Optional: Increased timeout
  };

  if (databaseConnection === 'documentdb') {
    return {
      ...baseOptions,
      ssl: true,
      sslValidate: false,
      sslCA: path.resolve(__dirname, 'public', 'global-bundle.pem'),
    };
  }

  return baseOptions;
};

export const connectToDB = async () => {
  try {
    const { id: logId, time: logStart } = performanceTracker.log(
      'dbGettingConnected',
      'start',
    );
    const connectionString = await getConnectionString();
    const connectionOptions = getConnectionOptions();

    console.log('Connection options:', connectionOptions);

    const mongooseInstance = await mongoose.connect(
      connectionString,
      connectionOptions,
    );
    console.log('Database connected');
    performanceTracker.log('dbGettingConnected', 'end', logId, logStart);

    return mongooseInstance;
  } catch (error) {
    console.error('Error connecting to database:', error);
    throw error;
  }
};

export const mongooseInstance = mongoose;
