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
  const { subject } = req.query; // 接收 ?subject=1 或 2
  try {
    const result = await pool.query(
      'SELECT id, category, chapter, question_text, options FROM quiz_questions WHERE subject_id = $1 ORDER BY RANDOM() LIMIT 10',
      [subject]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).send('伺服器錯誤'); }
});

// [Protected] 提交答案並評分

app.post('/api/quiz/submit', authenticateToken, async (req, res) => {
    const { userAnswers } = req.body;
    const userId = req.user.id;
    const username = req.user.username; // 從 JWT 取得名稱

    try {
        // 1. 取得這批題目的正確答案與章節
        const questionIds = Object.keys(userAnswers);
        const { rows: questions } = await pool.query(
            'SELECT id, subject_id, chapter, correct_answer FROM quiz_questions WHERE id = ANY($1)',
            [questionIds]
        );

        const subjectId = questions[0]?.subject_id || 1;
        let correctCount = 0;
        const sessionResults = [];

        // 2. 逐題比對並準備更新統計
        for (const q of questions) {
            const isCorrect = userAnswers[q.id] === q.correct_answer;
            if (isCorrect) correctCount++;

            // 更新或插入累積數據 (Upsert 語法)
            await pool.query(`
                INSERT INTO user_stats (user_id, subject_id, chapter, total_answered, total_correct)
                VALUES ($1, $2, $3, 1, $4)
                ON CONFLICT (user_id, subject_id, chapter)
                DO UPDATE SET 
                    total_answered = user_stats.total_answered + 1,
                    total_correct = user_stats.total_correct + $4
            `, [userId, subjectId, q.chapter, isCorrect ? 1 : 0]);
        }

        // 3. 撈出該考科「所有章節」的累積正確率
        const { rows: cumulativeStats } = await pool.query(
            'SELECT chapter, total_answered, total_correct FROM user_stats WHERE user_id = $1 AND subject_id = $2',
            [userId, subjectId]
        );

        // 格式化雷達圖數據
        const analysis = cumulativeStats.map(row => ({
            chapter: row.chapter,
            // 計算累積正確率：(總答對 / 總答題) * 100
            accuracy: Math.round((row.total_correct / row.total_answered) * 100)
        }));

        res.json({
            username: username, // 功能 1: 回傳名稱
            score: Math.round((correctCount / questions.length) * 100),
            analysis: analysis // 功能 2: 回傳累積正確率
        });

    } catch (err) {
        console.error(err);
        res.status(500).send('結算失敗');
    }
});

// --- 5. 啟動伺服器 ---
app.listen(PORT, () => console.log(`🚀 測驗系統後端已啟動：${PORT}`));