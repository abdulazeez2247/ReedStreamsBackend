const express = require('express');
const router = express.Router();

const {
  getLiveStats,
  getStreamsPerDay,
  getMostStreamedSports,
  getLiveMatchesBySport
} = require('../controllers/dashboardController'); 

router.get('/live-stats', getLiveStats);
router.get('/streams-per-day', getStreamsPerDay);
router.get('/most-streamed-sports', getMostStreamedSports);
router.get('/matches',getLiveMatchesBySport);
module.exports = router;
