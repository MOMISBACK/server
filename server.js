// server/server.js

const app = require('./app');
const connectDB = require('./config/db');

const port = process.env.PORT || 5000;

// Connect to database
connectDB();

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