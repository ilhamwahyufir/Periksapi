// routes/index.js
const express = require('express');
const router = express.Router();

// Halaman beranda
router.get('/', (req, res) => {
  res.render('index');  // views/index.ejs
});

// Halaman login admin
router.get('/login-admin', (req, res) => {
  res.render('login_admin');
});

// Halaman login user/peternak
router.get('/login-user', (req, res) => {
  res.render('login_user');
});

module.exports = router;
