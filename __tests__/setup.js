const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env.test') }); // ⚠️ IMPORTANT : Avant tout

const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

let mongoServer;

beforeAll(async () => {
  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }

    mongoServer = await MongoMemoryReplSet.create({
      binary: {
        // 6.0.9 peut échouer à spawn sur certaines machines (ex: macOS arm64).
        // On laisse une version configurable + fallback récent.
        version: process.env.MONGOMS_VERSION || '7.0.14',
        downloadDir: path.resolve(__dirname, '..', 'mongodb-binaries'),
      },
      replSet: {
        count: 1,
        dbName: 'test',
      },
      instanceOpts: [
        {
          port: 27018,
        },
      ],
    });

    const mongoUri = mongoServer.getUri();
    console.log('🔗 MongoDB Test URI:', mongoUri);

    await mongoose.connect(mongoUri);

    console.log('✅ Test DB connectée');
  } catch (error) {
    console.error('❌ Erreur connexion Test DB:', error.message);
    throw error;
  }
});

afterEach(async () => {
  if (mongoose.connection.readyState === 1) {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany();
    }
  }
});

afterAll(async () => {
  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    if (mongoServer) {
      await mongoServer.stop();
    }
    console.log('✅ Test DB déconnectée');
  } catch (error) {
    console.error('❌ Erreur déconnexion:', error.message);
  }
});

jest.setTimeout(60000);
