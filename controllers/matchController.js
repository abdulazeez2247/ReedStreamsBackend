const axios = require("axios");
const dotenv = require("dotenv").config();
const AppError = require("../utils/appError");
const { URL } = require("url");
const API_BASE_URL = "https://api.thesports.com";
const USER_KEY = process.env.THE_SPORTS_API_USER;
const SECRET_KEY = process.env.THE_SPORTS_API_SECRET;

const SPORTS_MAPPING = {
  football: { id: 1, name: "Football", slug: "football" },
  baseball: { id: 2, name: "Baseball", slug: "baseball" },
  amfootball: { id: 6, name: "American Football", slug: "amfootball" },
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
              "https://reedstreamsbackend1.onrender.com/api/matches/proxy-stream?url=";
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


const getLiveStreams = async (req, res, next) => {
  try {
    console.log("⏳ Fetching fresh live streams from API...");
    const { data: streamData } = await axios.get(
      `${API_BASE_URL}/v1/video/play/stream/list`,
      {
        params: { user: USER_KEY, secret: SECRET_KEY },
        timeout: 30000,
      }
    );

    if (!streamData?.results?.length) {
      return next(new AppError("No live streams found from API.", 404));
    }

    const now = Date.now();
    const filteredStreams = streamData.results
      .filter((s) => [1, 2, 6].includes(s.sport_id)) 
      .map((s) => {
        let sport_name = "unknown";
        if (s.sport_id === 1) sport_name = "football";
        if (s.sport_id === 2) sport_name = "baseball";
        if (s.sport_id === 6) sport_name = "amfootball";

        const match_time_unix = s.match_time;

        let match_time_date = null;
        let start_time_formatted = "N/A";

        if (match_time_unix) {
          try {
            const timestamp =
              typeof match_time_unix === "string"
                ? parseInt(match_time_unix)
                : match_time_unix;

            if (!isNaN(timestamp)) {
              match_time_date = new Date(timestamp * 1000);
              start_time_formatted = match_time_date.toLocaleString();
            }
          } catch (e) {
            console.warn("Invalid match_time format:", match_time_unix);
          }
        }

        const home_team = s.home || "TBD";
        const away_team = s.away || "TBD";
        const competition_name = s.comp || s.competition_name || "Unknown";

        let match_status = "LIVE";
        if (match_time_unix) {
          const timeDiff = now - match_time_unix * 1000;
          if (timeDiff >= 3 * 60 * 60 * 1000) {
            match_status = "FINISHED";
          } else if (timeDiff < 0) {
            match_status = "UPCOMING";
          }
        }

        if (!s.playurl1 && !s.playurl2) {
          match_status = "FINISHED";
        }

        return {
          sport_name,
          competition_name,
          home_name: home_team,
          away_name: away_team,
          start_time: start_time_formatted,
          match_status,
          match_id: s.id || null,
          playurl1: s.playurl1 || null,
          playurl2: s.playurl2 || null,
          raw_match_time: match_time_unix,
        };
      });

    if (!filteredStreams.length) {
      return next(
        new AppError("No football, baseball or American football streams found.", 404)
      );
    }

    res.status(200).json({
      status: "success",
      results: filteredStreams.length,
      data: { streams: filteredStreams },
    });
  } catch (err) {
    const errorMessage = err.response?.data?.message || err.message;
    return next(
      new AppError("Failed to fetch live matches", 500, errorMessage)
    );
  }
};


const getSingleMatchDiary = async (req, res, next) => {
  const { sportName, matchId } = req.params;

  const allowedSports = ["football", "baseball", "amfootball"]; 
  if (!allowedSports.includes(sportName)) {
    return next(
      new AppError(
        `This endpoint is only for ${allowedSports.join(", ")}.`,
        400
      )
    );
  }

};



module.exports = {
  // fetchLiveMatchDetails,
  getLiveStreams,
  getSingleMatchDiary,
  // getAllSports,
  // getMatchList,
  getproxyStream,
};
