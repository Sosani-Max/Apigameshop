import express from "express";
import mysql from "mysql2";
import cors from "cors";
import bodyParser from "body-parser";
import bcrypt from "bcrypt";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import streamifier from "streamifier";

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// MySQL connection (promise)
const db = mysql.createPool({
  host: "202.28.34.210",
  user: "65011212194",
  password: "65011212194",
  database: "db65011212194",
  port: 3309,
}).promise();

// Cloudinary config from environment
cloudinary.config({
  cloud_name: "dunl9zkzm",
  api_key: "524477876142682",
  api_secret: "VmIX7sNUs1JD2mN9o906b-DnUoI",
});

// Multer setup (memory storage for Cloudinary upload)
const upload = multer({ storage: multer.memoryStorage() });

// ------------------- REGISTER -------------------
app.post("/register", upload.single("avatar"), async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const file = req.file;

    if (!name || !email || !password || !file) {
      return res.status(400).json({ error: "กรุณากรอกข้อมูลให้ครบและอัปโหลดรูป" });
    }

    // ตรวจสอบ email ซ้ำ
    const [rows] = await db.query("SELECT * FROM users WHERE email = ?", [email]);
    if (rows.length > 0) {
      return res.status(400).json({ error: "อีเมลนี้มีผู้ใช้งานแล้ว" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Upload avatar to Cloudinary
    const uploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: "avatars" },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      streamifier.createReadStream(file.buffer).pipe(stream);
    });

    const avatarUrl = uploadResult.secure_url;
    const wallet = 0;
    const type = "user";

    const [result] = await db.query(
      "INSERT INTO users (name, email, password, type, avatar, wallet) VALUES (?, ?, ?, ?, ?, ?)",
      [name, email, hashedPassword, type, avatarUrl, wallet]
    );

    const sUid = result.insertId;
    return res.json({
      message: "สมัครสมาชิกสำเร็จ",
      user: { uid: sUid, name, email, type, avatar: avatarUrl, wallet },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" });
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
      avatarUrl: user.avatar || null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" });
  }
});
// ------------------- ADD GAME -------------------
app.post("/addgame", upload.single("image"), async (req, res) => {
  try {
    const { game_name, price, description, category_id } = req.body;
    const file = req.file;

    // ตรวจสอบข้อมูลพื้นฐาน
    if (!game_name || !price || !description || !category_id) {
      return res.status(400).json({ error: "กรุณากรอกข้อมูลเกมให้ครบ" });
    }

    // สร้าง release_date แบบสุ่ม (ไม่เกินวันนี้)
    const now = new Date();
    const randomTime = Math.floor(Math.random() * now.getTime());
    const release_date = new Date(randomTime);

    let imageUrl = null;

    // ถ้ามีรูป ให้ upload ไป Cloudinary
    if (file) {
      const uploadResult = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: "games" },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        streamifier.createReadStream(file.buffer).pipe(stream);
      });
      imageUrl = uploadResult.secure_url;
    }

    const sale_count = 0;

    // บันทึกลงฐานข้อมูล
    const [result] = await db.query(
      `INSERT INTO games 
       (game_name, price, description, category_id, release_date, sale_count, image) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [game_name, price, description, category_id, release_date, sale_count, imageUrl]
    );

    const gameId = result.insertId;

    return res.json({
      message: "เพิ่มเกมสำเร็จ",
      game: { id: gameId, game_name, price, description, category_id, release_date, sale_count, image: imageUrl },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" });
  }
});


// ------------------- เติมเงิน -------------------
app.post("/wallet", async (req, res) => {
  try {
    const { uid, wallet } = req.body;
    if (!uid || !wallet) return res.status(400).json({ error: "กรุณาใส่ uid และจำนวนเงินที่ต้องการเติม" });

    const amount = Number(wallet);
    if (isNaN(amount) || amount <= 0) return res.status(400).json({ error: "จำนวนเงินไม่ถูกต้อง" });

    const [rows] = await db.query("SELECT wallet, avatar FROM users WHERE uid = ?", [uid]);
    if (rows.length === 0) return res.status(404).json({ error: "ไม่พบผู้ใช้" });

    const currentWallet = Number(rows[0].wallet) || 0;
    const newWallet = currentWallet + amount;

    await db.query("UPDATE users SET wallet = ? WHERE uid = ?", [newWallet, uid]);

    res.json({
      message: "เติมเงินสำเร็จ",
      uid,
      oldWallet: currentWallet,
      added: amount,
      newWallet,
      avatarUrl: rows[0].avatar || null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" });
  }
});

// ------------------- Root -------------------
app.get("/", (req, res) => res.send("✅ GameShop API is running successfully!"));

export default app;
