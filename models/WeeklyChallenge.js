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
    min: 0
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

// ✅ Schéma principal du challenge
const weeklyChallengeSchema = new mongoose.Schema({
  mode: {
    type: String,
    enum: ['solo', 'duo'],
    required: true,
    default: 'solo'
  },
  
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
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
  
  activityTypes: {
    type: [String],
    required: true,
    enum: ['running', 'cycling', 'walking', 'swimming', 'yoga', 'workout'],
    validate: {
      validator: function(v) {
        return v.length > 0;
      },
      message: 'Au moins un type d\'activité requis'
    }
  },
  
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  
  icon: {
    type: String,
    default: 'trophy-outline'
  },
  
  startDate: {
    type: Date,
    required: true
  },
  
  endDate: {
    type: Date,
    required: true,
    validate: {
      validator: function(v) {
        return v > this.startDate;
      },
      message: 'La date de fin doit être après la date de début'
    }
  },
  
  status: {
    type: String,
    enum: ['pending', 'active', 'completed', 'failed', 'cancelled'],
    default: 'active',
    index: true
  },
  
  bonusEarned: {
    type: Boolean,
    default: false
  },
  
  bonusAwarded: {
    type: Boolean,
    default: false
  },
  
  invitationStatus: {
    type: String,
    enum: ['none', 'pending', 'accepted', 'refused'],
    default: 'none'
  },
  
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// ✅ Indexes
weeklyChallengeSchema.index(
  { user: 1, startDate: 1 }, 
  { sparse: true, name: 'user_startDate_sparse' }
);
weeklyChallengeSchema.index({ creator: 1, createdAt: -1 });
weeklyChallengeSchema.index({ 'players.user': 1, status: 1 });
weeklyChallengeSchema.index({ status: 1, endDate: -1 });
weeklyChallengeSchema.index({ 
  mode: 1, 
  status: 1, 
  invitationStatus: 1, 
  endDate: 1 
});
weeklyChallengeSchema.index({ 
  status: 1, 
  endDate: 1, 
  updatedAt: 1 
});

// ✅ Virtuals
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

// ✅ Methods
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

weeklyChallengeSchema.methods.checkBonus = function() {
  if (this.mode !== 'duo') return false;
  if (this.players.length !== 2) return false;
  
  const allCompleted = this.players.every(p => p.completed);
  return allCompleted;
};

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
  
  for (const player of this.players) {
    const playerId = typeof player.user === 'string' 
      ? player.user 
      : player.user._id || player.user;
    
    const result = await User.findByIdAndUpdate(
      playerId,
      { $inc: { totalDiamonds: player.diamonds } },
      { new: true }
    );
    
    if (result) {
      console.log(`💎 Bonus +${player.diamonds} diamants → User ${playerId}`);
    }
  }
  
  this.bonusEarned = true;
  this.bonusAwarded = true;
  
  if (this.status !== 'completed') {
    this.status = 'completed';
  }
  
  await this.save();
  
  console.log('✅ Bonus DUO attribué ! Diamants doublés pour les 2 joueurs');
  return true;
};

weeklyChallengeSchema.methods.isExpired = function() {
  return new Date() > this.endDate;
};

weeklyChallengeSchema.methods.hasPlayer = function(userId) {
  return this.players.some(p => p.user.toString() === userId.toString());
};

// ✅ Hook pre-save (sans next)
weeklyChallengeSchema.pre('save', function() {
  if (this.mode === 'duo' && !this.bonusAwarded) {
    this.bonusEarned = this.checkBonus();
  }
  
  if (this.mode === 'duo' && this.status === 'pending' && this.invitationStatus === 'none') {
    this.invitationStatus = 'pending';
  }
});

// ✅ Hook post-save
weeklyChallengeSchema.post('save', function(doc) {
  console.log(`💾 Challenge ${doc._id} sauvegardé - Status: ${doc.status}, Mode: ${doc.mode}`);
});

// Configurer toJSON
weeklyChallengeSchema.set('toJSON', { virtuals: true });
weeklyChallengeSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('WeeklyChallenge', weeklyChallengeSchema);