const Match = require('../models/match');

exports.getLiveStats = async (req, res) => {
  try {
    const totalStreams = await Match.countDocuments();
    const totalUsers = Math.floor(Math.random() * 10000) + 500;
    const activeSports = (await Match.distinct('sport')).length;

    res.status(200).json({
      data: {
        totalUsers,
        totalStreams,
        activeSports,
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch live stats' });
  }
};

exports.getStreamsPerDay = async (req, res) => {
  try {
    const data = await Match.aggregate([
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            day: { $dayOfMonth: "$createdAt" }
          },
          streams: { $sum: 1 }
        }
      },
      {
        $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 }
      },
      {
        $project: {
          _id: 0,
          date: {
            $dateToString: { format: "%Y-%m-%d", date: { $dateFromParts: { year: "$_id.year", month: "$_id.month", day: "$_id.day" } } }
          },
          streams: 1
        }
      }
    ]);

    res.status(200).json({ data });
  } catch (err) {
    res.status(500).json({ error: 'Error getting stream data' });
  }
};


exports.getMostStreamedSports = async (req, res) => {
  try {
    const total = await Match.countDocuments();
    const sports = await Match.aggregate([
      {
        $group: {
          _id: "$sport",
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    const result = sports.map(sport => ({
      name: sport._id,
      percentage: total > 0 ? parseFloat(((sport.count / total) * 100).toFixed(1)) : 0
    }));

    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: 'Error getting most streamed sports' });
  }
};

exports.getLiveMatchesBySport = async (req, res) => {
    const { sport_id } = req.query;

    try {
        const matches = await Match.find({sport_id, isVisible: true});
        res.status(200).json({matches});
    } catch (error) {
        res.status(500).json({error: 'Failed to fetch matches'})
    }
};