import express from 'express';
import mysql from 'mysql2';
import cors from 'cors';
import bodyParser from 'body-parser';
import bcrypt from 'bcrypt';
import multer from 'multer';

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ✅ Route ทดสอบ (Root)
app.get('/', (req, res) => {
  res.send('🚀 API is running successfully on Vercel!');
});

// ⚠️ Vercel ไม่มีพื้นที่เก็บไฟล์ถาวร
// ดังนั้นจะใช้ memory storage แทน (ถ้าอยากเก็บถาวรควรใช้ Cloud storage)
const upload = multer({ storage: multer.memoryStorage() });

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

// ✅ REGISTER (mock avatar)
app.post('/register', upload.single('avatar'), async (req, res) => {
  const { name, email, password } = req.body;
  const avatar = req.file ? req.file.originalname : null;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'กรุณาใส่ name, email และ password' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const query = 'INSERT INTO users (name, email, password, type, avatar) VALUES (?, ?, ?, ?, ?)';
    db.query(query, [name, email, hashedPassword, 'user', avatar], (err, result) => {
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

// ✅ LOGIN
app.post('/login', (req, res) => {
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

    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';

    res.json({
      message: 'เข้าสู่ระบบสำเร็จ',
      uid: user.id,
      name: user.name,
      email: user.email,
      role: user.type,
      avatarUrl: user.avatar ? `${baseUrl}/uploads/${user.avatar}` : null,
    });
  });
});

// API เติมเงิน
app.post('/wallet', (req, res) => {
  const { uid, wallet } = req.body;

  if (!uid || !wallet) {
    return res.status(400).json({ error: 'กรุณาใส่ uid และจำนวนเงินที่ต้องการเติม' });
  }

  // ตรวจสอบว่าจำนวนเงินเป็นตัวเลขบวก
  if (isNaN(wallet) || wallet <= 0) {
    return res.status(400).json({ error: 'จำนวนเงินไม่ถูกต้อง' });
  }

  // ดึงยอดเงินปัจจุบันของผู้ใช้
  const querySelect = 'SELECT wallet FROM users WHERE uid = ?';
  db.query(querySelect, [uid], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (results.length === 0) return res.status(400).json({ error: 'ไม่พบผู้ใช้' });

    const currentWallet = results[0].wallet || 0;
    const newWallet = currentWallet + Number(wallet);

    // อัปเดตยอดเงิน
    const queryUpdate = 'UPDATE users SET wallet = ? WHERE uid = ?';
    db.query(queryUpdate, [newWallet, uid], (err2) => {
      if (err2) return res.status(500).json({ error: err2.message });

      res.json({
        message: 'เติมเงินสำเร็จ',
        uid: uid,
        newWallet: newWallet,
      });
    });
  });
});


// ✅ export app สำหรับ Vercel (แทนการใช้ app.listen)
export default app;
