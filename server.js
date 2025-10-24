import express from "express";
import mysql from "mysql2";
import cors from "cors";
import bodyParser from "body-parser";
import bcrypt from "bcrypt";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";

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

const app = express();
app.use(cors({
  origin: ["http://localhost:4200"],
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ------------------- Cloudinary -------------------
cloudinary.config({
  cloud_name: "dunl9zkzm",
  api_key: "524477876142682",
  api_secret: "VmIX7sNUs1JD2mN9o906b-DnUoI",
});

// Storage สำหรับ Multer + Cloudinary
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "gameshop",
    allowed_formats: ["jpg", "png", "jpeg"]
  },
});
const upload = multer({ storage });

// ------------------- REGISTER -------------------
app.post("/register", upload.single("avatar"), async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const file = req.file;

    if (!name || !email || !password || !file) {
      return res.status(400).json({ error: "กรุณากรอกข้อมูลให้ครบและอัปโหลดรูป" });
    }

    const [rows] = await db.promise().query("SELECT * FROM users WHERE email = ?", [email]);
    if (rows.length > 0) return res.status(400).json({ error: "อีเมลนี้มีผู้ใช้งานแล้ว" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const avatarUrl = file.path; // ใช้ URL จาก Cloudinary
    const wallet = 0;
    const type = "user";

    const [result] = await db.promise().query(
      "INSERT INTO users (name, email, password, type, avatar, wallet) VALUES (?, ?, ?, ?, ?, ?)",
      [name, email, hashedPassword, type, avatarUrl, wallet]
    );

    const sUid = result.insertId;
    return res.json({
      message: "สมัครสมาชิกสำเร็จ",
      user: { uid: sUid, name, email, type, avatar: avatarUrl, wallet }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" });
  }
});

// ------------------- LOGIN -------------------
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "กรุณาใส่ email และ password" });

  const [results] = await db.promise().query("SELECT * FROM users WHERE email = ?", [email]);
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
    avatarUrl: user.avatar || null
  });
});

// ------------------- เพิ่มเกม -------------------
app.post("/api/games", upload.single("image"), async (req, res) => {
  try {
    const { game_name, price, description, category_id } = req.body;
    const file = req.file;

    if (!game_name || !price || !description || !category_id || !file) {
      return res.status(400).json({ error: "กรุณากรอกข้อมูลให้ครบ" });
    }

    const gamePrice = Number(price);
    if (isNaN(gamePrice) || gamePrice < 0) return res.status(400).json({ error: "ราคาต้องเป็นตัวเลขและมากกว่า 0" });

    const release_date = new Date();
    const sale_count = 0;
    const imageUrl = file.path; // ใช้ URL จาก Cloudinary

    const [result] = await db.promise().query(
      `INSERT INTO games (game_name, price, image, description, release_date, sale_count, category_id) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [game_name, gamePrice, imageUrl, description, release_date, sale_count, category_id]
    );

    res.json({ message: "✅ Game added successfully", id: result.insertId, imageUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to add game" });
  }
});

// ------------------- Root -------------------
app.get("/", (req, res) => res.send("✅ GameShop API is running successfully!"));

export default app;
