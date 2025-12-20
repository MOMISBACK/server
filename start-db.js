const { MongoMemoryServer } = require('mongodb-memory-server');

async function startDb() {
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  console.log(`MongoDB Memory Server running at: ${uri}`);
  // Keep the script running
  setInterval(() => {}, 1000 * 60 * 60);
}

startDb();
