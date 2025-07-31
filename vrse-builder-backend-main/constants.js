import { config } from 'dotenv';
import fs from 'fs';

config();

const PORT = process.env.PORT || process.env.APP_PORT;
const DOMAIN = process.env.APP_DOMAIN;
const WEB_DOMAIN = process.env.WEB_DOMAIN;
const JWT_KEY = process.env.APP_JWT_KEY;
const JWT_KEY_FOR_INVITE = process.env.JWT_KEY_FOR_INVITE;
// const WEB_DOMAIN = process.env.WEB_DOMAIN;

const configData = fs.readFileSync('configuration.json');
export const CONF = JSON.parse(configData.toString());

const FEATURES = CONF.features;
// const DB = CONF.db;
let DB = { url: process.env.APP_DB };
if (process.env.NODE_ENV === 'production') {
  DB = {
    url: `mongodb://${process.env.MONGODB_USER}:${process.env.MONGODB_PASSWORD}@${process.env.MONGODB_HOST}:${process.env.MONGODB_PORT}/${process.env.MONGODB_DB_NAME}`,
  };
}
if (!(PORT && DOMAIN && JWT_KEY && DB && JWT_KEY_FOR_INVITE && WEB_DOMAIN)) {
  throw new Error('Unable to locate environment variables');
}

export { DB, DOMAIN, FEATURES, JWT_KEY, PORT, JWT_KEY_FOR_INVITE, WEB_DOMAIN };

export const HttpStatusCode = {
  OK: 200,
  BAD_REQUEST: 400,
  UNAUTHORISED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  REQUEST_TIMEOUT: 408,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
};
export const customLevels = {
  fatal: 60,
  error: 50,
  warn: 40,
  info: 30,
  record: 25, // Custom level
  debug: 20,
  trace: 10,
};

export const LOG_LEVELS = {
  emergency: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
  record: 5,
};

export const LOG_ACTIONS = {
  REGISTER: {
    name: 'register',
    type: { CLIENT: 'client', DOMAIN: 'domain', DEPARTMENT: 'department' },
  },
  LOGIN: {
    name: 'login',
    types: {
      DEVICE: 'device',
      DOMAIN: 'domain',
      TWO_FACTOR: 'two_factor',
      BASIC: 'basic_auth',
      DOMAIN_TOKEN: 'domain_token',
      DEMO: 'demo_login',
    },
  },
  UPDATE: { name: 'update', types: { PASSWORD_RESET: 'password_reset' } },
  DELETE: { name: 'delete', types: {} },
  GENERATE: { name: 'generate', types: { OTP: 'otp' } },
};
// registration types: [client, domain, department, ]
// login types: [device, domain, otp]
// update types: [password_reset, ]
// generate types: [otp]

export const ROLES = Object.freeze({
  PRODUCT_ADMIN: 'productAdmin',
  SUPER_ADMIN: 'superAdmin',
  ADMIN: 'admin',
  USER: 'user',
});

export const ZENDESK_CRED = {
  DOMAIN: 'autovrsehelp',
  EMAIL: 'support.enterprise@autovrse.in',
  API_TOKEN: process.env.ZENDESK_API_TOKEN,
  PROJECT_NAME_ID: 10501643959826,
  PRIORITY_ID: 10561366515218,
  TYPE_ID: 10200349952914,
  RAISE_REQUEST_URL: 'https://autovrsehelp.zendesk.com/api/v2/tickets.json',
};

export const AWS_S3_CRED = {
  ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
  SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
  REGION: process.env.AWS_REGION,
};

export const AZURE_BLOB_CRED = {
  ACCOUNT_NAME: process.env.AZURE_ACCOUNT_NAME,
  ACCOUNT_KEY: process.env.AZURE_ACCOUNT_KEY,
  CONTAINER_NAME: process.env.AZURE_CONTAINER_NAME,
};

//TODO: can be further optimised later with permission by screens + role + permission combo
export const PERMISSIONS = {
  productAdmin: [
    'delete_user',
    'delete_department',
    'delete_domain',
    'delete_evaluation',
    'delete_training',
    'delete_module',
  ],
  superAdmin: ['delete_user', 'delete_department', 'delete_domain'],
  admin: ['delete_user', 'delete_department'],
  user: [''],
};

export const AUTOVRSE_USER = {
  DOMAIN_PASSWORD: process.env.AUTOVRSE_DOMAIN_PASSWORD || 'werty',
  TRAINEE_PASSWORD: process.env.AUTOVRSE_TRAINEE_PASSWORD || 'autovrse@a24',
  DOMAIN_USERNAME: 'AutoVRse',
  DEPARTMENT_NAME: 'autovrse',
  TRAINEE_USERNAME: 'autovrse',
  TRAINEE_NAME: 'Autovrse Trainee',
  TRAINEE_EMAIL: 'autovrsetrainee@autovrse.com',
};

export const AUTOVRSE_GUEST_USER = {
  DOMAIN: 'AutoVRse Guest Domain',
  DEPARTMENT: 'AutoVRse Guest Dept',
  MODULE_ACCESS: CONF.freeModulesIndex,
};

export const DEMO_USER = {
  DOMAIN: 'Demo Domain',
  DOMAIN_PASSWORD: 'demoDomain',
  DEPARTMENT: 'Demo Department',
};

export const LRS_CREDENTIALS = {
  ENDPOINT: process.env.LRS_ENDPOINT,
  USERNAME: process.env.LRS_USERNAME,
  PASSWORD: process.env.LRS_PASSWORD,
};

export const STORAGE_CONFIG = {
  storageType: process.env.STORAGE_TYPE || 'local', // 's3' or 'local'
  s3: {
    connectUsingIAM: process.env.S3_CONNECT === 'true', // Connect via IAM if true
    evaluationBucket: process.env.S3_BUCKET_EVALUATION_NAME || '',
    trainingBucket: process.env.S3_BUCKET_TRAINING_NAME || '',
    imageBucket: process.env.S3_BUCKET_IMAGE_NAME || '',
    region: process.env.S3_REGION || '',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    // signatureVersion: 'v4',
  },
  local: {
    baseUploadPath: './uploads/',
  },
};

export const LDAP_CONFIG = {
  ldapServer: process.env.LDAP_SERVER, // LDAP server URL
  bindDN: process.env.LDAP_BIND_DN, // Distinguished Name (DN)
  bindPassword: process.env.LDAP_BIND_PASSWORD || 'your-secure-password', // Password for service account
  baseDN: process.env.LDAP_BASE_DN, // Base DN for the search
  tlsOptions: {
    rejectUnauthorized: process.env.REJECT_UNAUTHORIZED_LDAP === 'true', // SSL validation flag
  },
  searchOptions: {
    filterBySAMAccountName: (username) =>
      `(&(objectClass=user)(sAMAccountName=${username}))`, // Dynamic filter for username
    scope: process.env.LDAP_SCOPE, // Search the entire subtree
    attributes: ['CanonicalName', 'Department'], // Attributes to retrieve
  },
};
