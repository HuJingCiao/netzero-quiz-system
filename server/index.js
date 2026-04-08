require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'your_fallback_secret'; // 記得在 .env 設定


const app = express();

app.use(express.json());
app.use(cors());



// 這是你的門禁警衛函數
const authenticateToken = (req, res, next) => {
  // 1. 從 Header 取得通行證 (Bearer TOKEN)
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; 

  // 2. 如果連通行證都沒有，直接攔截
  if (!token) return res.status(401).json({ message: '請先登入系統' });

  // 3. 驗證通行證是否真偽或過期
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: '通行證無效或已過期' });
    
    // 4. 通過驗證！將解密後的用戶資料（如 username）塞進 req 中給後面的 API 使用
    req.user = user; 
    next(); // 准予通行，執行下一個動作
  });
};

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// 取得隨機 10 題 (模擬考 API)
app.get('/api/quiz/random', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, category, question_text, options, law_reference FROM quiz_questions ORDER BY RANDOM() LIMIT 10'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).send('伺服器錯誤');
  }
});

app.post('/api/quiz/submit', authenticateToken, async (req, res) => {
  try {
    // 1. 從請求主體取出 userAnswers
    const { userAnswers } = req.body; 

    // 2. 宣告 ids 變數 (就是這行漏掉了！)
    // 取出所有題目 ID，組成一個陣列，例如 ["1", "5", "10"]
    const ids = Object.keys(userAnswers); 

    // 3. 確保 ids 存在後，才執行資料庫查詢
    const result = await pool.query(
      'SELECT id, category, correct_answer, explanation FROM quiz_questions WHERE id = ANY($1)', 
      [ids]
    );

    const username = req.user.username;
    let score = 0;
    const analysis = {};
    const details = [];

    // 4. 比對邏輯
    result.rows.forEach(q => {
      const isCorrect = userAnswers[q.id] === q.correct_answer;
      if (isCorrect) score += 10;

      if (!analysis[q.category]) analysis[q.category] = { total: 0, correct: 0 };
      analysis[q.category].total++;
      if (isCorrect) analysis[q.category].correct++;

      details.push({
        id: q.id,
        isCorrect,
        userAnswer: userAnswers[q.id],
        correctAnswer: q.correct_answer,
        explanation: q.explanation
      });
    });

    // 5. 寫入歷史紀錄
    await pool.query(
      'INSERT INTO quiz_history (username, score, analysis) VALUES ($1, $2, $3)',
      [username, score, JSON.stringify(analysis)]
    );

    res.json({ score, analysis, details });

  } catch (err) {
    console.error("❌ 提交路由出錯:", err);
    res.status(500).json({ message: '評分失敗', detail: err.message });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1 AND password = $2',
      [username, password]
    );

    if (result.rows.length > 0) {
      const user = result.rows[0];
      // 簽發 Token
      const token = jwt.sign(
        { username: user.username, displayName: user.display_name },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.json({
        message: '登入成功',
        token: token,
        user: { username: user.username, displayName: user.display_name }
      });
    } else {
      res.status(401).json({ message: '帳號或密碼錯誤' });
    }
  } catch (err) {
    res.status(500).json({ message: '伺服器錯誤' });
  }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 測驗系統後端已啟動：${PORT}`));