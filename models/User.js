// server/models/User.js

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  // Pseudo affiché partout. Optionnel pour ne pas casser les comptes existants,
  // mais requis à l'inscription via validation côté route/controller.
  username: {
    type: String,
    lowercase: true,
    trim: true,
    minlength: [3, 'Pseudo trop court (min 3)'],
    maxlength: [20, 'Pseudo trop long (max 20)'],
    match: [/^[a-z0-9_]+$/i, 'Pseudo invalide (a-z, 0-9, _)'],
  },
  email: {
    type: String,
    required: [true, 'Email requis'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Email invalide']
  },
  password: {
    type: String,
    required: [true, 'Mot de passe requis'],
    minlength: 6,
  },
  // ✅ AJOUTÉ : Système de diamants
  totalDiamonds: {
    type: Number,
    default: 0,
    min: 0
  },
  // ✅ Partner links (up to 2 slots: p1, p2)
  partnerLinks: [
    {
      slot: {
        type: String,
        enum: ['p1', 'p2'],
        required: true,
      },
      partnerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      status: {
        type: String,
        enum: ['pending', 'confirmed'],
        default: 'confirmed',
      },
    },
  ],
  // ✅ Active slot for current session ('p1', 'p2', or 'solo')
  activeSlot: {
    type: String,
    enum: ['p1', 'p2', 'solo'],
    default: 'solo',
  },
  // ✅ Whether the user has explicitly chosen a slot at least once
  // Used to force the partner-selection screen only on first-time setup.
  hasSelectedSlot: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true
});

// Unique, but sparse so existing users without username don't violate the index.
userSchema.index({ username: 1 }, { unique: true, sparse: true });

// Hash le mot de passe avant sauvegarde
userSchema.pre('save', async function () {
  if (!this.isModified('password')) {
    return;
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Méthode pour comparer les mots de passe
userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);