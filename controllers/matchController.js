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
      timeout: 10000,
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
    const streamListRes = await axios.get(
      `${API_BASE_URL}/v1/video/play/stream/list`,
      {
        params: { user: USER_KEY, secret: SECRET_KEY },
      }
    );

    const rawStreams = streamListRes.data?.results || [];

    const today = new Date();
    const formattedDate = today.toISOString().split("T")[0];

    const diaryResponses = await Promise.all(
      Object.entries(SPORTS_MAPPING).map(async ([slug, info]) => {
        if (!info.id || !slug) return null;
        try {
          const res = await axios.get(`${API_BASE_URL}/v1/${slug}/match/diary`, {
            params: {
              user: USER_KEY,
              secret: SECRET_KEY,
              date: formattedDate,
            },
            timeout: 8000,
          });
          return { sportSlug: slug, data: res.data };
        } catch (err) {
          console.warn(`Diary fetch failed for ${slug}:`, err.message);
          return null;
        }
      })
    );

    const diaryMatchesBySport = {};
    const teamMapBySport = {};
    const compMapBySport = {};

    diaryResponses.forEach((res) => {
      if (!res || !res.data) return;
      const { sportSlug, data } = res;

      const matches = data?.data?.list || data?.data?.matches || [];
      const resultsExtra = data?.results_extra || data?.data?.results_extra || {};

      diaryMatchesBySport[sportSlug] = matches;

      const teamMap = new Map();
      (resultsExtra.team || []).forEach((team) => teamMap.set(team.id, team));
      teamMapBySport[sportSlug] = teamMap;

      const compMap = new Map();
      (resultsExtra.competition || []).forEach((comp) => compMap.set(comp.id, comp));
      compMapBySport[sportSlug] = compMap;
    });

    const mappedStreams = await Promise.all(
      rawStreams.map(async (stream) => {
        const sport = Object.values(SPORTS_MAPPING).find((s) => s.id === stream.sport_id);
        const sportSlug = sport?.slug;

        let detailedMatch = diaryMatchesBySport[sportSlug]?.find(
          (match) => String(match.id) === String(stream.match_id)
        );

        let homeTeamName = stream.home_team_name || "N/A";
        let awayTeamName = stream.away_team_name || "N/A";
        let homeTeamLogo = null;
        let awayTeamLogo = null;
        let competitionName = "Live Match";
        let homeScore = 0;
        let awayScore = 0;
        let matchStartTime = convertTimestampToDateTime(stream.match_time);

        if (!detailedMatch) {
          const fallback = await fetchLiveMatchDetails(stream.match_id);
          if (fallback?.results && Array.isArray(fallback.results)) {
            detailedMatch = fallback.results.find(
              (match) => String(match.id) === String(stream.match_id)
            );
          } else if (fallback?.data?.id === stream.match_id) {
            detailedMatch = fallback.data;
          } else if (fallback?.id === stream.match_id) {
            detailedMatch = fallback;
          }
        }

        if (detailedMatch) {
          const teamsMap = teamMapBySport[sportSlug] || new Map();
          const compMap = compMapBySport[sportSlug] || new Map();

          const homeDetails = teamsMap.get(detailedMatch.home_team_id);
          const awayDetails = teamsMap.get(detailedMatch.away_team_id);
          const compDetails = compMap.get(detailedMatch.competition_id);

          if (homeDetails) {
            homeTeamName = homeDetails.name;
            homeTeamLogo = homeDetails.logo;
          }
          if (awayDetails) {
            awayTeamName = awayDetails.name;
            awayTeamLogo = awayDetails.logo;
          }
          if (compDetails) {
            competitionName = compDetails.name;
          }

          if (Array.isArray(detailedMatch.home_scores) && detailedMatch.home_scores.length > 0) {
            homeScore = detailedMatch.home_scores[0];
          }
          if (Array.isArray(detailedMatch.away_scores) && detailedMatch.away_scores.length > 0) {
            awayScore = detailedMatch.away_scores[0];
          }

          if (detailedMatch.start_time) {
            matchStartTime = convertTimestampToDateTime(detailedMatch.start_time);
          }
        }

        return {
          gmid: stream.match_id,
          match_title: `${homeTeamName} vs ${awayTeamName}`,
          sport_id: stream.sport_id,
          sport_name: sport?.name || "Unknown Sport",
          start_time: matchStartTime,
          home_team_name: homeTeamName,
          away_team_name: awayTeamName,
          home_team_logo: homeTeamLogo,
          away_team_logo: awayTeamLogo,
          home_score_current: homeScore,
          away_score_current: awayScore,
          competition_name: competitionName,
          goal_scorers: [],
          status: {
            description: "Live",
            type: "inprogress",
          },
          m3u8_source: stream.playurl2 || stream.playurl1 || null,
          iframe_source: null,
          stream_source: stream.playurl2 || stream.playurl1 || null,
        };
      })
    );

    const filteredStreams = requestedSportSlug
      ? mappedStreams.filter((stream) => {
          const mappedSport = Object.values(SPORTS_MAPPING).find(
            (s) => s.slug === requestedSportSlug
          );
          return mappedSport && stream.sport_id === mappedSport.id;
        })
      : mappedStreams;

    res.status(200).json({
      status: "success",
      results: filteredStreams.length,
      data: { streams: filteredStreams },
    });
  } catch (error) {
    console.error(
      "Error in getLiveStreams main block:",
      error.response?.data || error.message
    );
    return next(
      new AppError(`Failed to fetch live matches: ${error.message}`, 500)
    );
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
    console.log(`Backend Log (getMatchDiary): Attempting to fetch details for matchId: ${matchId}, sport: ${sportName}`);

    const detailLiveUrl = `${API_BASE_URL}/v1/${sportName}/match/detail_live`;
    console.log(`Backend Log (getMatchDiary): Calling API: ${detailLiveUrl} with match_id: ${matchId}`);

    const response = await axios.get(
      detailLiveUrl,
      {
        params: {
          user: USER_KEY,
          secret: SECRET_KEY,
          match_id: matchId,
        },
      }
    );

    console.log("Backend Log (getMatchDiary): Full TheSports.com API Response:", JSON.stringify(response.data, null, 2));

    let rawMatchDetails = null;
    if (response.data && response.data.results && Array.isArray(response.data.results)) {
        rawMatchDetails = response.data.results.find(match => String(match.id) === String(matchId));
        console.log(`Backend Log (getMatchDiary): Found match in 'results' array? ${!!rawMatchDetails}`);
    } else if (response.data && response.data.id && String(response.data.id) === String(matchId)) {
        rawMatchDetails = response.data; 
        console.log("Backend Log (getMatchDiary): Found match directly in response.data.");
    } else if (response.data && response.data.data && response.data.data.id && String(response.data.data.id) === String(matchId)) {
        rawMatchDetails = response.data.data; 
        console.log("Backend Log (getMatchDiary): Found match nested under 'data'.");
    }



    if (!rawMatchDetails) {
      console.error(`Backend Log (getMatchDiary): After parsing, rawMatchDetails is null or undefined for matchId: ${matchId}`);
      return next(
        new AppError(`No match diary found for match ID: ${matchId}`, 404)
      );
    }

    console.log("Backend Log (getMatchDiary): rawMatchDetails found:", JSON.stringify(rawMatchDetails, null, 2));

    const goalScorers =
      rawMatchDetails.incidents
        ?.filter((i) => i.type === "goal" && i.player_name)
        .map((i) => ({
          player_name: i.player_name,
          time: i.time,
          score_after: `${i.home_score}-${i.away_score}`,
        })) || [];

    // ... (rest of your mapping logic)

    res.status(200).json({
      status: "success",
      data: { match: mappedDetails },
    });
  } catch (error) {
    // --- CRITICAL DEBUGGING POINT 3: Log full error from API call ---
    console.error(
      "Backend Log (getMatchDiary): Error fetching match diary:",
      error.response?.data || error.message
    );
    return next(
      new AppError(`Failed to fetch match diary: ${error.message}`, 500)
    );
  }
};

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
