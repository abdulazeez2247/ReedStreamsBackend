const express = require('express');
const router = express.Router();
const {
  login,
  getDashboard,
  getLogs
} = require('../controllers/adminController');

const authMiddleware = require('../middleware/adminAuth');

router.post('/login', login);

router.get('/dashboard', authMiddleware, getDashboard);

router.get('/logs', authMiddleware, getLogs);

module.exports = router;