import express from "express";
import mysql from "mysql2";
import cors from "cors";
import bcrypt from "bcrypt";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ CORS
app.use(cors({
  origin: ["http://localhost:4200"],
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

// ✅ Static upload folder
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// MySQL
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

// Multer
const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, "../uploads/avatars");
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}_${file.originalname}`);
  }
});

const uploadAvatar = multer({ storage: avatarStorage });

// ------------------- REGISTER -------------------
app.post("/register", uploadAvatar.single("avatar"), (req, res) => {
  const { name, email, password } = req.body;
  const file = req.file;

  if (!name || !email || !password || !file)
    return res.status(400).json({ error: "กรุณากรอกข้อมูลให้ครบและอัปโหลดรูป" });

  // ตรวจสอบ email
  db.query("SELECT * FROM users WHERE email = ?", [email], async (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (results.length > 0) return res.status(400).json({ error: "อีเมลนี้มีผู้ใช้งานแล้ว" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const avatarUrl = `/uploads/avatars/${file.filename}`;
    const wallet = 0;
    const type = "user";

    db.query(
      "INSERT INTO users (name, email, password, type, avatar, wallet) VALUES (?, ?, ?, ?, ?, ?)",
      [name, email, hashedPassword, type, avatarUrl, wallet],
      (err2, result) => {
        if (err2) return res.status(500).json({ error: err2.message });
        res.json({
          message: "สมัครสมาชิกสำเร็จ",
          user: { uid: result.insertId, name, email, type, avatar: avatarUrl, wallet }
        });
      }
    );
  });
});

// ------------------- LOGIN -------------------
app.post("/login", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "กรุณาใส่ email และ password" });

  db.query("SELECT * FROM users WHERE email = ?", [email], async (err, results) => {
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
      avatarUrl: user.avatar ? `${baseUrl}/uploads/avatars/${user.avatar}` : null
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

app.get("/", (req, res) => res.send("✅ GameShop API is running successfully!"));

export default app;
