const axios = require("axios");
const Match = require('../models/match')

const API_BASE_URL = "https://api.thesports.com";
const USER_KEY = process.env.THE_SPORTS_API_USER;
const SECRET_KEY = process.env.THE_SPORTS_API_SECRET;

const login = (req, res) => {
  const { username, password } = req.body;
  if (username === "Admin" && password === "Admin1234") {
    res.status(200).json({ message: "Login successful" });
  } else {
    res.status(401).json({ message: "Invalid credentials" });
  }
};

const getDashboard = async (req, res) => {
  try {
    const response = await axios.get(
      `${API_BASE_URL}/v1/video/play/stream/list`,
      {
        params: {
          user: USER_KEY,
          secret: SECRET_KEY,
        },
      }
    );

    const rawStreams = response.data?.results || [];

    const matches = rawStreams.map((stream) => ({
      matchId: stream.match_id,
      sportId: stream.sport_id,
      homeTeam: stream.home_name || "Team A",
      awayTeam: stream.away_name || "Team B",
      sport: stream.sport_name || "Unknown",
      matchTime: stream.match_time,
      streamUrl: stream.playurl2 || stream.playurl1 || null,
    }));

    const traffic = await Match.countDocuments();
    const performance = parseFloat((Math.random() * 100).toFixed(2));

    const streamsData = await Match.aggregate([
      {
        $group: {
          _id: { $month: "$createdAt" },
          streams: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];

    const streams = streamsData.map((item) => ({
      month: monthNames[item._id - 1],
      streams: item.streams,
    }));

    const total = await Match.countDocuments();
    const sports = await Match.aggregate([
      {
        $group: {
          _id: "$sport",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]);

    const mostStreamed = sports.map((sport) => ({
      sport: sport._id,
      percentage: total > 0 ? ((sport.count / total) * 100).toFixed(1) : 0,
    }));

    res.status(200).json({
      stats: { traffic, performance },
      streams,
      mostStreamed,
      matches,
    });
  } catch (err) {
    console.log('Dashboard Error:', err.message);
    
    res.status(500).json({ message: "Failed to fetch dashboard" });
  }
};

const getLogs = async (req, res) => {
  const logs = await AdminLog.find().sort({ timestamp: -1 });
  console.log('Logs failed:', err.message);
  
  res.status(200).json(logs);
};

module.exports = {
  login,
  getDashboard,
  getLogs,
};
