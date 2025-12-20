// server/routes/adminRoutes.js

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Route pour nettoyer les indexes problématiques
router.get('/fix-indexes', async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const collection = db.collection('weeklychallenges');

    const results = {
      databaseName: db.databaseName,
      before: [],
      dropped: [],
      created: [],
      after: []
    };

    // 1. Indexes avant
    results.before = await collection.indexes();
    console.log('📋 Database:', results.databaseName);
    console.log('📋 Indexes avant:', results.before.map(i => i.name));

    // 2. Supprimer les anciens index problématiques
    const toDrop = ['userId_1_startDate_1', 'user_1_startDate_1', 'user_1_startDate_-1'];
    for (const indexName of toDrop) {
      try {
        await collection.dropIndex(indexName);
        results.dropped.push(indexName);
        console.log(`✅ Supprimé: ${indexName}`);
      } catch (err) {
        console.log(`⚠️ Index ${indexName} n'existe pas`);
      }
    }

    // 3. Créer le nouveau index sparse
    try {
      await collection.createIndex(
        { user: 1, startDate: 1 },
        { sparse: true, name: 'user_startDate_sparse' }
      );
      results.created.push('user_startDate_sparse');
      console.log('✅ Créé: user_startDate_sparse');
    } catch (err) {
      console.log('⚠️ Index sparse déjà existant');
    }

    // 4. Indexes après
    results.after = await collection.indexes();
    console.log('📋 Indexes après:', results.after.map(i => i.name));

    res.json({
      success: true,
      message: '✅ Indexes mis à jour avec succès',
      database: results.databaseName,
      indexesDropped: results.dropped,
      indexesCreated: results.created,
      finalIndexes: results.after.map(i => ({ 
        name: i.name, 
        keys: i.key, 
        sparse: i.sparse || false 
      }))
    });

  } catch (error) {
    console.error('❌ Erreur fix-indexes:', error);
    res.status(500).json({ 
      success: false,
      error: error.message
    });
  }
});

module.exports = router;