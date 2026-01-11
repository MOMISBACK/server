// server/models/WeeklyChallenge.js

const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Optional per-player goal value override (supports asymmetrical DUO goals)
  goalValue: {
    type: Number,
    default: null,
    min: 0.1,
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
  },
  completedAt: {
    type: Date,
    default: null
  },
  // Optional detailed breakdown for multi-goal pacts (distance/duration/count)
  multiGoalProgress: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  }
}, { _id: false });

const stakeEntrySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ['held', 'refunded', 'burned', 'paid'],
      default: 'held',
      index: true,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
    // Optional settlement details (supports partial refunds and custom payouts)
    refundedAmount: {
      type: Number,
      min: 0,
      default: null,
    },
    burnedAmount: {
      type: Number,
      min: 0,
      default: null,
    },
    paidAmount: {
      type: Number,
      min: 0,
      default: null,
    },
  },
  { _id: false }
);

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
      enum: ['distance', 'duration', 'count', 'effort_points'],
      required: true
    },
    value: {
      type: Number,
      required: true,
      min: 0.1
    }
  },

  // Multi-objectives (visible to user): can combine distance/duration/count.
  // When present, overall completion requires ALL provided sub-goals.
  multiGoals: {
    distance: { type: Number, min: 0, default: null },
    duration: { type: Number, min: 0, default: null },
    count: { type: Number, min: 0, default: null },
  },

  // Pact ruleset selector (keeps logic explicit and avoids exposing effort_points as a UI goal).
  pactRules: {
    type: String,
    enum: ['none', 'progression_7d_v1'],
    default: 'none',
    index: true,
  },
  
  activityTypes: {
    type: [String],
    required: true,
    enum: ['running', 'cycling', 'walking', 'swimming', 'workout'],
    validate: {
      validator: function(v) {
        return v.length > 0;
      },
      message: 'Au moins un type d\'activité requis'
    }
  },
  
  // Custom title (optional, overrides auto-generated title)
  customTitle: {
    type: String,
    trim: true,
    maxlength: 100,
    default: null
  },
  
  // Per-activity-type goals (optional, for multi-activity challenges)
  // Format: { running: { type: 'distance', value: 10 }, workout: { type: 'count', value: 3 } }
  perActivityGoals: {
    type: Map,
    of: {
      type: {
        type: String,
        enum: ['distance', 'duration', 'count', 'reps']
      },
      value: {
        type: Number,
        min: 0
      }
    },
    default: null
  },

  // Per-player per-activity-type goals (optional, for asymmetrical DUO goals)
  // Format:
  // {
  //   "<userIdA>": { running: { type: 'distance', value: 10 }, workout: { type: 'count', value: 3 } },
  //   "<userIdB>": { running: { type: 'distance', value: 5 },  workout: { type: 'count', value: 1 } }
  // }
  // Stored as Mixed; validated/sanitized in the service layer.
  perPlayerActivityGoals: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
  
  // Week tracking for yearly progress (ISO week number)
  weekNumber: {
    type: Number,
    min: 1,
    max: 53,
    default: null,
    index: true
  },
  
  // Year of the challenge (for yearly progress tracking)
  year: {
    type: Number,
    default: null,
    index: true
  },

  // Auto-renewal configuration
  recurrence: {
    enabled: {
      type: Boolean,
      default: false
    },
    // null = infinite (until abandoned)
    weeksCount: {
      type: Number,
      min: 1,
      max: 52,
      default: null
    },
    weeksCompleted: {
      type: Number,
      default: 0
    },
    parentChallengeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WeeklyChallenge',
      default: null
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
    required: function() {
      return ['active', 'completed', 'failed'].includes(this.status);
    }
  },
  
  endDate: {
    type: Date,
    required: function() {
      return ['active', 'completed', 'failed'].includes(this.status);
    },
    validate: {
      validator: function(v) {
        if (!v || !this.startDate) return true;
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

  // ✅ DUO invitation agreement / counter-proposals
  // A "proposal" is the current challenge config while status=pending.
  // Any edit bumps the version and requires both players to sign again.
  invitationVersion: {
    type: Number,
    default: 1,
    min: 1,
  },
  // Map of userId -> signedAt for the current version
  invitationSignatures: {
    type: Map,
    of: Date,
    default: {},
  },

  // 💎 Stake system (diamonds as a bet)
  stakePerPlayer: {
    type: Number,
    default: 10,
    min: 0,
  },
  stakes: {
    type: [stakeEntrySchema],
    default: [],
  },
  settlement: {
    status: {
      type: String,
      enum: ['none', 'success', 'loss', 'cancelled'],
      default: 'none',
      index: true,
    },
    reason: {
      type: String,
      enum: ['completed', 'expired', 'cancelled', 'refused'],
      default: null,
    },
    settledAt: {
      type: Date,
      default: null,
    },
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

// Index for yearly progress queries
weeklyChallengeSchema.index({ 
  'players.user': 1, 
  year: 1, 
  weekNumber: 1,
  status: 1 
});

// ✅ Virtuals
weeklyChallengeSchema.virtual('progress').get(function() {
  const hasMultiGoals = Boolean(
    this?.multiGoals &&
    (Number(this.multiGoals.distance) > 0 || Number(this.multiGoals.duration) > 0 || Number(this.multiGoals.count) > 0)
  );

  const computePct = (player) => {
    if (!hasMultiGoals) return null;
    const mg = this.multiGoals || {};
    const ratios = [];
    if (Number(mg.distance) > 0) ratios.push((Number(player.progress) || 0) / 100);
    if (Number(mg.duration) > 0) ratios.push((Number(player.progress) || 0) / 100);
    if (Number(mg.count) > 0) ratios.push((Number(player.progress) || 0) / 100);
    if (!ratios.length) return null;
    const pct = Math.max(0, Math.min(100, Number(player.progress) || 0));
    return pct;
  };

  if (this.mode === 'solo' && this.players.length > 0) {
    const player = this.players[0];
    if (hasMultiGoals) {
      const pct = computePct(player);
      return {
        current: Number.isFinite(Number(pct)) ? pct : (player.progress || 0),
        goal: 100,
        percentage: Number.isFinite(Number(pct)) ? pct : 0,
        isCompleted: player.completed
      };
    }
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
      if (hasMultiGoals) {
        const pct = computePct(creatorPlayer);
        return {
          current: Number.isFinite(Number(pct)) ? pct : (creatorPlayer.progress || 0),
          goal: 100,
          percentage: Number.isFinite(Number(pct)) ? pct : 0,
          isCompleted: creatorPlayer.completed
        };
      }
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

  const hasMultiGoals = Boolean(
    this?.multiGoals &&
    (Number(this.multiGoals.distance) > 0 || Number(this.multiGoals.duration) > 0 || Number(this.multiGoals.count) > 0)
  );

  if (hasMultiGoals) {
    const pct = Math.max(0, Math.min(100, Number(player.progress) || 0));
    return {
      current: pct,
      goal: 100,
      percentage: pct,
      isCompleted: player.completed,
      diamonds: player.diamonds
    };
  }
  
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
  // Legacy method kept for backward compatibility.
  // Diamonds are now handled via the stake/settlement system in the service layer.
  return false;
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