// server/models/WeeklyChallenge.js

const mongoose = require('mongoose');

// ✅ Sous-schéma pour un joueur dans le challenge
const playerSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  progress: {
    type: Number,
    default: 0,
    min: 0  // ✅ AJOUTÉ : Pas de progression négative
  },
  diamonds: {
    type: Number,
    default: 0,
    min: 0
  },
  completed: {
    type: Boolean,
    default: false
  }
}, { _id: false });

// ✅ Schéma principal du challenge (compatible SOLO + DUO)
const weeklyChallengeSchema = new mongoose.Schema({
  // Mode du challenge
  mode: {
    type: String,
    enum: ['solo', 'duo'],
    required: true,
    default: 'solo'
  },
  
  // Créateur du challenge
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true  // ✅ AJOUTÉ : Index explicite pour requêtes
  },
  
  // Joueurs (1 pour solo, 2 pour duo)
  players: {
    type: [playerSchema],
    required: true,
    validate: {
      validator: function(v) {
        if (this.mode === 'solo') return v.length === 1;
        if (this.mode === 'duo') return v.length === 2;
        return false;
      },
      message: 'Nombre de joueurs invalide pour le mode sélectionné'
    }
  },
  
  // Objectif unique
  goal: {
    type: {
      type: String,
      enum: ['distance', 'duration', 'count'],
      required: true
    },
    value: {
      type: Number,
      required: true,
      min: 0.1
    }
  },
  
  // Types d'activités concernées
  activityTypes: {
    type: [String],
    required: true,
    enum: ['running', 'cycling', 'walking', 'swimming', 'yoga', 'workout'],
    validate: {
      validator: function(v) {
        return v.length > 0;  // ✅ AJOUTÉ : Au moins un type d'activité
      },
      message: 'Au moins un type d\'activité requis'
    }
  },
  
  // Métadonnées
  title: {
    type: String,
    required: true,
    trim: true,  // ✅ AJOUTÉ : Supprime espaces inutiles
    maxlength: 100  // ✅ AJOUTÉ : Limite raisonnable
  },
  
  icon: {
    type: String,
    default: 'trophy-outline'
  },
  
  // Période
  startDate: {
    type: Date,
    required: true
  },
  
  endDate: {
    type: Date,
    required: true,
    validate: {
      validator: function(v) {
        return v > this.startDate;  // ✅ AJOUTÉ : endDate > startDate
      },
      message: 'La date de fin doit être après la date de début'
    }
  },
  
  // État du challenge
  status: {
    type: String,
    enum: ['pending', 'active', 'completed', 'failed', 'cancelled'],
    default: 'active',
    index: true  // ✅ AJOUTÉ : Index pour requêtes status
  },
  
  // ✅ Bonus (pour DUO uniquement)
  bonusEarned: {
    type: Boolean,
    default: false
  },
  
  bonusAwarded: {
    type: Boolean,
    default: false
  },
  
  // ✅ Pour mode DUO : système d'invitation
  invitationStatus: {
    type: String,
    enum: ['none', 'pending', 'accepted', 'refused'],
    default: 'none'
  },
  
  // ✅ COMPATIBILITÉ : Garder "user" pour les anciens challenges SOLO
 user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
    // PAS de sparse ici
  }
}, {
  timestamps: true
});

// ✅ CORRECT: sparse sur l'INDEX
weeklyChallengeSchema.index(
  { user: 1, startDate: 1 }, 
  { 
    sparse: true,  // ← ICI est le bon endroit !
    name: 'user_startDate_sparse'
  }
);

// ✅ AMÉLIORÉ : Index composites pour performances
weeklyChallengeSchema.index({ creator: 1, createdAt: -1 });
weeklyChallengeSchema.index({ 'players.user': 1, status: 1 });
weeklyChallengeSchema.index({ status: 1, endDate: -1 });
weeklyChallengeSchema.index({ user: 1, startDate: 1 }, { sparse: true });

// ✅ NEW: Index pour requêtes d'invitations
weeklyChallengeSchema.index({ 
  mode: 1, 
  status: 1, 
  invitationStatus: 1, 
  endDate: 1 
});

// ✅ NEW: Index pour cleanup CRON (challenges expirés)
weeklyChallengeSchema.index({ 
  status: 1, 
  endDate: 1, 
  updatedAt: 1 
});

// ✅ Méthode virtuelle : progression (rétrocompatibilité frontend SOLO)
weeklyChallengeSchema.virtual('progress').get(function() {
  if (this.mode === 'solo' && this.players.length > 0) {
    const player = this.players[0];
    return {
      current: player.progress,
      goal: this.goal.value,
      percentage: Math.min((player.progress / this.goal.value) * 100, 100),
      isCompleted: player.completed
    };
  }
  
  // Pour DUO : retourne la progression du créateur par défaut
  if (this.mode === 'duo') {
    const creatorPlayer = this.players.find(p => 
      p.user.toString() === this.creator.toString()
    );
    if (creatorPlayer) {
      return {
        current: creatorPlayer.progress,
        goal: this.goal.value,
        percentage: Math.min((creatorPlayer.progress / this.goal.value) * 100, 100),
        isCompleted: creatorPlayer.completed
      };
    }
  }
  
  return null;
});

// ✅ NEW: Méthode pour obtenir progression d'un joueur spécifique
weeklyChallengeSchema.methods.getPlayerProgress = function(userId) {
  const player = this.players.find(p => p.user.toString() === userId.toString());
  if (!player) return null;
  
  return {
    current: player.progress,
    goal: this.goal.value,
    percentage: Math.min((player.progress / this.goal.value) * 100, 100),
    isCompleted: player.completed,
    diamonds: player.diamonds
  };
};

// ✅ Méthode : vérifier si le bonus est débloqué (DUO)
weeklyChallengeSchema.methods.checkBonus = function() {
  if (this.mode !== 'duo') return false;
  if (this.players.length !== 2) return false;
  
  const allCompleted = this.players.every(p => p.completed);
  return allCompleted;
};

// ✅ AMÉLIORÉ : Méthode : attribuer le bonus (doubler les diamants)
weeklyChallengeSchema.methods.awardBonus = async function() {
  if (this.bonusAwarded) {
    console.log('⚠️ Bonus déjà attribué pour ce challenge');
    return false;
  }
  
  if (!this.checkBonus()) {
    console.log('⚠️ Bonus non débloqué (tous les joueurs doivent compléter)');
    return false;
  }
  
  const User = mongoose.model('User');
  
  console.log('🎁 Attribution du bonus DUO...');
  
  // Doubler les diamants de chaque joueur
  for (const player of this.players) {
    const playerId = typeof player.user === 'string' 
      ? player.user 
      : player.user._id || player.user;
    
    const result = await User.findByIdAndUpdate(
      playerId,
      { $inc: { totalDiamonds: player.diamonds } }, // Ajoute les diamants une 2ème fois
      { new: true }
    );
    
    if (result) {
      console.log(`💎 Bonus +${player.diamonds} diamants → User ${playerId}`);
    }
  }
  
  this.bonusEarned = true;
  this.bonusAwarded = true;
  
  // ✅ AJOUTÉ : Ne changer status que si pas déjà completed
  if (this.status !== 'completed') {
    this.status = 'completed';
  }
  
  await this.save();
  
  console.log('✅ Bonus DUO attribué ! Diamants doublés pour les 2 joueurs');
  return true;
};

// ✅ NEW: Méthode pour vérifier si challenge est expiré
weeklyChallengeSchema.methods.isExpired = function() {
  return new Date() > this.endDate;
};

// ✅ NEW: Méthode pour vérifier si un user participe
weeklyChallengeSchema.methods.hasPlayer = function(userId) {
  return this.players.some(p => p.user.toString() === userId.toString());
};

// ✅ Hook pre-save : auto-calculer bonusEarned
weeklyChallengeSchema.pre('save', function(next) {
  if (this.mode === 'duo' && !this.bonusAwarded) {
    this.bonusEarned = this.checkBonus();
  }
  
  // ✅ NEW: Valider cohérence status/invitationStatus
  if (this.mode === 'duo' && this.status === 'pending' && this.invitationStatus === 'none') {
    this.invitationStatus = 'pending';
  }
  
  next();
});

// ✅ NEW: Hook post-save logging
weeklyChallengeSchema.post('save', function(doc) {
  console.log(`💾 Challenge ${doc._id} sauvegardé - Status: ${doc.status}, Mode: ${doc.mode}`);
});

// Configurer toJSON pour inclure les virtuals
weeklyChallengeSchema.set('toJSON', { virtuals: true });
weeklyChallengeSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('WeeklyChallenge', weeklyChallengeSchema);