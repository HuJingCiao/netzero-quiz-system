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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 測驗系統後端已啟動：${PORT}`));