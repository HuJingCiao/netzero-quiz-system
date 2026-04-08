require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'your_fallback_secret'; // 記得在 .env 設定


const app = express();
app.use(cors());
app.use(express.json());



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
  const { userAnswers } = req.body;
  const username = req.user.username; // 從 JWT 取得使用者

  try {
    // 1. 從資料庫抓出這些題目的正確答案與分類
    const query = 'SELECT id, category, correct_answer, explanation FROM quiz_questions WHERE id = ANY($1)';
    const result = await pool.query(query, [ids]);

    let score = 0;
    const analysis = {}; // 用於統計各分類的正確率
    const details = [];  // 用於顯示錯題解析

    result.rows.forEach(q => {
      const isCorrect = userAnswers[q.id] === q.correct_answer;
      if (isCorrect) score += 10; // 假設一題 10 分

      // 2. 分類統計邏輯 (為雷達圖做準備)
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
await pool.query(
      'INSERT INTO quiz_history (username, score, analysis) VALUES ($1, $2, $3)',
      [username, score, JSON.stringify(analysis)]
    );

    res.json({ score, analysis, details });
  } catch (err) {
    res.status(500).json({ message: '紀錄儲存失敗' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 測驗系統後端已啟動：${PORT}`));