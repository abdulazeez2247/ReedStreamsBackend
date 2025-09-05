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

// Enhanced CORS configuration
const allowedOrigins = [
  "https://reed-streams-live-sports-doxe.vercel.app",
  "https://admin-pi-ruby.vercel.app", 
  "http://127.0.0.1:5501",
  "http://localhost:3000",
  "http://localhost:5173" // Add common dev ports
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, postman)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('CORS blocked for origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  optionsSuccessStatus: 200 // For legacy browser support
};

app.use(cors(corsOptions));

// Handle preflight requests explicitly
app.options('*', cors(corsOptions)); // This handles all OPTIONS requests

// Middleware
app.use(express.json({ limit: '10kb' }));

// Routes
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/matches', matchRoutes); 

app.get('/', (req, res) => {
  res.send(' Live Sports Stream Backend is running');
});

// Error handling middleware
app.use((err, req, res, next) => {
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      status: 'error',
      message: 'CORS policy: Origin not allowed'
    });
  }
  
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