const path = require('path');
const dotenv = require('dotenv');
const { MongoClient } = require('mongodb');

dotenv.config();

if (!process.env.MONGODB_URI) {
  dotenv.config({ path: path.resolve(__dirname, '../../../CandidateBackend/.env') });
}

const MONGODB_URI = process.env.MONGODB_URI || '';
const DB_NAME = process.env.MONGODB_DB_NAME || 'kareergrowth';

let client = null;
let db = null;

const COLLECTIONS = {
  RESUME_TEMPLATES: 'sql',
  RESUME_REPORTS: 'candidatesresumereport'
};

async function connect() {
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI is not set in SuperadminBackend environment');
  }
  if (client) return client;
  client = new MongoClient(MONGODB_URI);
  await client.connect();
  db = client.db(DB_NAME);
  return client;
}

async function getDb() {
  if (!db) await connect();
  return db;
}

async function getCollection(name) {
  const database = await getDb();
  return database.collection(name);
}

module.exports = {
  connect,
  getDb,
  getCollection,
  COLLECTIONS,
  DB_NAME
};
