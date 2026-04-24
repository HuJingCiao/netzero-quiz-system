require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function importData() {
  try {
    const data = JSON.parse(fs.readFileSync('./questions.json', 'utf8'));
    console.log(`📦 偵測到 ${data.length} 題，開始處理...`);

    for (const q of data) {
      // 關鍵修復點：直接檢查並轉換 options
      // 如果 options 已經是物件，就轉字串；如果不是，給予空物件防止崩潰
      const optionsString = typeof q.options === 'object' 
        ? JSON.stringify(q.options) 
        : JSON.stringify({});

      const query = `
        INSERT INTO quiz_questions (
          subject_id, chapter, category, question_text, options, correct_answer, explanation
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `;
      
      const values = [
        q.subject_id || 1,        // 若沒填則預設為考科一
        q.chapter || '未分類',     // 若沒填則預設
        q.category || '一般',
        q.question_text,
        optionsString,            // 這裡直接用我們處理好的字串
        q.correct_answer,
        q.explanation
      ];

      await pool.query(query, values);
    }

    console.log('✅ 匯入成功！您可以去資料庫查看數據了。');
  } catch (err) {
    console.error('❌ 匯入失敗，錯誤細節：', err.message);
  } finally {
    await pool.end();
  }
}

importData();