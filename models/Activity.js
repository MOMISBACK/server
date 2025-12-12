const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  type: {
    type: String,
  },
  distance: {
    type: Number,
  },
  duration: {
    type: Number,
  },
  date: {
    type: Date,
  },
});

const Activity = mongoose.model('Activity', activitySchema);

module.exports = Activity;
