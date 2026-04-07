require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const importData = async () => {
  try {
    const rawData = fs.readFileSync('./questions.json', 'utf8');
    const questions = JSON.parse(rawData);

    console.log(`🚀 偵測到 ${questions.length} 題，準備匯入...`);

    for (const q of questions) {
      // 1. 格式化選項：將 ["A", "B", "C", "D"] 轉成 [{label: 'A', text: '...'}, ...]
      const formattedOptions = q.options.map((opt, index) => ({
        label: String.fromCharCode(65 + index), // 產生 A, B, C, D
        text: opt
      }));

      // 2. 執行插入 (注意這裡改用 q.question_text)
      await pool.query(
        `INSERT INTO quiz_questions (category, question_text, options, correct_answer, explanation, law_reference, difficulty) 
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          q.category, 
          q.question_text,        // 👈 修正點：對應 AI 的欄位名
          JSON.stringify(formattedOptions), 
          q.correct_answer,      // 👈 修正點：對應 AI 的欄位名
          q.explanation, 
          q.law_reference,
          q.difficulty || '中'
        ]
      );
    }
    console.log('✅ 恭喜！題庫已成功與資料庫同步。');
    process.exit();
  } catch (err) {
    console.error('❌ 匯入失敗，錯誤細節：', err.message);
    process.exit(1);
  }
};

importData();