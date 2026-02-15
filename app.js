// FILE: app.js (FINAL AUTO ID G01 & P01 + RIWAYAT + EDIT + TENTANG)
const express = require('express');
const path = require('path');
const session = require('express-session');
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');

const app = express();


// ================== KONEKSI DB ================== //
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'sistempakar_sapi1'
});

db.connect((err) => {
    if (err) {
        console.error("DB ERROR:", err);
        process.exit(1);
    }
    console.log("Database Connected");
    ensureAdminExists();
});

// ================== MIDDLEWARE ================== //
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
    secret: "rahasia",
    resave: false,
    saveUninitialized: true
}));

app.use(express.static(path.join(__dirname, "public")));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// make user info available to partials
app.use((req, res, next) => {
    res.locals.userName = req.session.nama || null;
    res.locals.userEmail = req.session.email || null;
    res.locals.role = req.session.role || null;
    next();
});


// ================== PROTEKSI ================== //
function protectUser(req, res, next) {
    if (!req.session.role || req.session.role !== "user") return res.redirect("/login");
    next();
}
function protectAdmin(req, res, next) {
    if (!req.session.role || req.session.role !== "admin") return res.redirect("/admin/login");
    next();
}

// =====================================================
// ===================== BERANDA =======================
// =====================================================
app.get("/", (req, res) => {
    if (req.session.role === "user") return res.redirect("/user/dashboard");
    if (req.session.role === "admin") return res.redirect("/admin/dashboard");
    res.render("user/home");
});

// =====================================================
// ================= HALAMAN TENTANG ===================
// =====================================================
app.get("/tentang", (req, res) => {
    res.render("user/tentang");
});

// =====================================================
// ======================= USER ========================
// =====================================================

// Dashboard User
app.get("/user/dashboard", protectUser, (req, res) => {
    res.render("user/dashboard", { userName: req.session.nama });
});

// halaman konsultasi (urutkan alfabet)
app.get("/konsultasi", protectUser, (req, res) => {
    db.query("SELECT * FROM gejala ORDER BY nama_gejala ASC", (err, gejala) => {
        res.render("user/index", { gejala, userName: req.session.nama });
    });
});

// proses diagnosa
app.post("/diagnosa", protectUser, (req, res) => {
    let gejalaDipilih = req.body.gejala || [];

    if (!Array.isArray(gejalaDipilih)) gejalaDipilih = [gejalaDipilih];
    if (gejalaDipilih.length === 0) return res.send("Pilih minimal satu gejala!");

    const placeholders = gejalaDipilih.map(() => "?").join(",");
    const sql = `
        SELECT r.id_penyakit, r.cf,
               p.nama_penyakit, p.deskripsi, p.solusi
        FROM relasi r
        JOIN penyakit p ON r.id_penyakit=p.id_penyakit
        WHERE r.id_gejala IN (${placeholders})
    `;

    db.query(sql, gejalaDipilih, (err, rows) => {
        if (err) return res.send("DB error: " + err.message);
        if (!rows.length) return res.send("Tidak ditemukan hasil diagnosa!");

        const hasil = {};

        rows.forEach(r => {
            hasil[r.id_penyakit] = hasil[r.id_penyakit] || {
                id_penyakit: r.id_penyakit,
                nama_penyakit: r.nama_penyakit,
                deskripsi: r.deskripsi,
                solusi: r.solusi,
                cf: 0
            };

            hasil[r.id_penyakit].cf =
                hasil[r.id_penyakit].cf + r.cf * (1 - hasil[r.id_penyakit].cf);
        });

        const result = Object.values(hasil).sort((a, b) => b.cf - a.cf);
        const best = result[0];

        db.query(
            "INSERT INTO riwayat (id_user, id_penyakit, cf, tanggal) VALUES (?, ?, ?, NOW())",
            [req.session.userId, best.id_penyakit, best.cf]
        );

        res.render("user/hasil", { hasil: result, userName: req.session.nama });
    });
});

// ================== RIWAYAT USER ================== //
app.get("/riwayat", protectUser, (req, res) => {
    const sql = `
        SELECT r.id_riwayat, r.cf, r.tanggal,
               p.nama_penyakit, p.deskripsi, p.solusi
        FROM riwayat r
        JOIN penyakit p ON r.id_penyakit = p.id_penyakit
        WHERE r.id_user = ?
        ORDER BY r.tanggal DESC
    `;
    
    db.query(sql, [req.session.userId], (err, rows) => {
        if (err) return res.send("DB error: " + err.message);
        
        res.render("user/riwayat", { 
            data: rows,
            userName: req.session.nama 
        });
    });
});

// Detail riwayat
app.get("/riwayat/:id", protectUser, (req, res) => {
    const sql = `
        SELECT r.id_riwayat, r.cf, r.tanggal,
               p.nama_penyakit, p.deskripsi, p.solusi
        FROM riwayat r
        JOIN penyakit p ON r.id_penyakit = p.id_penyakit
        WHERE r.id_riwayat = ? AND r.id_user = ?
    `;
    
    db.query(sql, [req.params.id, req.session.userId], (err, rows) => {
        if (err) return res.send("DB error: " + err.message);
        if (!rows.length) return res.send("Data tidak ditemukan!");
        
        res.render("user/riwayat_detail", { 
            r: rows[0],
            userName: req.session.nama 
        });
    });
});

// ================== REGISTER ================== //
app.get("/register", (req, res) => res.render("auth/register"));
app.post("/register", (req, res) => {
    const { nama, email, password } = req.body;

    const hashed = bcrypt.hashSync(password, 10);

    db.query(
        "INSERT INTO users (nama, email, password, role) VALUES (?, ?, ?, 'user')",
        [nama, email, hashed],
        (err) => {
            if (err) return res.send("Gagal register: " + err.message);
            res.redirect("/login");
        }
    );
});

// ================== LOGIN USER ================== //
app.get("/login", (req, res) => res.render("auth/login_user", { error: null }));
app.post("/login", (req, res) => {
    db.query("SELECT * FROM users WHERE email=? AND role='user'", [req.body.email], (err, rows) => {
        if (err) return res.send("DB error: " + err.message);
        if (!rows.length) return res.render("auth/login_user", { error: "Email/Password salah!" });

        const user = rows[0];
        const ok = bcrypt.compareSync(req.body.password, user.password);
        if (!ok) return res.render("auth/login_user", { error: "Email/Password salah!" });

        req.session.role = "user";
        req.session.userId = user.id;
        req.session.nama = user.nama;
        res.redirect("/user/dashboard");
    });
});

// =====================================================
// ======================= ADMIN =======================
// =====================================================

// login admin
app.get("/admin/login", (req, res) =>
    res.render("auth/login_admin", { error: null })
);

app.post("/admin/login", (req, res) => {
    db.query("SELECT * FROM users WHERE email=? AND role='admin'", [req.body.email], (err, rows) => {
        if (err) return res.send("DB error: " + err.message);
        if (!rows.length) return res.render("auth/login_admin", { error: "Login salah!" });

        const admin = rows[0];
        const ok = bcrypt.compareSync(req.body.password, admin.password);
        if (!ok) return res.render("auth/login_admin", { error: "Login salah!" });

        req.session.role = "admin";
        req.session.userId = admin.id;
        req.session.nama = admin.nama;
        res.redirect("/admin/dashboard");
    });
});

// Dashboard Admin
app.get("/admin/dashboard", protectAdmin, (req, res) => {
    db.query("SELECT COUNT(*) AS c FROM users", (e1, u) => {
        db.query("SELECT COUNT(*) AS c FROM penyakit", (e2, p) => {
            db.query("SELECT COUNT(*) AS c FROM gejala", (e3, g) => {

                res.render("admin/dashboard", {
                    stats: {
                        totalUsers: u[0].c,
                        totalPenyakit: p[0].c,
                        totalGejala: g[0].c
                    },
                    activeMenu: 'dashboard',
                    pageTitle: 'Dashboard',
                    userName: req.session.nama
                });
            });
        });
    });
});

// =====================================================
// ============== AUTO ID FUNCTION (G01/P01) ===========
// =====================================================
function generateID(prefix, callback) {
    const table = prefix === "G" ? "gejala" : "penyakit";
    const col = prefix === "G" ? "id_gejala" : "id_penyakit";

    db.query(`SELECT ${col} FROM ${table} ORDER BY ${col} DESC LIMIT 1`, (err, rows) => {
        let next = 1;

        if (rows && rows.length) {
            const last = rows[0][col];
            // last expected like 'G01' or 'P12' — if not, fallback
            const num = parseInt(String(last).substring(1)) || 0;
            next = num + 1;
        }

        const newID = prefix + String(next).padStart(2, "0");
        callback(newID);
    });
}

// =====================================================
// ================== CRUD GEJALA =======================
// =====================================================
app.get("/admin/gejala", protectAdmin, (req, res) => {
    db.query("SELECT * FROM gejala ORDER BY id_gejala ASC", (err, rows) => {
        if (err) return res.send("DB error: " + err.message);
        res.render("admin/gejala", {
            gejala: rows,
            activeMenu: 'gejala',
            pageTitle: 'Daftar Gejala',
            userName: req.session.nama
        });
    });
});

// ADD Gejala (AUTO G01)
app.post("/admin/gejala/add", protectAdmin, (req, res) => {
    generateID("G", (newID) => {
        db.query("INSERT INTO gejala (id_gejala, nama_gejala) VALUES (?, ?)",
            [newID, req.body.nama_gejala],
            (err) => {
                if (err) return res.send("DB error: " + err.message);
                res.redirect("/admin/gejala");
            }
        );
    });
});

// EDIT Gejala - GET
app.get("/admin/gejala/edit/:id", protectAdmin, (req, res) => {
    db.query("SELECT * FROM gejala WHERE id_gejala=?", [req.params.id], (err, rows) => {
        if (err) return res.send("DB error: " + err.message);
        if (!rows.length) return res.send("Gejala tidak ditemukan!");
        
        res.render("admin/gejala_edit", {
            gejala: rows[0],
            activeMenu: 'gejala',
            pageTitle: 'Edit Gejala',
            userName: req.session.nama
        });
    });
});

// EDIT Gejala - POST
app.post("/admin/gejala/update/:id", protectAdmin, (req, res) => {
    db.query(
        "UPDATE gejala SET nama_gejala=? WHERE id_gejala=?",
        [req.body.nama_gejala, req.params.id],
        (err) => {
            if (err) return res.send("DB error: " + err.message);
            res.redirect("/admin/gejala");
        }
    );
});

// DELETE gejala
app.get("/admin/gejala/delete/:id", protectAdmin, (req, res) => {
    db.query("DELETE FROM gejala WHERE id_gejala=?", [req.params.id], (err) => {
        if (err) return res.send("DB error: " + err.message);
        res.redirect("/admin/gejala");
    });
});

// =====================================================
// ================= CRUD PENYAKIT =====================
// =====================================================
app.get("/admin/penyakit", protectAdmin, (req, res) => {
    db.query("SELECT * FROM penyakit ORDER BY id_penyakit ASC", (err, rows) => {
        if (err) return res.send("DB error: " + err.message);
        res.render("admin/penyakit", {
            penyakit: rows,
            activeMenu: 'penyakit',
            pageTitle: 'Daftar Penyakit',
            userName: req.session.nama
        });
    });
});

// ADD Penyakit (AUTO P01)
app.post("/admin/penyakit/add", protectAdmin, (req, res) => {
    generateID("P", (newID) => {
        db.query(
            "INSERT INTO penyakit (id_penyakit, nama_penyakit, deskripsi, solusi) VALUES (?, ?, ?, ?)",
            [newID, req.body.nama_penyakit, req.body.deskripsi, req.body.solusi],
            (err) => {
                if (err) return res.send("DB error: " + err.message);
                res.redirect("/admin/penyakit");
            }
        );
    });
});

// EDIT Penyakit - GET
app.get("/admin/penyakit/edit/:id", protectAdmin, (req, res) => {
    db.query("SELECT * FROM penyakit WHERE id_penyakit=?", [req.params.id], (err, rows) => {
        if (err) return res.send("DB error: " + err.message);
        if (!rows.length) return res.send("Penyakit tidak ditemukan!");
        
        res.render("admin/penyakit_edit", {
            penyakit: rows[0],
            activeMenu: 'penyakit',
            pageTitle: 'Edit Penyakit',
            userName: req.session.nama
        });
    });
});

// EDIT Penyakit - POST
app.post("/admin/penyakit/update/:id", protectAdmin, (req, res) => {
    db.query(
        "UPDATE penyakit SET nama_penyakit=?, deskripsi=?, solusi=? WHERE id_penyakit=?",
        [req.body.nama_penyakit, req.body.deskripsi, req.body.solusi, req.params.id],
        (err) => {
            if (err) return res.send("DB error: " + err.message);
            res.redirect("/admin/penyakit");
        }
    );
});

// DELETE Penyakit
app.get("/admin/penyakit/delete/:id", protectAdmin, (req, res) => {
    db.query("DELETE FROM penyakit WHERE id_penyakit=?", [req.params.id], (err) => {
        if (err) return res.send("DB error: " + err.message);
        res.redirect("/admin/penyakit");
    });
});

// =====================================================
// =================== CRUD RELASI =====================
// =====================================================
app.get("/admin/relasi", protectAdmin, (req, res) => {
    const q = `
        SELECT r.id_relasi, r.cf,
               p.id_penyakit, p.nama_penyakit,
               g.id_gejala, g.nama_gejala
        FROM relasi r
        JOIN penyakit p ON r.id_penyakit=p.id_penyakit
        JOIN gejala g ON r.id_gejala=g.id_gejala
        ORDER BY p.nama_penyakit ASC, g.nama_gejala ASC
    `;
    db.query(q, (err, relasi) => {
        if (err) return res.send("DB error: " + err.message);
        db.query("SELECT * FROM penyakit ORDER BY nama_penyakit ASC", (e2, penyakit) => {
            db.query("SELECT * FROM gejala ORDER BY nama_gejala ASC", (e3, gejala) => {
                res.render("admin/relasi", {
                    relasi, penyakit, gejala,
                    activeMenu: 'relasi',
                    pageTitle: 'Kelola Aturan',
                    userName: req.session.nama
                });
            });
        });
    });
});

// ADD Relasi
app.post("/admin/relasi/add", protectAdmin, (req, res) => {
    db.query(
        "INSERT INTO relasi (id_penyakit, id_gejala, cf) VALUES (?, ?, ?)",
        [req.body.id_penyakit, req.body.id_gejala, req.body.cf],
        (err) => {
            if (err) return res.send("DB error: " + err.message);
            res.redirect("/admin/relasi");
        }
    );
});

// EDIT Relasi - GET
app.get("/admin/relasi/edit/:id", protectAdmin, (req, res) => {
    const q = `
        SELECT r.id_relasi, r.id_penyakit, r.id_gejala, r.cf,
               p.nama_penyakit, g.nama_gejala
        FROM relasi r
        JOIN penyakit p ON r.id_penyakit=p.id_penyakit
        JOIN gejala g ON r.id_gejala=g.id_gejala
        WHERE r.id_relasi=?
    `;
    
    db.query(q, [req.params.id], (err, rows) => {
        if (err) return res.send("DB error: " + err.message);
        if (!rows.length) return res.send("Relasi tidak ditemukan!");
        
        db.query("SELECT * FROM penyakit ORDER BY nama_penyakit ASC", (e2, penyakit) => {
            db.query("SELECT * FROM gejala ORDER BY nama_gejala ASC", (e3, gejala) => {
                res.render("admin/relasi_edit", {
                    relasi: rows[0],
                    penyakit,
                    gejala,
                    activeMenu: 'relasi',
                    pageTitle: 'Edit Aturan',
                    userName: req.session.nama
                });
            });
        });
    });
});

// EDIT Relasi - POST
app.post("/admin/relasi/update/:id", protectAdmin, (req, res) => {
    db.query(
        "UPDATE relasi SET id_penyakit=?, id_gejala=?, cf=? WHERE id_relasi=?",
        [req.body.id_penyakit, req.body.id_gejala, req.body.cf, req.params.id],
        (err) => {
            if (err) return res.send("DB error: " + err.message);
            res.redirect("/admin/relasi");
        }
    );
});

// DELETE Relasi
app.get("/admin/relasi/delete/:id", protectAdmin, (req, res) => {
    db.query("DELETE FROM relasi WHERE id_relasi=?", [req.params.id], (err) => {
        if (err) return res.send("DB error: " + err.message);
        res.redirect("/admin/relasi");
    });
});

// =====================================================
// ================= CRUD USERS ADMIN ==================
// =====================================================
app.get("/admin/users", protectAdmin, (req, res) => {
    db.query("SELECT id, nama, email, role, created_at FROM users ORDER BY id ASC", (err, rows) => {
        if (err) return res.send("DB error: " + err.message);
        res.render("admin/kelola_user", {
            users: rows,
            activeMenu: 'users',
            pageTitle: 'Daftar User',
            userName: req.session.nama
        });
    });
});

// tambah user
app.get("/admin/users/add", protectAdmin, (req, res) => {
    res.render("admin/user_form", {
        user: null,
        action: '/admin/users/save',
        activeMenu: 'users',
        pageTitle: 'Tambah Akun',
        userName: req.session.nama
    });
});

// edit user
app.get("/admin/users/edit/:id", protectAdmin, (req, res) => {
    db.query("SELECT id, nama, email, role FROM users WHERE id=?",
        [req.params.id], (err, rows) => {
            if (err) return res.send("DB error: " + err.message);
            res.render("admin/user_form", {
                user: rows[0],
                action: '/admin/users/save',
                activeMenu: 'users',
                pageTitle: 'Edit Akun',
                userName: req.session.nama
            });
        });
});

// simpan user
app.post("/admin/users/save", protectAdmin, (req, res) => {
    const { id, nama, email, password, role } = req.body;

    if (id) {
        if (password) {
            const hashed = bcrypt.hashSync(password, 10);
            db.query(
                "UPDATE users SET nama=?, email=?, password=?, role=? WHERE id=?",
                [nama, email, hashed, role, id],
                (err) => {
                    if (err) return res.send("DB error: " + err.message);
                    res.redirect("/admin/users");
                }
            );
        } else {
            db.query(
                "UPDATE users SET nama=?, email=?, role=? WHERE id=?",
                [nama, email, role, id],
                (err) => {
                    if (err) return res.send("DB error: " + err.message);
                    res.redirect("/admin/users");
                }
            );
        }
    } else {
        const hashed = bcrypt.hashSync(password, 10);
        db.query(
            "INSERT INTO users (nama, email, password, role) VALUES (?, ?, ?, ?)",
            [nama, email, hashed, role],
            (err) => {
                if (err) return res.send("DB error: " + err.message);
                res.redirect("/admin/users");
            }
        );
    }
});

// ================== LOGOUT ================== //
app.get("/logout", (req, res) => {
    req.session.destroy();
    res.redirect("/");
});

// ================== START SERVER ================== //
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server berjalan di http://localhost:${PORT}`));



// ================== ADMIN DEFAULT ================== //
function ensureAdminExists() {
    db.query("SELECT COUNT(*) AS cnt FROM users WHERE role='admin'", (err, r) => {
        if (err) return console.error('ERR', err);
        if (r && r[0] && r[0].cnt === 0) {
            const hashed = bcrypt.hashSync("admin123", 10);
            db.query(
                "INSERT INTO users (nama, email, password, role) VALUES ('Admin', 'admin@sapi.com', ?, 'admin')",
                [hashed]
            );
            console.log("Admin default dibuat (admin@sapi.com | admin123)");
        }
    });
}