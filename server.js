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
      wallet: user.wallet,
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

// ------------------- GET ALL GAMES -------------------
app.get("/allgame", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        g.*, 
        c.type AS category_type
      FROM games g
      LEFT JOIN category c ON g.category_id = c.category_id
      ORDER BY g.release_date DESC
    `);

    return res.json({ games: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" });
  }
});

app.get("/searchgame", async (req, res) => {
  try {
    const search = req.query.q || ""; // รับคำค้นจาก query string

    const [rows] = await db.query(
      `
      SELECT 
        g.game_id,
        g.game_name,
        g.price,
        g.image,
        g.release_date,
        g.description,
        g.sale_count,
        c.type AS category_type
      FROM games g
      LEFT JOIN category c ON g.category_id = c.category_id
      WHERE g.game_name LIKE ?
      ORDER BY g.release_date DESC
      `,
      [`%${search}%`]
    );

    res.json({ games: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" });
  }
});

// ------------------- GET TOP SELL -------------------
app.get('/topsell', async (req, res) => {
  try {
    // ดึง top 10 เกมตาม sale_count
    const [rows] = await db.query(`
      SELECT 
        game_id AS gameId,
        game_name,
        price,
        description,
        category_id,
        release_date,
        sale_count,
        image 
      FROM games
      ORDER BY sale_count DESC
      LIMIT 10
    `);

    // กำหนด rank จาก array ฝั่ง Node.js
    let rank = 0;
    let prevCount = null;
    rows.forEach((game, index) => {
      if (game.sale_count !== prevCount) {
        rank = index + 1;
        prevCount = game.sale_count;
      }
      game.rank = rank;
    });

    res.json({ topGames: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post("/code", async (req, res) => {
  const { uid, code } = req.body;

  if (!uid || !code) {
    return res.status(400).json({ error: "กรุณาส่ง uid และ code" });
  }

  try {
    // ดึงข้อมูลโค้ด
    const [rows] = await db.query("SELECT * FROM codes WHERE codename = ?", [code]);
    if (rows.length === 0) {
      return res.status(400).json({ error: "ไม่พบโค้ดนี้" });
    }

    const codeData = rows[0];

    // ✅ แปลง user_use จาก JSON เป็น array
    let usedList = [];
    if (codeData.user_use) {
      try {
        usedList = JSON.parse(codeData.user_use);
        if (!Array.isArray(usedList)) usedList = [];
      } catch {
        usedList = [];
      }
    }

    // ✅ แปลงทุกค่าภายใน array เป็น string เพื่อเทียบง่าย
    usedList = usedList.map(u => String(u));

    // ✅ แปลง uid เป็น string เช่นกัน
    const uidStr = String(uid);

    // ✅ ตรวจสอบว่าซ้ำไหม
    if (usedList.includes(uidStr)) {
      return res.status(400).json({ error: "คุณใช้โค้ดนี้ไปแล้ว" });
    }

    // ✅ เพิ่ม uid ใหม่เข้า array (ถ้าไม่ซ้ำ)
    usedList.push(uidStr);

    // ✅ บันทึกกลับ DB เป็น JSON string
    await db.query(
      "UPDATE codes SET user_use = ? WHERE codename = ?",
      [JSON.stringify(usedList), code]
    );

    // ✅ ส่งเปอร์เซ็นต์ส่วนลดกลับ
    const persen = Number(codeData.persen || 0);
    res.json({ message: "โค้ดผ่าน", persen });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "เกิดข้อผิดพลาดในเซิร์ฟเวอร์" });
  }
});


app.post("/buygame", async (req, res) => {
  const { uid, games, discountCode } = req.body;
  let { totalPrice } = req.body; // may be undefined / string / number

  if (!uid || !games || !Array.isArray(games) || games.length === 0) {
    return res.status(400).json({ error: "กรุณาส่ง uid และเกมที่ต้องการซื้อ" });
  }

  // Helper: safe number parse and round 2 decimals
  const toNumber = (v) => {
    const n = Number(v);
    if (Number.isFinite(n)) {
      return Math.round(n * 100) / 100;
    }
    return NaN;
  };

  try {
    // 0. ดึง wallet ของ user
    const [userRows] = await db.query("SELECT wallet FROM users WHERE uid = ?", [uid]);
    if (!userRows || userRows.length === 0) return res.status(404).json({ error: "ไม่พบผู้ใช้" });

    const rawWallet = userRows[0].wallet;
    const userWallet = toNumber(rawWallet);
    if (isNaN(userWallet)) {
      return res.status(500).json({ error: "ข้อมูล wallet ของผู้ใช้ไม่ถูกต้อง" });
    }

    // 1. ถ้า totalPrice ที่ส่งมามีค่าและเป็นตัวเลขใช้ได้ ให้ใช้ แต่ถ้าไม่ ให้คำนวณจาก games[].price
    let purchaseTotal = toNumber(totalPrice);
    if (isNaN(purchaseTotal)) {
      // คำนวณจาก games[].price (ป้องกันกรณี price เป็น string)
      purchaseTotal = 0;
      for (const g of games) {
        const p = toNumber(g.price);
        if (isNaN(p)) {
          return res.status(400).json({ error: `ข้อมูลราคาของเกม (${g.game_name || g.game_id}) ไม่ถูกต้อง` });
        }
        purchaseTotal += p;
      }
      purchaseTotal = Math.round(purchaseTotal * 100) / 100;
    }

    // 2. ถ้ามี discountCode -> ตรวจหาเปอร์เซ็นต์และใช้ลด (ถ้าจำเป็น)
    let appliedDiscountPercent = 0;
    if (discountCode) {
      const [codeRows] = await db.query("SELECT * FROM codes WHERE codename = ?", [discountCode]);
      if (codeRows.length > 0) {
        const codeData = codeRows[0];

        // อ่าน persen เป็น number
        const persen = toNumber(codeData.persen);
        if (!isNaN(persen) && persen > 0) {
          appliedDiscountPercent = persen;
          // คำนวณ new total
          const discounted = Math.round((purchaseTotal * (100 - persen) / 100) * 100) / 100;
          purchaseTotal = discounted;
        }
      } else {
        // ถ้าโค้ดไม่เจอ เราจะไม่ปฏิเสธการซื้อ — แต่ถ้าต้องการปฏิเสธให้ uncomment บรรทัดนี้:
        // return res.status(400).json({ error: "ไม่พบโค้ดส่วนลด" });
      }
    }

    // 3. ตรวจ purchaseTotal valid และ wallet เพียงพอ
    if (isNaN(purchaseTotal) || purchaseTotal < 0) {
      return res.status(400).json({ error: "ข้อมูลราคาไม่ถูกต้อง" });
    }
    if (userWallet < purchaseTotal) {
      return res.status(400).json({ error: "ยอดเงินในกระเป๋าไม่เพียงพอ" });
    }

    // 4. ตรวจ duplicate (user เคยมีเกมนี้หรือไม่)
    const [orderRows] = await db.query("SELECT game_all FROM orders WHERE user_id = ?", [uid]);
    const purchasedGameIds = new Set();
    orderRows.forEach(row => {
      try {
        const parsed = JSON.parse(row.game_all || "[]");
        if (Array.isArray(parsed)) {
          parsed.forEach(id => purchasedGameIds.add(String(id)));
        }
      } catch {
        // ignore parse errors
      }
    });

    const duplicateGames = games.filter(g => purchasedGameIds.has(String(g.game_id)));
    if (duplicateGames.length > 0) {
      return res.status(400).json({ error: `คุณมีเกมนี้อยู่แล้ว: ${duplicateGames.map(g => g.game_name).join(", ")}` });
    }

    // 5. เริ่ม transaction (ถ้าฐานข้อมูล/driver รองรับ)
    // Using SQL BEGIN / COMMIT / ROLLBACK
    await db.query("START TRANSACTION");

    try {
      // อัปเดต wallet ให้เป็นเลขทศนิยม 2 ตำแหน่ง
      const newWallet = Math.round((userWallet - purchaseTotal) * 100) / 100;
      await db.query("UPDATE users SET wallet = ? WHERE uid = ?", [newWallet, uid]);

      // ถ้ามี discountCode: update user_use (safe normalize)
      if (discountCode) {
        const [codeRows2] = await db.query("SELECT user_use FROM codes WHERE codename = ?", [discountCode]);
        if (codeRows2.length > 0) {
          let usedList = [];
          const raw = codeRows2[0].user_use;
          if (raw) {
            // try parse JSON first
            try {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed)) usedList = parsed.map(x => String(x));
            } catch {
              // if not JSON, try comma-separated
              usedList = String(raw).split(",").map(s => s.trim()).filter(Boolean);
            }
          }
          const uidStr = String(uid);
          if (!usedList.includes(uidStr)) {
            usedList.push(uidStr);
            // save as JSON array (recommended)
            await db.query("UPDATE codes SET user_use = ? WHERE codename = ?", [JSON.stringify(usedList), discountCode]);
          }
        }
      }

      // บันทึก order ใหม่ (game_all เป็น JSON array ของ string)
      const orderDate = new Date();
      const gameIdsArray = games.map(g => String(g.game_id));
      await db.query(
        "INSERT INTO orders (user_id, amount, game_all, order_date) VALUES (?, ?, ?, ?)",
        [uid, games.length, JSON.stringify(gameIdsArray), orderDate]
      );

      // อัปเดต sale_count ของแต่ละเกม (บวก 1 ต่อ 1 game ที่ซื้อ)
      for (const g of games) {
        await db.query(
          "UPDATE games SET sale_count = COALESCE(sale_count, 0) + 1 WHERE game_id = ?",
          [g.game_id]
        );
      }

      // commit transaction
      await db.query("COMMIT");

      // ส่ง response สำเร็จ
      return res.json({
        message: "ซื้อเกมสำเร็จ",
        totalPrice: purchaseTotal,
        newWallet,
        appliedDiscountPercent,
        games: games.map(g => ({ game_id: String(g.game_id), game_name: g.game_name, image: g.image }))
      });
    } catch (txErr) {
      // rollback on any tx error
      await db.query("ROLLBACK");
      console.error("Transaction error:", txErr);
      return res.status(500).json({ error: "เกิดข้อผิดพลาดระหว่างบันทึกคำสั่งซื้อ" });
    }

  } catch (err) {
    console.error("Buygame error:", err);
    return res.status(500).json({ error: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" });
  }
});


app.get("/mygame", async (req, res) => {
  const uid = req.query.uid;
  if (!uid) return res.status(400).json({ error: "กรุณาส่ง uid" });

  try {
    // 1. ดึง order ของ user
    const [orders] = await db.query(
      "SELECT game_all, order_date FROM orders WHERE user_id = ?",
      [uid]
    );

    // 2. รวม game_id ทั้งหมดจากทุก order
    const gameIds = [];
    orders.forEach(order => {
      try {
        const ids = JSON.parse(order.game_all || "[]");
        if (Array.isArray(ids)) ids.forEach(id => gameIds.push(String(id)));
      } catch {}
    });

    if (gameIds.length === 0) return res.json({ games: [] });

    // 3. ดึงรายละเอียดเกมและ category
    const [games] = await db.query(
      `SELECT g.*, c.type as category 
       FROM games g
       LEFT JOIN category c ON g.category_id = c.category_id
       WHERE g.game_id IN (?)`,
      [gameIds]
    );

    // 4. รวม order_date จาก orders
    const gamesWithDate = games.map(g => {
      let purchasedDate = null;
      for (const order of orders) {
        try {
          const ids = JSON.parse(order.game_all || "[]");
          if (Array.isArray(ids) && ids.includes(String(g.game_id))) {
            purchasedDate = order.order_date;
            break;
          }
        } catch {}
      }
      return {
        game_id: String(g.game_id),
        game_name: g.game_name,
        price: g.price,
        category: g.category,   // category type
        description: g.description,
        release_date: g.release_date,
        image: g.image
      };
    });

    res.json({ games: gamesWithDate });

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
  
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" });
  }
});



app.get("/", (req, res) => res.send("✅ GameShop API is running successfully!"));

// **ไม่ต้องใช้ app.listen() สำหรับ Vercel**
export default app;
