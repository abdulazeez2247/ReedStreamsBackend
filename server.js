const dotenv = require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const axios = require("axios");
const connectDB = require("./config/db");
const matchRoutes = require("./routes/matchRoutes");
const adminRoutes = require("./routes/adminRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const appError = require("./utils/appError");
const URL = require('url');

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

app.use("/api/matches", matchRoutes);

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

app.get('/test', (req, res) => {
    res.status(200).send('Test route is working!');
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});