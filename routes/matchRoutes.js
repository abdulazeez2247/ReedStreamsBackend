const express = require("express");
const router = express.Router();
const {
  getLiveStreams,
  getproxyStream,
  getSingleMatchDiary
} = require("../controllers/matchController");


router.get("/streams", getLiveStreams);            
router.get("/proxy-stream", getproxyStream);      


router.get("/:sportName/:matchId", getSingleMatchDiary); 

module.exports = router;
