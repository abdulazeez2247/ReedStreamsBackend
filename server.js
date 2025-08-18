require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const connectDB = require('./config/db');
const matchRoutes = require('./routes/matchRoutes');
const adminRoutes = require('./routes/adminRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const AppError = require('./utils/appError');

const app = express();
const port = process.env.PORT || 7000;

// DB connection
connectDB();

// Middleware
app.use(express.json({ limit: '10kb' }));

app.use(cors({
  origin: ["https://reed-streams-live-sports.vercel.app/"], // whitelist your frontend
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));


// Routes
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/matches', matchRoutes); 


app.get('/', (req, res) => {
  res.send(' Live Sports Stream Backend is running');
});


app.use((err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  if (err.isOperational) {
    return res.status(err.statusCode).json({
      status: err.status,
      message: err.message
    });
  }

  console.error('ERROR ', err);
  return res.status(500).json({
    status: 'error',
    message: 'Something went very wrong!'
  });
});


const server = app.listen(port, () => {
  console.log(` Server running on port ${port}`);
});
