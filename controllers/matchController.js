const axios = require("axios");
require("dotenv").config();
const AppError = require("../utils/appError");
const { URL } = require("url");
const API_BASE_URL = "https://api.thesports.com";
const USER_KEY = process.env.THE_SPORTS_API_USER;
const SECRET_KEY = process.env.THE_SPORTS_API_SECRET;

const SPORTS_MAPPING = {
  football: { id: 1, name: "Football", slug: "football" },
  basketball: { id: 2, name: "Basketball", slug: "basketball" },
  tabletennis: { id: null, name: "Table Tennis", slug: "tabletennis" },
  baseball: { id: null, name: "Baseball", slug: "baseball" },
  volleyball: { id: null, name: "Volleyball", slug: "volleyball" },
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
  const requestedSportSlug = req.query.sport;

  try {
    const response = await axios.get(`${API_BASE_URL}/v1/video/play/stream/list`, {
      params: {
        user: USER_KEY,
        secret: SECRET_KEY,
      },
      timeout: 30000,
    });

    const streams = response.data?.results || [];

    const mapped = streams
      .map((stream) => {
        const sport = Object.values(SPORTS_MAPPING).find(s => s.id === stream.sport_id);

        if (!sport) {
          console.warn(` Unknown sport_id: ${stream.sport_id} for match_id: ${stream.match_id}`);
          return null;
        }

        return {
          match_id: stream.match_id,
          sport_id: stream.sport_id,
          sport_name: sport.name,
          sport_slug: sport.slug,
          start_time: convertTimestampToDateTime(stream.match_time),
          stream_url: stream.playurl2 || stream.playurl1 || null,
          home_team_name: stream.home_name || 'Home',
          away_team_name: stream.away_name || 'Away',
          competition_name: stream.competition_name || '',
          status: stream.status || { description: 'Live' },
          home_score_current: stream.home_score || 0,
          away_score_current: stream.away_score || 0,
          goal_scorers: stream.goal_scorers || [],
        };
      })
      .filter(stream => stream && stream.stream_url);

    const filtered = requestedSportSlug
      ? mapped.filter(s => s.sport_slug === requestedSportSlug)
      : mapped;

    return res.status(200).json({
      status: "success",
      results: filtered.length,
      data: { streams: filtered },
    });
  } catch (error) {
    console.error("Live stream fetch failed:", error.message);
    return next(new AppError("Failed to fetch live streams", 500));
  }
};





const getMatchDiary = async (req, res, next) => {
  const { sportName, matchId } = req.params;
  const sportInfo = SPORTS_MAPPING[sportName];
  if (!sportInfo || sportInfo.id === null) {
    return next(
      new AppError("Invalid or unmapped sport specified for match diary.", 400)
    );
  }

  try {
    console.log(`Backend Log: Fetching details for matchId: ${matchId}, sport: ${sportName}`);

    const detailLiveUrl = `${API_BASE_URL}/v1/${sportName}/match/detail_live`;
    const response = await axios.get(detailLiveUrl, {
      params: {
        user: USER_KEY,
        secret: SECRET_KEY,
        match_id: matchId,
      },
    });

    let rawMatchDetails = null;
    if (response.data?.results?.length) {
      rawMatchDetails = response.data.results.find(
        (match) => String(match.id) === String(matchId)
      );
    } else if (response.data?.id === matchId) {
      rawMatchDetails = response.data;
    } else if (response.data?.data?.id === matchId) {
      rawMatchDetails = response.data.data;
    }

    if (!rawMatchDetails) {
      return next(new AppError(`No match diary found for match ID: ${matchId}`, 404));
    }

    // ✅ Extract real team names
    const realHomeTeam = rawMatchDetails.home_team?.name || "Home";
    const realAwayTeam = rawMatchDetails.away_team?.name || "Away";

    // ✅ Extract goal scorers
    const goalScorers =
      rawMatchDetails.incidents
        ?.filter((i) => i.type === "goal" && i.player_name)
        .map((i) => ({
          player_name: i.player_name,
          time: i.time,
          score_after: `${i.home_score}-${i.away_score}`,
        })) || [];

    // ✅ Construct mappedDetails to override placeholder fields
    const mappedDetails = {
      match_id: matchId,
      sport_id: sportInfo.id,
      sport_name: capitalizeFirst(sportName),
      sport_slug: sportName,
      start_time: rawMatchDetails.start_time,
      stream_url: rawMatchDetails.stream_url,
      home_team_name: realHomeTeam,
      away_team_name: realAwayTeam,
      competition_name: rawMatchDetails.competition_name || "",
      status: {
        description: rawMatchDetails.status?.description || "Live",
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
    console.error("getMatchDiary Error:", error.response?.data || error.message);
    return next(new AppError(`Failed to fetch match diary: ${error.message}`, 500));
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
        },
      }
    );

    const rawMatches = response.data?.results || [];

    const mappedMatches = rawMatches.map((match) => ({
      id: match.id,
      season_id: match.season_id,
      competition_id: match.competition_id,
      competition_name: match.league_name || "Unknown League",
      home_team_id: match.home_team_id,
      away_team_id: match.away_team_id,
      home_team_name: match.home_name,
      away_team_name: match.away_name,
      status_id: match.status_id,
      match_time: convertTimestampToDateTime(match.match_time),
      home_scores: match.home_scores,
      away_scores: match.away_scores,
      home_score_current: match.home_score_current ?? match.home_score ?? null,
      away_score_current: match.away_score_current ?? match.away_score ?? null,
    }));

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
  getLiveStreams,
  getMatchDiary,
  getAllSports,
  getMatchList,
  getproxyStream,
};
