require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET; // 建議強制從環境變數讀取

// --- 1. 資料庫連線配置 ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// --- 2. 全域中間件 ---
app.use(express.json());
app.use(cors());

// --- 3. 權限驗證中間件 (Auth Guard) ---
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; 

  if (!token) return res.status(401).json({ message: '請先登入系統' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: '通行證無效或已過期' });
    req.user = user; 
    next();
  });
};

// --- 4. 路由定義 (Routes) ---

// [Public] 登入介面
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1 AND password = $2',
      [username, password]
    );

    if (result.rows.length > 0) {
      const user = result.rows[0];
      const token = jwt.sign(
        { username: user.username, displayName: user.display_name },
        JWT_SECRET,
        { expiresIn: '24h' }
      );
      res.json({ message: '登入成功', token, user: { username: user.username, displayName: user.display_name } });
    } else {
      res.status(401).json({ message: '帳號或密碼錯誤' });
    }
  } catch (err) {
    res.status(500).json({ message: '伺服器錯誤' });
  }
});

// [Protected] 取得隨機題目
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

// [Protected] 提交答案並評分

app.post('/api/quiz/submit', authenticateToken, async (req, res) => {
  try {
    const { userAnswers } = req.body; 
    const ids = Object.keys(userAnswers); 

    // 一次性取出所有相關題目，避免迴圈多次查詢資料庫
    const result = await pool.query(
      'SELECT id, category, correct_answer, explanation FROM quiz_questions WHERE id = ANY($1)', 
      [ids]
    );

    const username = req.user.username;
    let score = 0;
    const analysis = {};
    const details = [];

    result.rows.forEach(q => {
      const isCorrect = userAnswers[q.id] === q.correct_answer;
      if (isCorrect) score += 10;

      // 累加分類分析數據
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

    // 存入測驗歷史紀錄
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

// --- 5. 啟動伺服器 ---
app.listen(PORT, () => console.log(`🚀 測驗系統後端已啟動：${PORT}`));