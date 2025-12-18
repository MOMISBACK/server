const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;

// Exécuté avant le lancement de tous les tests
beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);
});

// Exécuté après la fin de tous les tests
afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

// La logique de nettoyage est maintenant gérée dans le `beforeEach` de chaque
// fichier de test spécifique (ex: activity.test.js) pour plus de clarté
// et pour éviter les problèmes de redondance.
