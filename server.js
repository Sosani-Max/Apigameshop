import express from 'express';
import mysql from 'mysql2';
import cors from 'cors';
import bodyParser from 'body-parser';
import bcrypt from 'bcrypt';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// ✅ สร้าง __filename / __dirname (สำหรับ ES Module)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ✅ Route ทดสอบ (Root)
app.get('/', (req, res) => {
  res.send('🚀 API is running successfully on Vercel!');
});

// ✅ โฟลเดอร์อัปโหลด (เฉพาะตอนรัน local)
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + file.originalname.replace(/\s+/g, '-');
    cb(null, uniqueName);
  }
});
const upload = multer({ storage });

// ✅ ให้เข้าถึงไฟล์ /uploads ได้ (เฉพาะ local)
app.use('/uploads', express.static(uploadDir));

// ✅ เชื่อมต่อฐานข้อมูล MySQL
const db = mysql.createConnection({
  host: '202.28.34.210',
  user: '65011212194',
  password: '65011212194',
  database: 'db65011212194',
  port: 3309,
});

db.connect(err => {
  if (err) console.error('❌ Database connection failed:', err.message);
  else console.log('✅ Connected to MySQL database');
});

// ------------------- REGISTER -------------------
app.post('/register', upload.single('avatar'), async (req, res) => {
  const { name, email, password } = req.body;
  const avatar = req.file ? req.file.filename : null;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'กรุณาใส่ name, email และ password' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const sql = 'INSERT INTO users (name, email, password, type, avatar) VALUES (?, ?, ?, ?, ?)';
    db.query(sql, [name, email, hashedPassword, 'user', avatar], (err, result) => {
      if (err) return res.status(500).json({ error: err.message });

      const baseUrl = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : 'http://localhost:3000';

      res.json({
        message: 'สมัครผู้ใช้เรียบร้อยแล้ว',
        uid: result.insertId,
        name,
        email,
        type: 'user',
        avatarUrl: avatar ? `${baseUrl}/uploads/${avatar}` : null,
      });
    });
  } catch (error) {
    console.error('❌ Hash error:', error.message);
    res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
  }
});

// ------------------- LOGIN -------------------
app.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) return res.status(400).json({ error: 'กรุณาใส่ email และ password' });

  const sql = 'SELECT * FROM users WHERE email = ?';
  db.query(sql, [email], async (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (results.length === 0) return res.status(400).json({ error: 'ไม่พบบัญชีผู้ใช้' });

    const user = results[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ error: 'รหัสผ่านไม่ถูกต้อง' });

    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';

    res.json({
      message: 'เข้าสู่ระบบสำเร็จ',
      uid: user.uid || user.id,
      name: user.name,
      email: user.email,
      role: user.type,
      avatarUrl: user.avatar ? `${baseUrl}/uploads/${user.avatar}` : null,
    });
  });
});

// ------------------- เติมเงิน -------------------
app.post('/wallet', (req, res) => {
  const { uid, wallet } = req.body;
  if (!uid || !wallet) return res.status(400).json({ error: 'กรุณาใส่ uid และจำนวนเงินที่ต้องการเติม' });

  const amount = Number(wallet);
  if (isNaN(amount) || amount <= 0) return res.status(400).json({ error: 'จำนวนเงินไม่ถูกต้อง' });

  const sqlSelect = 'SELECT wallet, avatar FROM users WHERE uid = ?';
  db.query(sqlSelect, [uid], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (results.length === 0) return res.status(400).json({ error: 'ไม่พบผู้ใช้' });

    const currentWallet = Number(results[0].wallet) || 0;
    const newWallet = currentWallet + amount;

    const sqlUpdate = 'UPDATE users SET wallet = ? WHERE uid = ?';
    db.query(sqlUpdate, [newWallet, uid], (err2, updateResult) => {
      if (err2) return res.status(500).json({ error: err2.message });
      if (updateResult.affectedRows === 0) return res.status(400).json({ error: 'อัปเดตยอดเงินไม่สำเร็จ' });

      const baseUrl = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : 'http://localhost:3000';

      res.json({
        message: 'เติมเงินสำเร็จ',
        uid,
        oldWallet: currentWallet,
        added: amount,
        newWallet,
        avatarUrl: results[0].avatar ? `${baseUrl}/uploads/${results[0].avatar}` : null,
      });
    });
  });
});

// ------------------- เพิ่มเกมใหม่ -------------------
app.post('/api/games', (req, res) => {
  const { game_name, price, image, description, release_date, sale_count, category_id } = req.body;

  if (!game_name || !price || !image || !description || !category_id) {
    return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบ' });
  }

  const sql = 'INSERT INTO games (game_name, price, image, description, release_date, sale_count, category_id) VALUES (?, ?, ?, ?, ?, ?, ?)';
  db.query(sql, [game_name, price, image, description, release_date, sale_count, category_id], (err, result) => {
    if (err) {
      console.error('❌ Insert error:', err);
      res.status(500).json({ error: 'Failed to add game' });
    } else {
      const baseUrl = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : 'http://localhost:3000';

      res.json({
        message: '✅ Game added successfully',
        id: result.insertId,
        imageUrl: `${baseUrl}/${image}`
      });
    }
  });
});

// ✅ อย่ารัน app.listen() ใน Vercel — export แทน
export default app;
