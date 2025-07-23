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

const app = express();
const port = process.env.PORT || 7000;

// Connect to database
connectDB();

// Middleware
app.use(express.json());

// CORS
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

// Routes
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/sports", sportsRoutes);
app.use("/api/matches", matchRoutes);

app.get("/api/matches/proxy-stream", async (req, res) => {
  const streamUrl = decodeURIComponent(req.query.url);

  if (!streamUrl) {
    return res.status(400).send("Missing stream URL");
  }

  try {
    const response = await axios.get(streamUrl, {
      responseType: "stream",
      timeout: 60000,
      headers: {
        'User-Agent': req.headers['user-agent'] || "Mozilla/5.0",
        'Referer': 'https://example.com',
        'Origin': 'https://example.com',
        'Accept': '*/*',
        'Connection': 'keep-alive',
      },
    });

    res.set(response.headers);
    response.data.pipe(res);
  } catch (error) {
    console.error("Proxy error:", error.code, error.message);
    if (error.code === "ECONNABORTED") {
      res.status(504).send("Gateway Timeout: Stream server too slow");
    } else {
      res.status(500).send("Proxy failed: " + error.message);
    }
  }
});

// Error handling
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

// Default route
app.get("/", (req, res) => {
  res.send("Live Sports Stream Backend is running");
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
