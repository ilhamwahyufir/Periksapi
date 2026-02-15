const mysql = require('mysql2');

const host = process.env.DB_HOST || process.env.MYSQL_HOST;
const user = process.env.DB_USER || process.env.MYSQL_USER;
const password = process.env.DB_PASS || process.env.MYSQL_PASSWORD;
const database = process.env.DB_NAME || process.env.MYSQL_DATABASE;
const port = Number(process.env.DB_PORT || process.env.MYSQL_PORT || 3306);

if (!host || !user || !database) {
  console.log('⚠️ Database tidak dikonfigurasi - aplikasi berjalan tanpa database');
} else {
  console.log('✅ Database config terdeteksi');
}

const pool = mysql.createPool({
  host,
  user,
  password,
  database,
  port,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  // sementara matikan ssl dulu kalau belum yakin perlu
  // ssl: { rejectUnauthorized: false }
});

pool.getConnection((err, conn) => {
  if (err) console.error('Gagal konek ke database:', err);
  else { console.log('Berhasil konek ke database'); conn.release(); }
});

module.exports = pool.promise();
