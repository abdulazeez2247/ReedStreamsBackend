const express = require("express");
const router = express.Router();
const {
  getLiveStreams,
  getMatchDiary,
  getAllSports,
  getMatchList,
  getproxyStream
} = require("../controllers/matchController");

router.get("/sports", getAllSports);
router.get("/streams", getLiveStreams);
router.get("/:sportName/diary/:matchId", getMatchDiary);
router.get("/:sportName/list", getMatchList);
router.get('/proxy-stream', getproxyStream);
module.exports = router;
