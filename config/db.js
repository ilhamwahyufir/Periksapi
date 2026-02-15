// config/db.js
const mysql = require('mysql2');

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',      // ganti sesuai punya kamu
  database: 'sistempakar_sapi' // ganti sesuai nama DB
});

db.connect((err) => {
  if (err) {
    console.error('Koneksi database gagal:', err);
  } else {
    console.log('Koneksi database berhasil');
  }
});

module.exports = db;
