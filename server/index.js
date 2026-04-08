require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());

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

app.post('/api/quiz/submit', async (req, res) => {
  const { userAnswers } = req.body; // 格式: { "1": "A", "2": "C" }
  const ids = Object.keys(userAnswers);

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

    res.json({ score, analysis, details });
  } catch (err) {
    res.status(500).json({ message: '評分失敗' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 測驗系統後端已啟動：${PORT}`));