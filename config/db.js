const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const uri =
      process.env.NODE_ENV === 'test'
        ? process.env.MONGO_URI_TEST
        : process.env.MONGO_URI;

    if (!uri) {
      throw new Error('MongoDB URI not defined for this environment');
    }

    const conn = await mongoose.connect(uri);

    console.log(`MongoDB Connected (${process.env.NODE_ENV}): ${conn.connection.host}`);

    // ✅ Supprimer l'ancien index problématique sur WeeklyChallenge
    const db = mongoose.connection.db;
    const collection = db.collection('weeklychallenges');
    
    try {
      const indexes = await collection.getIndexes();
      
      // Chercher et supprimer l'index userId_1_startDate_1 (l'ancien sans sparse)
      for (const [indexName, indexSpec] of Object.entries(indexes)) {
        if (indexName === 'userId_1_startDate_1') {
          console.log('🗑️  Suppression de l\'ancien index userId_1_startDate_1...');
          await collection.dropIndex(indexName);
          console.log('✅ Ancien index supprimé');
        }
      }
    } catch (indexError) {
      console.log('ℹ️  Pas d\'ancien index trouvé, c\'est normal.');
    }

  } catch (error) {
    console.error(`MongoDB connection error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
