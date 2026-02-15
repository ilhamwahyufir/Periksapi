const mysql = require('mysql2');

const host = process.env.DB_HOST || process.env.MYSQLHOST || process.env.MYSQL_HOST;
const user = process.env.DB_USER || process.env.MYSQLUSER || process.env.MYSQL_USER;
const password = process.env.DB_PASS || process.env.MYSQLPASSWORD || process.env.MYSQL_PASSWORD;
const database = process.env.DB_NAME || process.env.MYSQLDATABASE || process.env.MYSQL_DATABASE;
const port = Number(process.env.DB_PORT || process.env.MYSQLPORT || process.env.MYSQL_PORT || 3306);

console.log('DB ENV CHECK:', {
  host: !!host, user: !!user, database: !!database, port
});

const pool = mysql.createPool({
  host,
  user,
  password,
  database,
  port,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  // Public proxy kadang butuh SSL. Kalau tanpa SSL gagal, baru aktifkan ini:
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

pool.getConnection((err, conn) => {
  if (err) console.error('Gagal konek ke database:', err);
  else { console.log('Berhasil konek ke database'); conn.release(); }
});

module.exports = pool.promise();
