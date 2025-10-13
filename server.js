import express from "express";
import mysql from "mysql2";
import cors from "cors";
import bodyParser from "body-parser";
import bcrypt from "bcrypt";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

// สำหรับ ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(bodyParser.json());

// สร้างโฟลเดอร์ uploads ถ้าไม่มี
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname.replace(/\s+/g, "-"))
});
const upload = multer({ storage });

// ให้เข้าถึงไฟล์ /uploads
app.use("/uploads", express.static(uploadDir));

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

// ------------------- REGISTER -------------------
app.post("/register", upload.single("avatar"), async (req, res) => {
  const { name, email, password } = req.body;
  const avatar = req.file ? req.file.filename : null;

  if (!name || !email || !password) return res.status(400).json({ error: "กรุณาใส่ name, email และ password" });

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const sql = "INSERT INTO users (name, email, password, type, avatar) VALUES (?, ?, ?, ?, ?)";
    db.query(sql, [name, email, hashedPassword, "user", avatar], (err, result) => {
      if (err) return res.status(500).json({ error: err.message });

      const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000";
      res.json({
        message: "สมัครผู้ใช้เรียบร้อยแล้ว",
        uid: result.insertId,
        name,
        email,
        type: "user",
        avatarUrl: avatar ? `${baseUrl}/uploads/${avatar}` : null
      });
    });
  } catch (error) {
    console.error("❌ Hash error:", error.message);
    res.status(500).json({ error: "เกิดข้อผิดพลาด" });
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

// ------------------- เพิ่มเกม -------------------
app.post("/api/games", upload.single("image"), async (req, res) => {
  const { game_name, price, description, category_id } = req.body;
  const image = req.file ? req.file.filename : null;

  if (!game_name || !price || !image || !description || !category_id) {
    return res.status(400).json({ error: "กรุณากรอกข้อมูลให้ครบ" });
  }

  const gamePrice = Number(price);
  if (isNaN(gamePrice) || gamePrice < 0) {
    return res.status(400).json({ error: "ราคาต้องเป็นตัวเลขและมากกว่า 0" });
  }

  const release_date = new Date();
  const sale_count = 0;

  const sql = `
    INSERT INTO games (game_name, price, image, description, release_date, sale_count, category_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;
  db.query(sql, [game_name, gamePrice, image, description, release_date, sale_count, category_id], (err, result) => {
    if (err) {
      console.error("❌ Insert game error:", err);
      return res.status(500).json({ error: "Failed to add game" });
    }

    const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000";
    res.json({
      message: "✅ Game added successfully",
      id: result.insertId,
      imageUrl: `${baseUrl}/uploads/${image}`
    });
  });
});


// ------------------- Root -------------------
app.get("/", (req, res) => res.send("✅ GameShop API is running successfully!"));

// ✅ Export สำหรับ Vercel
export default app;
