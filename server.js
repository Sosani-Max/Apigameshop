import express from "express";
import mysql from "mysql2/promise";
import cors from "cors";
import bcrypt from "bcrypt";
import multer from "multer";

// ------------------- Config -------------------
const app = express();
app.use(cors({ origin: ["http://localhost:4200", "https://apigameshop-2yg2.vercel.app/"] }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ------------------- MySQL Pool -------------------
const pool = mysql.createPool({
  host: "202.28.34.210",
  user: "65011212194",
  password: "65011212194",
  database: "db65011212194",
  port: 3309,
  waitForConnections: true,
  connectionLimit: 10,
});

// ------------------- Multer Memory Storage -------------------
const avatarStorage = multer.memoryStorage();
const uploadAvatar = multer({ storage: avatarStorage });

// ------------------- REGISTER -------------------
app.post("/register", uploadAvatar.single("avatar"), async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const file = req.file;

    if (!name || !email || !password || !file) {
      return res.status(400).json({ error: "กรุณากรอกข้อมูลให้ครบและอัปโหลดรูป" });
    }

    // ตรวจสอบ email ซ้ำ
    const [rows] = await pool.query("SELECT * FROM users WHERE email = ?", [email]);
    if (rows.length > 0) return res.status(400).json({ error: "อีเมลนี้มีผู้ใช้งานแล้ว" });

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // สำหรับ Serverless: บันทึกไฟล์ลง memory หรือส่งไป Cloud (ตัวอย่าง: ใช้ base64 เป็น URL)
    const avatarUrl = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;

    const wallet = 0;
    const type = "user";

    const [result] = await pool.query(
      "INSERT INTO users (name, email, password, type, avatar, wallet) VALUES (?, ?, ?, ?, ?, ?)",
      [name, email, hashedPassword, type, avatarUrl, wallet]
    );

    return res.json({
      message: "สมัครสมาชิกสำเร็จ",
      user: { uid: result.insertId, name, email, type, avatar: avatarUrl, wallet },
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

    const [results] = await pool.query("SELECT * FROM users WHERE email = ?", [email]);
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
      avatarUrl: user.avatar,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" });
  }
});

// ------------------- เติมเงิน -------------------
app.post("/wallet", async (req, res) => {
  try {
    const { uid, wallet } = req.body;
    if (!uid || !wallet) return res.status(400).json({ error: "กรุณาใส่ uid และจำนวนเงินที่ต้องการเติม" });

    const amount = Number(wallet);
    if (isNaN(amount) || amount <= 0) return res.status(400).json({ error: "จำนวนเงินไม่ถูกต้อง" });

    const [results] = await pool.query("SELECT wallet FROM users WHERE uid = ?", [uid]);
    if (results.length === 0) return res.status(404).json({ error: "ไม่พบผู้ใช้" });

    const currentWallet = Number(results[0].wallet) || 0;
    const newWallet = currentWallet + amount;

    await pool.query("UPDATE users SET wallet = ? WHERE uid = ?", [newWallet, uid]);

    res.json({ message: "เติมเงินสำเร็จ", uid, oldWallet: currentWallet, added: amount, newWallet });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" });
  }
});

// ------------------- Purchase -------------------
app.post("/purchase", async (req, res) => {
  try {
    const { uid, amount } = req.body;
    if (!uid || !amount) return res.status(400).json({ error: "กรุณาระบุ uid และจำนวนเงิน" });

    const gamePrice = Number(amount);
    if (isNaN(gamePrice) || gamePrice <= 0) return res.status(400).json({ error: "จำนวนเงินไม่ถูกต้อง" });

    const [results] = await pool.query("SELECT wallet FROM users WHERE uid = ?", [uid]);
    if (results.length === 0) return res.status(404).json({ error: "ไม่พบผู้ใช้" });

    const currentWallet = Number(results[0].wallet) || 0;
    if (currentWallet < gamePrice) return res.status(400).json({ error: "ยอดเงินไม่เพียงพอ" });

    const newWallet = currentWallet - gamePrice;
    await pool.query("UPDATE users SET wallet = ? WHERE uid = ?", [newWallet, uid]);
    await pool.query("INSERT INTO wallet (uid, type, amount, transaction_date) VALUES (?, ?, ?, NOW())", [
      uid,
      "purchase",
      gamePrice,
    ]);

    res.json({ message: "ชำระเงินสำเร็จ", uid, newWallet });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" });
  }
});

// ------------------- ดึงเกม -------------------
app.get("/api/games", async (req, res) => {
  try {
    const [results] = await pool.query("SELECT * FROM games");
    res.json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" });
  }
});

// ------------------- เพิ่มเกม -------------------
const gameStorage = multer.memoryStorage();
const uploadGame = multer({ storage: gameStorage });

app.post("/api/games", uploadGame.single("image"), async (req, res) => {
  try {
    const { game_name, price, description, category_id } = req.body;
    const file = req.file;

    if (!game_name || !price || !description || !category_id || !file) {
      return res.status(400).json({ error: "กรุณากรอกข้อมูลให้ครบ" });
    }

    const gamePrice = Number(price);
    if (isNaN(gamePrice) || gamePrice < 0) return res.status(400).json({ error: "ราคาต้องเป็นตัวเลขและมากกว่า 0" });

    const imageUrl = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
    const release_date = new Date();
    const sale_count = 0;

    const [result] = await pool.query(
      "INSERT INTO games (game_name, price, image, description, release_date, sale_count, category_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
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

// ------------------- Export สำหรับ Vercel -------------------
export default app;
