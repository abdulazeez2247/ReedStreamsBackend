const axios = require("axios");
require("dotenv").config();
const AppError = require("../utils/appError");
const { URL } = require("url");
const API_BASE_URL = "https://api.thesports.com";
const USER_KEY = process.env.THE_SPORTS_API_USER;
const SECRET_KEY = process.env.THE_SPORTS_API_SECRET;

const SPORTS_MAPPING = {
  football: { id: 1, name: "Football", slug: "football" },
  baseball: { id: 2, name: "Baseball", slug: "baseball" },
};

const getproxyStream = async (req, res, next) => {
  const streamUrl = req.query.url;
  const isM3U8 = streamUrl.endsWith(".m3u8");

  if (!streamUrl) {
    return next(new AppError("Stream URL is required for proxy.", 400));
  }

  try {
    const originalCDNBasePath = streamUrl.substring(
      0,
      streamUrl.lastIndexOf("/") + 1
    );

    const axiosConfig = {
      method: "get",
      url: streamUrl,
      timeout: 30000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: originalCDNBasePath,
        Accept: "*/*",
        "Accept-Encoding": "identity",
        Connection: "keep-alive",
      },
    };

    if (isM3U8) {
      axiosConfig.responseType = "text";
    } else {
      axiosConfig.responseType = "stream";
    }

    const response = await axios(axiosConfig);

    if (response.headers["content-type"]) {
      res.setHeader("Content-Type", response.headers["content-type"]);
    }
    if (response.headers["cache-control"]) {
      res.setHeader("Cache-Control", response.headers["cache-control"]);
    }

    if (isM3U8) {
      let m3u8Content = response.data;

      m3u8Content = m3u8Content
        .split("\n")
        .map((line) => {
          if (line.startsWith("#") || line.trim() === "") {
            return line;
          }

          if (
            (line.endsWith(".m3u8") || line.endsWith(".ts")) &&
            !line.startsWith("http")
          ) {
            const absoluteCDNUrl = new URL(line, originalCDNBasePath).href;

            const yourProxyBase =
              "http://localhost:7000/api/matches/proxy-stream?url=";
            return `${yourProxyBase}${encodeURIComponent(absoluteCDNUrl)}`;
          }
          return line;
        })
        .join("\n");

      res.send(m3u8Content);
    } else {
      response.data.pipe(res);

      response.data.on("error", (pipeError) => {
        console.error("Error during stream piping:", pipeError);
        if (!res.headersSent) {
          return next(
            new AppError(`Stream piping error: ${pipeError.message}`, 500)
          );
        }
      });
    }
  } catch (error) {
    console.error("Error fetching or proxying stream from CDN:");
    if (error.response) {
      console.error("Status:", error.response.status);
      console.error("Headers:", error.response.headers);

      console.error(
        "Error response data:",
        error.response.data?.toString
          ? error.response.data.toString()
          : error.response.data
      );
    } else if (error.request) {
      console.error("No response received, request made:", error.request);
    } else {
      console.error("Error message:", error.message);
    }

    if (error.response && error.response.status === 403) {
      return next(
        new AppError(
          "Access to stream source forbidden. It might be hotlinking protected or require specific headers.",
          403
        )
      );
    } else if (error.response && error.response.status) {
      return next(
        new AppError(
          `Failed to fetch stream from source: Status ${error.response.status}`,
          error.response.status
        )
      );
    } else if (error.code === "ECONNABORTED") {
      return next(new AppError("Stream source request timed out.", 504));
    } else {
      return next(
        new AppError(`Failed to proxy stream: ${error.message}`, 500)
      );
    }
  }
};

const convertTimestampToDateTime = (timestamp) => {
  if (!timestamp) return null;
  const date = new Date(timestamp * 1000);
  return date.toISOString();
};

const getAllSports = async (req, res, next) => {
  try {
    const sports = Object.keys(SPORTS_MAPPING).map((key) => ({
      id: SPORTS_MAPPING[key].id,
      name: SPORTS_MAPPING[key].name,
      slug: SPORTS_MAPPING[key].slug,
    }));
    res.status(200).json({
      status: "success",
      results: sports.length,
      data: { sports },
    });
  } catch (error) {
    console.error("Error fetching all sports:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to retrieve sports categories.",
    });
  }
};

const fetchLiveMatchDetails = async (matchId) => {
  if (!USER_KEY || !SECRET_KEY) {
    console.warn(
      "USER_KEY or SECRET_KEY is not set. Cannot fetch detailed live match data."
    );
    return null;
  }
  if (!matchId) {
    return null;
  }
  try {
    const response = await axios.get(
      `${API_BASE_URL}/v1/football/match/detail_live`,
      {
        params: {
          user: USER_KEY,
          secret: SECRET_KEY,
          match_id: matchId,
        },
        timeout: 5000,
      }
    );
    return response.data;
  } catch (error) {
    console.error(
      `Error fetching live match details for matchId ${matchId}:`,
      error.response?.status,
      error.response?.data || error.message
    );
    return null;
  }
};

const getLiveStreams = async (req, res, next) => {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const threeHoursInSeconds = 3 * 60 * 60; // 3 hours
  const tenMinutesInSeconds = 10 * 60; // 10 minutes
  let cachedStreams = null;
  let lastFetchTime = 0;

  const getMatchStatus = (sportId, matchTime) => {
    const currentTime = Math.floor(Date.now() / 1000);

    if (sportId === 1) {
      // FOOTBALL rules
      if (matchTime > currentTime && matchTime <= currentTime + tenMinutesInSeconds) {
        return "UPCOMING";
      }
      if (matchTime <= currentTime && currentTime - matchTime <= threeHoursInSeconds) {
        return "LIVE";
      }
      return "FINISHED";
    }

    if (sportId === 6) {
      // BASEBALL rules
      if (matchTime > currentTime && matchTime <= currentTime + tenMinutesInSeconds) {
        return "UPCOMING";
      }
      // FIX: Only consider it LIVE if it started within the last 3 hours
      if (matchTime <= currentTime && currentTime - matchTime <= threeHoursInSeconds) {
        return "LIVE";
      }
      return "FINISHED";
    }

    return "FINISHED";
  };

  try {
    const now = Date.now();

    if (!cachedStreams || (now - lastFetchTime) > 60000) {
      console.log("⏳ Fetching fresh live streams from API...");
      const { data: streamData } = await axios.get(
        `${API_BASE_URL}/v1/video/play/stream/list`, {
          params: {
            user: USER_KEY,
            secret: SECRET_KEY
          },
          timeout: 30000,
        }
      );

      if (!streamData?.results?.length) {
        return next(new AppError("No live streams found from API.", 404));
      }

      cachedStreams = streamData.results
        .filter((stream) => stream.sport_id === 1 || stream.sport_id === 6)
        .map((stream) => {
          const sport_name = stream.sport_id === 1 ? "football" : "baseball";
          const match_status = getMatchStatus(stream.sport_id, stream.match_time);
          return {
            sport_id: stream.sport_id,
            sport_name: sport_name,
            match_id: stream.match_id,
            competition_name: stream.comp,
            home_team: stream.home,
            away_team: stream.away,
            match_time: stream.match_time,
            match_status: match_status,
            playurl1: stream.playurl1 || null,
            playurl2: stream.playurl2 || null
          };
        });

      lastFetchTime = now;
    } else {
      console.log("✅ Using cached live streams");
    }

    const filteredStreams = cachedStreams.filter(
      (stream) => stream.match_status !== "FINISHED"
    );

    if (!filteredStreams.length) {
      return next(
        new AppError(
          "No live or upcoming football or baseball matches found.",
          404
        )
      );
    }

    res.status(200).json({
      status: "success",
      results: filteredStreams.length,
      data: {
        streams: filteredStreams
      },
    });
  } catch (error) {
    return next(new AppError("Failed to fetch live matches", 500, error.message));
  }
};



const getSingleMatchDiary = async (req, res, next) => {
  const { sportName, matchId } = req.params;

  const allowedSports = ["football", "baseball"];
  if (!allowedSports.includes(sportName)) {
    return next(
      new AppError(
        `This endpoint is only for ${allowedSports.join(" or ")}.`,
        400
      )
    );
  }

  try {
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const diaryUrl = `${API_BASE_URL}/v1/${sportName}/match/diary`;
    const diaryResponse = await axios.get(diaryUrl, {
      params: {
        user: USER_KEY,
        secret: SECRET_KEY,
        tsp: currentTimestamp,
      },
      timeout: 5000,
    });

    let rawMatchDetails = null;

    if (diaryResponse.data?.results) {
      rawMatchDetails = diaryResponse.data.results.find(
        (match) => match.match_id === matchId
      );
    }

    if (!rawMatchDetails) {
      return next(
        new AppError(`Match details are not available for this stream.`, 404)
      );
    }

    // Use real keys from API (home, away, comp)
    const realHomeTeam = rawMatchDetails.home || "Home";
    const realAwayTeam = rawMatchDetails.away || "Away";
    const competitionName = rawMatchDetails.comp || "Unknown Competition";

    const goalScorers =
      rawMatchDetails.incidents
        ?.filter((i) => i.type === "goal" && i.player_name)
        .map((i) => ({
          player_name: i.player_name,
          time: i.time,
          score_after: `${i.home_score}-${i.away_score}`,
        })) || [];

    const mappedDetails = {
      match_id: rawMatchDetails.match_id,
      sport_name: sportName,
      home_team_name: realHomeTeam,
      away_team_name: realAwayTeam,
      competition_name: competitionName,
      status: {
        description:
          rawMatchDetails.status?.description ||
          (rawMatchDetails.match_status === 100 ? "Live" : "Upcoming"),
      },
      home_score_current: rawMatchDetails.home_score ?? 0,
      away_score_current: rawMatchDetails.away_score ?? 0,
      goal_scorers: goalScorers,
    };

    res.status(200).json({
      status: "success",
      data: { match: mappedDetails },
    });
  } catch (error) {
    console.error(
      `Failed to fetch match details for ${matchId}: ${error.message}`
    );
    return next(
      new AppError(
        `Failed to fetch match details. The API might be down or data is unavailable.`,
        500
      )
    );
  }
};



function capitalizeFirst(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

const getMatchList = async (req, res, next) => {
  const { sportName } = req.params;
  const sportInfo = SPORTS_MAPPING[sportName];
  if (!sportInfo || sportInfo.id === null) {
    return next(
      new AppError("Invalid or unmapped sport specified for match list.", 400)
    );
  }

  try {
    const response = await axios.get(
      `${API_BASE_URL}/v1/${sportName}/match/diary`,
      {
        params: {
          user: USER_KEY,
          secret: SECRET_KEY,
          date: new Date().toISOString().slice(0, 10).replace(/-/g, ""), // yyyymmdd
        },
      }
    );

    const rawMatches = response.data?.results || [];
    const extra = response.data?.results_extra || {};

    const competitionMap = {};
    extra.competition?.forEach((c) => (competitionMap[c.id] = c));

    const teamMap = {};
    extra.team?.forEach((t) => (teamMap[t.id] = t));

    const mappedMatches = rawMatches.map((match) => {
      const competition = competitionMap[match.competition_id] || {};
      const homeTeam = teamMap[match.home_team_id] || {};
      const awayTeam = teamMap[match.away_team_id] || {};

      return {
        id: match.id,
        season_id: match.season_id,
        competition_id: match.competition_id,
        competition_name: competition.name || "Unknown League",
        competition_logo: competition.logo || null,
        home_team_id: match.home_team_id,
        away_team_id: match.away_team_id,
        home_team_name: homeTeam.name || "Home",
        home_team_logo: homeTeam.logo || null,
        away_team_name: awayTeam.name || "Away",
        away_team_logo: awayTeam.logo || null,
        status_id: match.status_id,
        match_time: convertTimestampToDateTime(match.match_time),
        home_scores: match.home_scores,
        away_scores: match.away_scores,
        home_score_current: match.home_scores?.[0] ?? null,
        away_score_current: match.away_scores?.[0] ?? null,
      };
    });

    res.status(200).json({
      status: "success",
      results: mappedMatches.length,
      data: { matches: mappedMatches },
    });
  } catch (error) {
    console.error(
      "Error fetching match list:",
      error.response?.data || error.message
    );
    return next(
      new AppError(`Failed to fetch match list: ${error.message}`, 500)
    );
  }
};

module.exports = {
  fetchLiveMatchDetails,
  getLiveStreams,
  getSingleMatchDiary,
  getAllSports,
  getMatchList,
  getproxyStream,
};
