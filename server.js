// require('dotenv').config();
// const express = require('express');
// const mongoose = require('mongoose');
// const cors = require('cors');
// const connectDB = require('./config/db');
// const matchRoutes = require('./routes/matchRoutes');
// const adminRoutes = require('./routes/adminRoutes');
// const dashboardRoutes = require('./routes/dashboardRoutes');
// const AppError = require('./utils/appError');

// const app = express();
// const port = process.env.PORT || 7000;

// // DB connection
// connectDB();

// // Middleware
// app.use(express.json({ limit: '10kb' }));

// app.use(cors({
//   origin: ["https://reed-streams-live-sports-doxe.vercel.app", "https://admin-pi-ruby.vercel.app", "http://127.0.0.1:5501"], 
//   credentials: true,
//   methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
//   allowedHeaders: ["Content-Type", "Authorization"]
// }));


// // Routes
// app.use('/api/dashboard', dashboardRoutes);
// app.use('/api/admin', adminRoutes);
// app.use('/api/matches', matchRoutes); 


// app.get('/', (req, res) => {
//   res.send(' Live Sports Stream Backend is running');
// });


// app.use((err, req, res, next) => {
//   err.statusCode = err.statusCode || 500;
//   err.status = err.status || 'error';

//   if (err.isOperational) {
//     return res.status(err.statusCode).json({
//       status: err.status,
//       message: err.message
//     });
//   }

//   console.error('ERROR ', err);
//   return res.status(500).json({
//     status: 'error',
//     message: 'Something went very wrong!'
//   });
// });


// const server = app.listen(port, () => {
//   console.log(` Server running on port ${port}`);
// });
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

// ===== CORS Middleware (FIRST) =====
const allowedOrigins = [
  "https://reed-streams-live-sports-doxe.vercel.app",
  "https://admin-pi-ruby.vercel.app",
  "http://127.0.0.1:5501"
];

app.use(cors({
  origin: function (origin, callback) {
    // allow requests with no origin (like mobile apps, curl, Postman)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// Preflight requests
app.options('*', cors());

// ===== Other Middleware =====
app.use(express.json({ limit: '10kb' }));

// ===== Routes =====
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/matches', matchRoutes);

app.get('/', (req, res) => {
  res.send('Live Sports Stream Backend is running');
});

// ===== Error Handling =====
app.use((err, req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*"); // ensure errors still have CORS
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

// ===== Start Server =====
const server = app.listen(port, () => {
  console.log(`✅ Server running on port ${port}`);
});
