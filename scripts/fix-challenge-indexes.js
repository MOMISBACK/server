// scripts/fix-challenge-indexes.js

const mongoose = require('mongoose');
require('dotenv').config();

async function fixChallengeIndexes() {
  try {
    // Connexion à MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/test';
    await mongoose.connect(mongoUri);
    console.log('✅ Connecté à MongoDB:', mongoUri);
    
    const db = mongoose.connection.db;
    const collection = db.collection('weeklychallenges');
    
    // 1. Lister les indexes existants
    console.log('\n📋 Indexes AVANT nettoyage:');
    const indexesBefore = await collection.indexes();
    indexesBefore.forEach(idx => {
      console.log(`  - ${idx.name}`, idx.key, idx.sparse ? '✓ sparse' : '');
    });
    
    // 2. Supprimer les anciens indexes problématiques
    const indexesToDrop = ['userId_1_startDate_1', 'user_1_startDate_1'];
    
    for (const indexName of indexesToDrop) {
      try {
        await collection.dropIndex(indexName);
        console.log(`\n✅ Index "${indexName}" supprimé`);
      } catch (err) {
        if (err.code === 27) {
          console.log(`\n⚠️  Index "${indexName}" n'existe pas (déjà supprimé)`);
        } else {
          console.error(`\n❌ Erreur lors de la suppression de "${indexName}":`, err.message);
        }
      }
    }
    
    // 3. Créer le nouvel index sparse
    try {
      await collection.createIndex(
        { user: 1, startDate: 1 },
        { 
          sparse: true,
          name: 'user_startDate_sparse'
        }
      );
      console.log('\n✅ Nouvel index sparse créé: user_startDate_sparse');
    } catch (err) {
      if (err.code === 85 || err.code === 86) {
        console.log('\n⚠️  Index user_startDate_sparse existe déjà');
      } else {
        throw err;
      }
    }
    
    // 4. Vérifier les autres indexes nécessaires
    const requiredIndexes = [
      { key: { creator: 1, createdAt: -1 }, name: 'creator_createdAt' },
      { key: { 'players.user': 1, status: 1 }, name: 'players_user_status' },
      { key: { status: 1, endDate: -1 }, name: 'status_endDate' }
    ];
    
    for (const index of requiredIndexes) {
      try {
        await collection.createIndex(index.key, { name: index.name });
        console.log(`✅ Index "${index.name}" vérifié/créé`);
      } catch (err) {
        if (err.code === 85 || err.code === 86) {
          console.log(`⚠️  Index "${index.name}" existe déjà`);
        } else {
          console.error(`❌ Erreur index "${index.name}":`, err.message);
        }
      }
    }
    
    // 5. Lister les indexes finaux
    console.log('\n📋 Indexes APRÈS migration:');
    const indexesAfter = await collection.indexes();
    indexesAfter.forEach(idx => {
      const sparseFlag = idx.sparse ? ' ✓ sparse' : '';
      console.log(`  - ${idx.name}:`, JSON.stringify(idx.key), sparseFlag);
    });
    
    // 6. Statistiques
    const totalDocs = await collection.countDocuments();
    const duoDocs = await collection.countDocuments({ mode: 'duo' });
    const soloDocs = await collection.countDocuments({ mode: 'solo' });
    const nullUserDocs = await collection.countDocuments({ user: null });
    
    console.log('\n📊 Statistiques:');
    console.log(`  - Total challenges: ${totalDocs}`);
    console.log(`  - SOLO: ${soloDocs}`);
    console.log(`  - DUO: ${duoDocs}`);
    console.log(`  - Documents avec user=null: ${nullUserDocs}`);
    
    console.log('\n✅ Migration des indexes terminée avec succès !');
    
  } catch (error) {
    console.error('\n❌ Erreur lors de la migration:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Déconnecté de MongoDB');
  }
}

// Exécution
fixChallengeIndexes();