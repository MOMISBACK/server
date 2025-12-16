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
    maxlength: [100, 'Title cannot be more than 100 characters'],
  },
  type: {
    type: String,
    required: [true, 'Please add an activity type'],
    enum: ['course', 'velo', 'natation', 'marche'],
  },
  duration: {
    type: Number,
    required: [true, 'Please add a duration in minutes'],
    min: [0, 'Duration must be a positive number'],
  },
  distance: {
    type: Number,
    required: false,
    min: [0, 'Distance must be a positive number'],
  },
  calories: {
    type: Number,
    required: false,
    min: [0, 'Calories must be a positive number'],
  },
  date: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Activity', activitySchema);
