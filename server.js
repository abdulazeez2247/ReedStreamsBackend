const dotenv = require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const axios = require("axios");
const connectDB = require("./config/db");
const matchRoutes = require("./routes/matchRoutes");
const adminRoutes = require("./routes/adminRoutes");
const sportsRoutes = require("./routes/matchRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const appError = require("./utils/appError");
const URL = require('url')

const app = express();
const port = process.env.PORT || 7000;


connectDB();


app.use(express.json());

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || origin === "null") {
        callback(null, true);
      } else {
        callback(null, true);
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    optionsSuccessStatus: 200,
  })
);


app.use("/api/dashboard", dashboardRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/sports", sportsRoutes);
app.use("/api/matches", matchRoutes);



app.get("/api/matches/proxy-stream", async (req, res) => {
    const streamUrlFromQuery = req.query.url;

    if (!streamUrlFromQuery) {
        return res.status(400).json({ error: "Missing stream URL" });
    }

    let finalDecodedUrl = streamUrlFromQuery;
    let previousUrl;
    do {
        previousUrl = finalDecodedUrl;
        try {
            finalDecodedUrl = decodeURIComponent(previousUrl);
        } catch (e) {
            break;
        }
    } while (finalDecodedUrl !== previousUrl);

    console.log("Backend Log: URL before URL constructor validation:", finalDecodedUrl);

    let origin;
    try {
        const parsed = new URL(finalDecodedUrl); // TYPO CORRECTED HERE
        origin = parsed.origin;
    } catch (err) {
        console.error("Backend Log: Invalid URL format after decoding:", err.message);
        return res.status(400).json({ error: "Invalid stream URL format" });
    }

    try {
        const response = await axios.get(finalDecodedUrl, {
            responseType: "stream",
            timeout: 90000,
            headers: {
                "User-Agent": req.headers["user-agent"] || "Mozilla/5.0",
                "Referer": origin,
                "Origin": origin,
                "Accept": "*/*",
                "Connection": "keep-alive",
            },
        });

        Object.entries(response.headers).forEach(([key, value]) => {
            if (key.toLowerCase() === "transfer-encoding" || key.toLowerCase() === "content-encoding") {
                return;
            }
            res.setHeader(key, value);
        });

        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Cache-Control", "no-cache");

        response.data.pipe(res);

        response.data.on('error', (pipeError) => {
            console.error('Backend Log: Error piping upstream response to client:', pipeError.message);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Proxy streaming error during data transfer.' });
            } else {
                res.end();
            }
        });

    } catch (error) {
        console.error("Backend Log: Proxy request error:", error.code || "UNKNOWN_CODE", error.message);
        if (error.config) {
            console.error("Backend Log: Error URL:", error.config.url);
        }

        if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
            res.status(504).json({ error: "Gateway Timeout: Stream server too slow or unreachable" });
        } else if (error.response) {
            res.status(error.response.status).json({ error: `Upstream error: ${error.response.statusText || 'Unknown'}` });
        } else if (error.request) {
            res.status(504).json({ error: "Gateway Timeout: No response from upstream server" });
        } else {
            res.status(500).json({ error: "Proxy failed: " + error.message });
        }
    }
});



app.use((err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || "error";

  if (err.isOperational) {
    return res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
    });
  }

  console.error("ERROR", err);

  return res.status(500).json({
    status: "error",
    message: "Something went very wrong!",
  });
});


app.get("/", (req, res) => {
  res.send("Live Sports Stream Backend is running");
});


app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
