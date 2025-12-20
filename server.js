// server/server.js

const app = require('./app');
const connectDB = require('./config/db');
const challengeCron = require('./jobs/challengeCron');  // ✅ AJOUTÉ

const port = process.env.PORT || 5000;

// ✅ Fonction async pour gérer la connexion DB + CRON
const startServer = async () => {
  try {
    // Connect to database
    await connectDB();
    
    // ✅ DÉMARRER LES CRON JOBS
    challengeCron.startAll();
    
    // Démarrer le serveur
    const server = app.listen(port, () => {
      console.log(`✅ Serveur démarré sur le port ${port}`);
      console.log(`🌍 Environnement: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔗 URL: http://localhost:${port}`);
    });

    // Gestion arrêt propre
    process.on('SIGTERM', () => {
      console.log('SIGTERM reçu, arrêt du serveur...');
      server.close(() => {
        console.log('Serveur arrêté');
        process.exit(0);
      });
    });

    module.exports = server;
    
  } catch (error) {
    console.error('❌ Erreur démarrage serveur:', error);
    process.exit(1);
  }
};

// Lancer le serveur
startServer();