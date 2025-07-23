const mongoose = require('mongoose');
const matchSchema = new mongoose.Schema({
  sport: {
    type: String,
    required: [true, 'A match must have a sport'],
    trim: true
  },
  homeTeam: {
    type: String,
    required: [true, 'A match must have a home team'],
    trim: true
  },
  awayTeam: {
    type: String,
    required: [true, 'A match must have an away team'],
    trim: true
  },
  score: {
    type: String,
    default: 'N/A'
  },
  status: {
    type: String,
    enum: ['Live', 'Scheduled', 'Finished', 'Postponed'],
    default: 'Scheduled'
  },
  streamUrl: {
    type: String,
    required: [true, 'A match must have a stream URL'],
    trim: true
  },
  matchDate: {
    type: Date,
    default: Date.now
  },
  league: String,
  venue: String,
  externalId: {
    type: String,
    unique: true
  }
}, { timestamps: true }); 

const Match = mongoose.model('Match', matchSchema);

module.exports = Match;
