const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/db');
const { errorHandler } = require('./middleware/errorMiddleware');

// Configuration des variables d'environnement
dotenv.config();

// Connexion à la base de données
connectDB().catch((err) => {
  console.error('❌ Erreur de connexion à la base de données:', err);
  process.exit(1);
});

const app = express();
const port = process.env.PORT || 3000;

// ⭐ AJOUTE CETTE LIGNE ICI (pour Render/Proxy)
app.set('trust proxy', 1);

// ===== MIDDLEWARES DE SÉCURITÉ =====

// Protection des en-têtes HTTP
app.use(helmet());

// Configuration CORS
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
  optionsSuccessStatus: 200
}));

// Limitation du taux de requêtes (anti-spam/DDoS)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requêtes max par IP
  message: 'Trop de requêtes, veuillez réessayer plus tard.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// ===== MIDDLEWARES GÉNÉRAUX =====

// Parsing JSON avec limite de taille
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logger les requêtes (dev uniquement)
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// ===== ROUTES =====

// Route de santé/test
app.get('/', (req, res) => {
  res.json({ 
    message: 'API Running 🚀',
    version: '1.0.0',
    status: 'OK'
  });
});

// Routes API
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/activities', require('./routes/activityRoutes'));
app.use('/api/challenges', require('./routes/challengeRoutes'));

// ===== GESTION D'ERREURS =====

// Route 404 - Non trouvée
app.use((req, res, next) => {
  res.status(404).json({ 
    success: false,
    message: `Route ${req.originalUrl} non trouvée` 
  });
});

// Middleware de gestion d'erreurs global
app.use(errorHandler);

// ===== DÉMARRAGE DU SERVEUR =====

const server = app.listen(port, () => {
  console.log(`✅ Serveur démarré sur le port ${port}`);
  console.log(`🌍 Environnement: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 URL: http://localhost:${port}`);
});

// Gestion de l'arrêt gracieux
process.on('SIGTERM', () => {
  console.log('👋 SIGTERM reçu, fermeture du serveur...');
  server.close(() => {