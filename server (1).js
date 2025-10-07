import express from 'express';
import mysql from 'mysql2';
import cors from 'cors';
import bodyParser from 'body-parser';
import bcrypt from 'bcrypt';
import multer from 'multer';
import fs from 'fs';

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ✅ เสิร์ฟไฟล์รูปจากโฟลเดอร์ uploads
app.use('/uploads', express.static('uploads'));

// ✅ ตั้งค่า multer สำหรับอัปโหลดรูป
const uploadDir = './uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + file.originalname;
    cb(null, uniqueName);
  },
});
const upload = multer({ storage });

// ✅ เชื่อมต่อฐานข้อมูล MySQL
const db = mysql.createConnection({
  host: '202.28.34.210',
  user: '65011212194',
  password: '65011212194',
  database: 'db65011212194',
  port: 3309,
});

db.connect((err) => {
  if (err) console.error('❌ Database connection failed:', err.message);
  else console.log('✅ Connected to MySQL database');
});

// ✅ REGISTER (มี avatar)
app.post('/api/register', upload.single('avatar'), async (req, res) => {
  const { name, email, password } = req.body;
  const avatar = req.file ? req.file.filename : null;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'กรุณาใส่ name, email และ password' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const query = 'INSERT INTO users (name, email, password, type, avatar) VALUES (?, ?, ?, ?, ?)';
    db.query(query, [name, email, hashedPassword, 'user', avatar], (err, result) => {
      if (err) return res.status(500).json({ error: err.message });

      res.json({
        message: 'สมัครผู้ใช้เรียบร้อยแล้ว',
        uid: result.insertId,
        name,
        email,
        type: 'user',
        avatarUrl: avatar ? `http://localhost:3000/uploads/${avatar}` : null,
      });
    });
  } catch (error) {
    console.error('❌ Hash error:', error.message);
    res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
  }
});

// ✅ LOGIN (ดึง avatar ด้วย)
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'กรุณาใส่ email และ password' });
  }

  const query = 'SELECT * FROM users WHERE email = ?';
  db.query(query, [email], async (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (results.length === 0) return res.status(400).json({ error: 'ไม่พบบัญชีผู้ใช้' });

    const user = results[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ error: 'รหัสผ่านไม่ถูกต้อง' });

    res.json({
      message: 'เข้าสู่ระบบสำเร็จ',
      uid: user.id,
      name: user.name,
      email: user.email,
      role: user.type,
      avatarUrl: user.avatar ? `http://localhost:3000/uploads/${user.avatar}` : null,
    });
  });
});

// ✅ NEW: API ดึงข้อมูลผู้ใช้ (เพื่อให้หน้า Homelogin ใช้)
app.get('/api/user/:id', (req, res) => {
  const userId = req.params.id;
  const query = 'SELECT id, name, email, type, avatar FROM users WHERE id = ?';

  db.query(query, [userId], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (results.length === 0) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });

    const user = results[0];
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      type: user.type,
      avatarUrl: user.avatar ? `http://localhost:3000/uploads/${user.avatar}` : null,
    });
  });
});

// ✅ ดึงสินค้าทั้งหมด (products)
app.get('/api/products', (req, res) => {
  const query = 'SELECT * FROM products';
  db.query(query, (err, results) => {
    if (err) {
      console.error('❌ Database query error:', err.message);
      return res.status(500).json({ error: 'Database query failed' });
    }
    res.json(results);
  });
});

// ✅ UPDATE PROFILE (แก้ไขชื่อ อีเมล รหัสผ่าน และอัปโหลดรูปได้)
app.put('/api/user/:id', upload.single('avatar'), async (req, res) => {
  const userId = req.params.id;
  const { name, email, password } = req.body;
  const avatar = req.file ? req.file.filename : null;

  // ดึงข้อมูลผู้ใช้ปัจจุบันมาก่อน (เพื่อจะได้รู้ว่า avatar เดิมชื่ออะไร)
  db.query('SELECT * FROM users WHERE id = ?', [userId], async (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (results.length === 0) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });

    const oldUser = results[0];
    let hashedPassword = oldUser.password;

    // ถ้ามี password ใหม่ ให้เข้ารหัสใหม่
    if (password && password.trim() !== '') {
      hashedPassword = await bcrypt.hash(password, 10);
    }

    // ถ้ามีรูปใหม่ ให้ลบรูปเก่าทิ้ง (ถ้ามี)
    let finalAvatar = oldUser.avatar;
    if (avatar) {
      if (oldUser.avatar && fs.existsSync(`./uploads/${oldUser.avatar}`)) {
        fs.unlinkSync(`./uploads/${oldUser.avatar}`);
      }
      finalAvatar = avatar;
    }

    const updateQuery = `
      UPDATE users
      SET name = ?, email = ?, password = ?, avatar = ?
      WHERE id = ?
    `;
    db.query(updateQuery, [name, email, hashedPassword, finalAvatar, userId], (err) => {
      if (err) return res.status(500).json({ error: err.message });

      res.json({
        message: 'อัปเดตโปรไฟล์สำเร็จ',
        id: userId,
        name,
        email,
        avatarUrl: finalAvatar ? `http://localhost:3000/uploads/${finalAvatar}` : null
      });
    });
  });
});

// ✅ START SERVER
const PORT = 3000;
app.listen(PORT, () => console.log(`🚀 Backend API running at http://localhost:${PORT}`));
