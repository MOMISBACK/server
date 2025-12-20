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
    default: 0
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
    required: true
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
    enum: ['running', 'cycling', 'walking', 'swimming', 'yoga', 'workout']
  },
  
  // Métadonnées
  title: {
    type: String,
    required: true
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
    required: true
  },
  
  // État du challenge
  status: {
    type: String,
    enum: ['pending', 'active', 'completed', 'failed', 'cancelled'],
    default: 'active'
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
  }
}, {
  timestamps: true
});

// Index pour performances
weeklyChallengeSchema.index({ creator: 1, createdAt: -1 });
weeklyChallengeSchema.index({ 'players.user': 1, status: 1 });
weeklyChallengeSchema.index({ status: 1, endDate: -1 });

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
    const creatorPlayer = this.players.find(p => p.user.toString() === this.creator.toString());
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

// ✅ Méthode : vérifier si le bonus est débloqué (DUO)
weeklyChallengeSchema.methods.checkBonus = function() {
  if (this.mode !== 'duo') return false;
  if (this.players.length !== 2) return false;
  
  const allCompleted = this.players.every(p => p.completed);
  return allCompleted;
};

// ✅ Méthode : attribuer le bonus (doubler les diamants)
weeklyChallengeSchema.methods.awardBonus = async function() {
  if (this.bonusAwarded) return; // Déjà attribué
  if (!this.checkBonus()) return; // Pas débloqué
  
  const User = mongoose.model('User');
  
  // Doubler les diamants de chaque joueur
  for (const player of this.players) {
    await User.findByIdAndUpdate(
      player.user,
      { $inc: { totalDiamonds: player.diamonds } } // Ajoute les diamants une 2ème fois
    );
  }
  
  this.bonusEarned = true;
  this.bonusAwarded = true;
  this.status = 'completed';
  await this.save();
  
  console.log('🎉 Bonus attribué ! Diamants doublés pour les 2 joueurs');
};

// ✅ Hook pre-save : auto-calculer bonusEarned
weeklyChallengeSchema.pre('save', function() {
  if (this.mode === 'duo' && !this.bonusAwarded) {
    this.bonusEarned = this.checkBonus();
  }
});

// Configurer toJSON pour inclure les virtuals
weeklyChallengeSchema.set('toJSON', { virtuals: true });
weeklyChallengeSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('WeeklyChallenge', weeklyChallengeSchema);