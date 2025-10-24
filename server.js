import express from "express";
import mysql from "mysql2";
import cors from "cors";
import bodyParser from "body-parser";
import bcrypt from "bcrypt";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

// MySQL connection
const db = mysql.createConnection({
  host: "202.28.34.210",
  user: "65011212194",
  password: "65011212194",
  database: "db65011212194",
  port: 3309
});

db.connect(err => {
  if (err) console.error("❌ Database connection failed:", err.message);
  else console.log("✅ Connected to MySQL database");
});


const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, "../uploads/avatars");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}_${file.originalname}`;
    cb(null, uniqueName);
  },
});

const uploadAvatar = multer({ storage: avatarStorage });

// ------------------- REGISTER -------------------
router.post("/register", uploadAvatar.single("avatar"), async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const file = req.file;

    if (!name || !email || !password || !file) {
      return res.status(400).json({ error: "กรุณากรอกข้อมูลให้ครบและอัปโหลดรูป" });
    }

    // ตรวจสอบ email ซ้ำ
    const [rows] = await conn.query("SELECT * FROM users WHERE email = ?", [email]);
    if (rows.length > 0) {
      return res.status(400).json({ error: "อีเมลนี้มีผู้ใช้งานแล้ว" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // สร้าง URL avatar
    const avatarUrl = `/uploads/avatars/${file.filename}`;

    // wallet เริ่มต้นเป็น 0
    const wallet = 0;
    const type = "user";

    // บันทึกลง SQL DB
    const [result] = await conn.query(
      "INSERT INTO users (name, email, password, type, avatar, wallet) VALUES (?, ?, ?, ?, ?, ?)",
      [name, email, hashedPassword, type, avatarUrl, wallet]
    );

    const sUid = result.insertId;
    return res.json({
      message: "สมัครสมาชิกสำเร็จ",
      user: {
        uid: sUid,
        name,
        email,
        type,
        avatar: avatarUrl,
        wallet,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" });
  }
});



// ------------------- LOGIN -------------------
app.post("/login", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "กรุณาใส่ email และ password" });

  const sql = "SELECT * FROM users WHERE email = ?";
  db.query(sql, [email], async (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (results.length === 0) return res.status(404).json({ error: "ไม่พบบัญชีผู้ใช้" });

    const user = results[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: "รหัสผ่านไม่ถูกต้อง" });

    const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000";
    res.json({
      message: "เข้าสู่ระบบสำเร็จ",
      uid: user.uid || user.id,
      name: user.name,
      email: user.email,
      role: user.type,
      avatarUrl: user.avatar ? `${baseUrl}/uploads/${user.avatar}` : null
    });
  });
});

// ------------------- เติมเงิน -------------------
app.post("/wallet", (req, res) => {
  const { uid, wallet } = req.body;
  if (!uid || !wallet) return res.status(400).json({ error: "กรุณาใส่ uid และจำนวนเงินที่ต้องการเติม" });

  const amount = Number(wallet);
  if (isNaN(amount) || amount <= 0) return res.status(400).json({ error: "จำนวนเงินไม่ถูกต้อง" });

  const sqlSelect = "SELECT wallet, avatar FROM users WHERE uid = ?";
  db.query(sqlSelect, [uid], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (results.length === 0) return res.status(404).json({ error: "ไม่พบผู้ใช้" });

    const currentWallet = Number(results[0].wallet) || 0;
    const newWallet = currentWallet + amount;

    const sqlUpdate = "UPDATE users SET wallet = ? WHERE uid = ?";
    db.query(sqlUpdate, [newWallet, uid], (err2, updateResult) => {
      if (err2) return res.status(500).json({ error: err2.message });

      res.json({
        message: "เติมเงินสำเร็จ",
        uid,
        oldWallet: currentWallet,
        added: amount,
        newWallet,
        avatarUrl: results[0].avatar ? `${process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000"}/uploads/${results[0].avatar}` : null
      });
    });
  });
});
app.post('/purchase', (req, res) => {
  const { uid, amount } = req.body;

  if (!uid || !amount) return res.status(400).json({ error: 'กรุณาระบุ uid และจำนวนเงิน' });

  const gamePrice = Number(amount);
  if (isNaN(gamePrice) || gamePrice <= 0)
    return res.status(400).json({ error: 'จำนวนเงินไม่ถูกต้อง' });

  // 1️⃣ ดึงยอดเงินปัจจุบันของผู้ใช้
  db.query('SELECT wallet FROM users WHERE uid = ?', [uid], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (results.length === 0) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });

    const currentWallet = Number(results[0].wallet) || 0;

    // 2️⃣ ตรวจสอบยอดเงิน
    if (currentWallet < gamePrice) {
      return res.status(400).json({ error: 'ยอดเงินไม่เพียงพอ' });
    }

    // 3️⃣ คำนวณยอดใหม่
    const newWallet = currentWallet - gamePrice;

    // 4️⃣ อัปเดตยอดเงินในตาราง users
    db.query('UPDATE users SET wallet = ? WHERE uid = ?', [newWallet, uid], (err2) => {
      if (err2) return res.status(500).json({ error: err2.message });

      // 5️⃣ เพิ่มประวัติการทำธุรกรรม
      db.query(
        'INSERT INTO wallet (uid, type, amount, transaction_date) VALUES (?, ?, ?, NOW())',
        [uid, 'purchase', gamePrice],
        (err3) => {
          if (err3) return res.status(500).json({ error: err3.message });

          // ✅ ส่งผลลัพธ์กลับให้ frontend
          res.json({
            message: 'ชำระเงินสำเร็จ',
            uid,
            newWallet
          });
        }
      );
    });
  });
});

// ✅ ดึงข้อมูลเกมทั้งหมด
app.get('/api/games', (req, res) => {
  const query = 'SELECT * FROM games';
  db.query(query, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});
// ------------------- เพิ่มเกม -------------------
app.post("/api/games",upload.single("image"), async (req, res) => {
  const { game_name, price, description, category_id } = req.body;
   const image = req.file ? req.file.filename : null;

  if (!game_name || !price || !image || !description || !category_id) {
    return res.status(400).json({ error: "กรุณากรอกข้อมูลให้ครบ" });
  }

  // แปลง price เป็น number
  const gamePrice = Number(price);
  if (isNaN(gamePrice) || gamePrice < 0) {
    return res.status(400).json({ error: "ราคาต้องเป็นตัวเลขและมากกว่า 0" });
  }

  const release_date = new Date(); // วันปัจจุบัน
  const sale_count = 0; // default

  const sql = `
    INSERT INTO games 
    (game_name, price, image, description, release_date, sale_count, category_id) 
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  db.query(
    sql,
    [game_name, gamePrice, image, description, release_date, sale_count, category_id],
    (err, result) => {
      if (err) {
        console.error("❌ Insert game error:", err);
        return res.status(500).json({ error: "Failed to add game" });
      }

      const baseUrl = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000";

      res.json({
        message: "✅ Game added successfully",
        id: result.insertId,
        imageUrl: `${baseUrl}/${image}`
      });
    }
  );
});


// ------------------- Root -------------------
app.get("/", (req, res) => res.send("✅ GameShop API is running successfully!"));

// ✅ Export สำหรับ Vercel
export default app;
