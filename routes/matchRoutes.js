const express = require("express");
const router = express.Router();
const {
  getLiveStreams,
  getSingleMatchDiary,
  getproxyStream
} = require("../controllers/matchController");

// Existing routes
router.get("/streams", getLiveStreams);
router.get("/proxy-stream", getproxyStream);

// Updated match diary route to match frontend expectation
router.get("/streams/:sportName/:matchId", getSingleMatchDiary);

module.exports = router;