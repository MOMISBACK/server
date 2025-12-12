const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'User',
  },
  title: {
    type: String,
    required: [true, 'Please add a title'],
    trim: true,
  },
  type: {
    type: String,
    required: [true, 'Please add an activity type'],
    enum: ['course', 'velo', 'natation', 'marche'],
  },
  duration: {
    type: Number,
    required: [true, 'Please add a duration in minutes'],
  },
  distance: {
    type: Number,
    required: false,
  },
  calories: {
    type: Number,
    required: false,
  },
  date: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Activity', activitySchema);
