import express from "express";
import mysql from "mysql2/promise"; // ใช้ promise-based
import cors from "cors";
import bcrypt from "bcrypt";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ------------------- CORS -------------------
app.use(cors({
  origin: "*", // อนุญาตทุก frontend
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

// ------------------- MySQL -------------------
const db = await mysql.createPool({
  host: "202.28.34.210",
  user: "65011212194",
  password: "65011212194",
  database: "db65011212194",
  port: 3309,
  waitForConnections: true,
  connectionLimit: 10,
});

// ------------------- Cloudinary -------------------
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET,
  secure: true
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "gameshop",
    allowed_formats: ["jpg", "png", "jpeg"],
    transformation: [{ width: 500, height: 500, crop: "limit" }],
  },
});

const upload = multer({ storage });

// ------------------- REGISTER -------------------
app.post("/register", upload.single("avatar"), async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password || !req.file) {
      return res.status(400).json({ error: "กรุณากรอกข้อมูลให้ครบและอัปโหลดรูป" });
    }

    // ตรวจสอบ email ซ้ำ
    const [rows] = await db.query("SELECT * FROM users WHERE email = ?", [email]);
    if (rows.length > 0) {
      return res.status(400).json({ error: "อีเมลนี้มีผู้ใช้งานแล้ว" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // URL ของ avatar จาก Cloudinary
    const avatarUrl = req.file.path;

    const type = "user";
    const wallet = 0;

    // บันทึกลง DB
    const [result] = await db.query(
      "INSERT INTO users (name, email, password, type, avatar, wallet) VALUES (?, ?, ?, ?, ?, ?)",
      [name, email, hashedPassword, type, avatarUrl, wallet]
    );

    const uid = result.insertId;
    res.json({
      message: "สมัครสมาชิกสำเร็จ",
      user: { uid, name, email, type, avatar: avatarUrl, wallet }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" });
  }
});

// ------------------- LOGIN -------------------
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "กรุณาใส่ email และ password" });

    const [results] = await db.query("SELECT * FROM users WHERE email = ?", [email]);
    if (results.length === 0) return res.status(404).json({ error: "ไม่พบบัญชีผู้ใช้" });

    const user = results[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: "รหัสผ่านไม่ถูกต้อง" });

    res.json({
      message: "เข้าสู่ระบบสำเร็จ",
      uid: user.uid || user.id,
      name: user.name,
      email: user.email,
      role: user.type,
      avatar: user.avatar
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ------------------- Wallet -------------------
app.post("/wallet", async (req, res) => {
  try {
    const { uid, wallet } = req.body;
    if (!uid || !wallet) return res.status(400).json({ error: "กรุณาระบุ uid และจำนวนเงิน" });

    const amount = Number(wallet);
    if (isNaN(amount) || amount <= 0) return res.status(400).json({ error: "จำนวนเงินไม่ถูกต้อง" });

    const [results] = await db.query("SELECT wallet FROM users WHERE uid = ?", [uid]);
    if (results.length === 0) return res.status(404).json({ error: "ไม่พบผู้ใช้" });

    const newWallet = Number(results[0].wallet) + amount;
    await db.query("UPDATE users SET wallet = ? WHERE uid = ?", [newWallet, uid]);

    res.json({ message: "เติมเงินสำเร็จ", uid, newWallet });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ------------------- Purchase -------------------
app.post("/purchase", async (req, res) => {
  try {
    const { uid, amount } = req.body;
    const gamePrice = Number(amount);
    if (!uid || !amount || isNaN(gamePrice) || gamePrice <= 0) return res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง" });

    const [results] = await db.query("SELECT wallet FROM users WHERE uid = ?", [uid]);
    if (results.length === 0) return res.status(404).json({ error: "ไม่พบผู้ใช้" });

    const currentWallet = Number(results[0].wallet);
    if (currentWallet < gamePrice) return res.status(400).json({ error: "ยอดเงินไม่เพียงพอ" });

    const newWallet = currentWallet - gamePrice;
    await db.query("UPDATE users SET wallet = ? WHERE uid = ?", [newWallet, uid]);
    await db.query("INSERT INTO wallet (uid, type, amount, transaction_date) VALUES (?, 'purchase', ?, NOW())", [uid, gamePrice]);

    res.json({ message: "ชำระเงินสำเร็จ", uid, newWallet });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ------------------- Games -------------------
app.get("/api/games", async (req, res) => {
  try {
    const [results] = await db.query("SELECT * FROM games");
    res.json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/games", upload.single("image"), async (req, res) => {
  try {
    const { game_name, price, description, category_id } = req.body;
    if (!game_name || !price || !description || !category_id || !req.file) {
      return res.status(400).json({ error: "กรุณากรอกข้อมูลให้ครบ" });
    }

    const gamePrice = Number(price);
    if (isNaN(gamePrice) || gamePrice < 0) return res.status(400).json({ error: "ราคาต้องเป็นตัวเลขและมากกว่า 0" });

    const release_date = new Date();
    const sale_count = 0;
    const image = req.file.path;

    const [result] = await db.query(
      "INSERT INTO games (game_name, price, image, description, release_date, sale_count, category_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [game_name, gamePrice, image, description, release_date, sale_count, category_id]
    );

    res.json({ message: "เพิ่มเกมสำเร็จ", id: result.insertId, imageUrl: image });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ------------------- Root -------------------
app.get("/", (req, res) => res.send("✅ GameShop API running"));

// Export สำหรับ Vercel
export default app;
