<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import axios from 'axios'
import {
  showToast,
  showLoadingToast,
  closeToast,
  showSuccessToast, // 👈 補齊引入
  showFailToast     // 👈 補齊引入
} from 'vant'
import { Radar } from 'vue-chartjs'
import {
  Chart as ChartJS, Title, Tooltip, Legend,
  PointElement, LineElement, RadialLinearScale, Filler
} from 'chart.js'

ChartJS.register(Title, Tooltip, Legend, PointElement, LineElement, RadialLinearScale, Filler)

// --- 響應式狀態 ---
const isLogin = ref(false)
const isFinished = ref(false)
const loading = ref(true)
const loginForm = ref({ username: '', password: '' })
const quizList = ref([])
const currentIndex = ref(0)
const userAnswers = ref({})
const resultData = ref(null)
const activeNames = ref(['0']) // 👈 補齊這個變數
const appState = ref('login'); // 狀態：login | lobby | quiz | result
const selectedSubject = ref(null); // 選中的考科：1 或 2

const API_BASE = window.location.hostname === 'localhost'
  ? "http://localhost:3000/api"
  : "https://netzero-quiz-system.onrender.com/api";

const STORAGE_KEY = "quiz_token";
// --- 監聽器：持久化作答進度 ---
watch(userAnswers, (newVal) => {
  localStorage.setItem('temp_answers', JSON.stringify(newVal))
}, { deep: true })

watch(currentIndex, (newVal) => {
  localStorage.setItem('temp_index', newVal)
})

// --- 動作 (Actions) ---
const handleLogin = async () => {
  try {
    const res = await axios.post(`${API_BASE}/login`, loginForm.value);
    localStorage.setItem(STORAGE_KEY, res.data.token);
    isLogin.value = true;

    // 登入成功後，不直接考試，而是進入「大廳」
    appState.value = 'lobby';
  } catch (err) {
    showFailToast('登入失敗，請檢查帳號密碼');
  }
};

const checkLogin = () => {
  const token = localStorage.getItem(STORAGE_KEY);
  if (token) {
    isLogin.value = true;
    appState.value = 'lobby'; // 有 Token 就直接進大廳
  }
};

const fetchQuiz = async () => {
  loading.value = true
  showLoadingToast({ message: '讀取題庫中...', forbidClick: true })
  try {
    const res = await axios.get(`${API_BASE}/quiz/random`)
    quizList.value = res.data
  } catch (err) {
    showToast('連線失敗，請檢查後端')
  } finally {
    loading.value = false
    closeToast()
  }
}

const startQuiz = async (subjectId) => {
  selectedSubject.value = subjectId;
  const loading = showLoadingToast({
    message: '正在組卷中...',
    forbidClick: true,
    duration: 0 // 讓它不要自動消失
  });

  try {
    const token = localStorage.getItem(STORAGE_KEY);
    // 注意這裡！我們把選中的 subjectId 傳給後端
    const res = await axios.get(`${API_BASE}/quiz/random?subject=${subjectId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    quizList.value = res.data;
    currentIndex.value = 0;
    userAnswers.value = {};



    // 拿到題目後，才正式進入「quiz」狀態
    loading.close(); // 手動關閉
    appState.value = 'quiz';
  } catch (err) {
    loading.close();
    showFailToast('抓取題目失敗');
  }
};

const submitQuiz = async () => {
  // 1. 檢查是否所有題目都寫了（選填，視妳的規則而定）
  const answeredCount = Object.keys(userAnswers.value).length;
  if (answeredCount < quizList.value.length) {
    if (!confirm('還有題目沒寫完，確定要送出嗎？')) return;
  }

  showLoadingToast({ message: '評分中...', forbidClick: true });

  try {
    const token = localStorage.getItem(STORAGE_KEY);

    // 2. 將答案送到後端
    const res = await axios.post(
      `${API_BASE}/quiz/submit`,
      { userAnswers: userAnswers.value },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    // 3. 接收後端算好的結果 (包含 score, analysis, details)
    resultData.value = res.data;

    // 4. 切換狀態到「結果頁面」
    appState.value = 'result';

    showSuccessToast('評分完成！');
  } catch (err) {
    console.error('提交失敗:', err);
    showFailToast('送出失敗，請檢查網路連線');
  }
};


// 換題控制
const next = () => { if (currentIndex.value < quizList.value.length - 1) currentIndex.value++ }
const prev = () => { if (currentIndex.value > 0) currentIndex.value-- }

const handleLogout = () => {
  localStorage.removeItem(STORAGE_KEY);
  isLogin.value = false;
  appState.value = 'login';
}

// 初始化
onMounted(async () => {
  checkLogin();
  const token = localStorage.getItem(STORAGE_KEY)
  if (token) {
    isLogin.value = true
    await fetchQuiz()

    const savedAnswers = localStorage.getItem('temp_answers')
    const savedIndex = localStorage.getItem('temp_index')
    if (savedAnswers) userAnswers.value = JSON.parse(savedAnswers)
    if (savedIndex) currentIndex.value = parseInt(savedIndex)
  }
})

// --- 計算屬性 ---
const currentQuestion = computed(() => quizList.value[currentIndex.value] || {})
const progress = computed(() =>
  quizList.value.length ? Math.round(((currentIndex.value + 1) / quizList.value.length) * 100) : 0
)

const updateChart = () => {
  if (!chartCanvas.value) return;

  const ctx = chartCanvas.value.getContext('2d');
  
  // 動態抓取後端回傳的章節名稱與正確率
  const labels = resultData.value.analysis.map(item => item.chapter);
  const data = resultData.value.analysis.map(item => item.accuracy);

  if (radarChart) radarChart.destroy();

  radarChart = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: labels, // 自動根據考科顯示對應章節
      datasets: [{
        label: '累積正確率 (%)',
        data: data,
        backgroundColor: 'rgba(25, 137, 250, 0.2)',
        borderColor: 'rgba(25, 137, 250, 1)',
        pointBackgroundColor: 'rgba(25, 137, 250, 1)',
      }]
    },
    options: {
      scales: {
        r: {
          min: 0,
          max: 100,
          ticks: { stepSize: 20 }
        }
      }
    }
  });
};
</script>

<template>
  <div class="app-container">

    <!-- 登入頁面 -->
    <div v-if="appState === 'login'" class="login-container">

      <div class="logo-area">
        <div class="logo-placeholder">
          <van-icon name="shield-check" size="64" color="#1989fa" />
        </div>
        <h2 class="welcome-title">淨零碳管理師測驗</h2>
        <p class="welcome-subtitle">專業知識．模擬實戰</p>
      </div>

      <div class="login-card">
        <van-cell-group inset>
          <van-field v-model="loginForm.username" label="帳號" placeholder="請輸入帳號" left-icon="user-o" />
          <van-field v-model="loginForm.password" type="password" label="密碼" placeholder="請輸入密碼" left-icon="lock" />
        </van-cell-group>

        <div class="login-action">
          <van-button round block type="primary" @click="handleLogin" class="login-submit-btn">
            立即登入
          </van-button>
        </div>
      </div>

    </div>

    <!-- 大廳頁面 -->
    <div v-else-if="appState === 'lobby'" class="lobby-container">
      <div class="lobby-header">
        <h2>淨零管理師模擬系統</h2>
        <p>請選擇測驗科目</p>
      </div>

      <div class="subject-grid">
        <div class="subject-card" @click="startQuiz(1)">
          <van-icon name="notes-o" size="40" color="#1989fa" />
          <div class="card-title">考科一</div>
          <div class="card-desc">基礎與永續</div>
        </div>

        <div class="subject-card" @click="startQuiz(2)">
          <van-icon name="records-o" size="40" color="#07c160" />
          <div class="card-title">考科二</div>
          <div class="card-desc">盤查與實務</div>
        </div>
      </div>

      <div class="lobby-footer">
        <van-button plain hair-line type="danger" size="small" @click="handleLogout">
          登出系統
        </van-button>
      </div>
    </div>


    <!-- 測驗頁面 -->
    <div v-else-if="appState === 'quiz'" class="quiz-section">
      <div class="quiz-app">
        <van-nav-bar title="淨零碳管理師測驗" fixed placeholder />

        <div class="quiz-header">
          <van-tag type="primary">考科 {{ selectedSubject }}</van-tag>
          <span>{{ currentQuestion?.category || '測驗進行中' }}</span>
        </div>

        <div class="header">
          <van-progress :percentage="progress" stroke-width="8" pivot-text="" color="#07c160" />
          <p class="count">第 {{ currentIndex + 1 }} / {{ quizList.length }} 題</p>
        </div>

        <div v-if="!loading && quizList.length > 0" class="main-card">
          <div class="q-box">
            <van-tag type="success" size="medium">{{ currentQuestion.category }}</van-tag>
            <h2 class="q-title">{{ currentQuestion.question_text }}</h2>
          </div>
          <van-radio-group v-model="userAnswers[currentQuestion.id]">
            <van-cell-group inset>
              <van-cell v-for="(text, label) in currentQuestion.options" :key="label" :title="`${label}. ${text}`"
                clickable @click="userAnswers[currentQuestion.id] = label">
                <template #right-icon>
                  <van-radio :name="label" />
                </template>
              </van-cell>
            </van-cell-group>
          </van-radio-group>
        </div>

        <div class="footer">
          <van-button round plain type="success" @click="prev" :disabled="currentIndex === 0">上一題</van-button>
          <van-button v-if="currentIndex < quizList.length - 1" round type="success" @click="next"
            :disabled="!userAnswers[currentQuestion.id]">下一題</van-button>
          <van-button v-else round type="primary" @click="submitQuiz"
            :disabled="!userAnswers[currentQuestion.id]">送出結果</van-button>
        </div>
      </div>
    </div>

    <!-- 結果頁面 -->
    <div v-else-if="appState === 'result'" class="result-section">
      <div class="result-page">
       <div class="result-header">
          <h2>測驗報告 - {{ resultData.username }}</h2>
          <div class="final-score">{{ resultData.score }} 分</div>
        </div>
        <div class="score-section" v-if="resultData">
          <van-circle v-model:current-rate="resultData.score" :rate="resultData.score" :text="resultData.score + '分'"
            stroke-width="60" color="#07c160" />
          <h3>{{ resultData.score >= 60 ? '恭喜及格！' : '仍需努力！' }}</h3>
        </div>

        <div class="chart-section" v-if="chartData">
          <p class="section-title">弱點分析圖</p>
          <Radar :data="chartData" :options="{ responsive: true }" />
        </div>

        <div class="detail-list" v-if="resultData">
          <van-divider>錯題解析</van-divider>
          <van-collapse v-model="activeNames">
            <van-collapse-item v-for="(item, idx) in resultData.details" :key="idx" :title="'第 ' + (idx + 1) + ' 題'"
              :value="item.isCorrect ? '正確' : '錯誤'" :value-class="item.isCorrect ? 'text-success' : 'text-danger'">
              <p>你的答案：{{ item.userAnswer }} / 正確答案：{{ item.correctAnswer }}</p>
              <p class="explanation">解析：{{ item.explanation }}</p>
            </van-collapse-item>
          </van-collapse>
        </div>
        <div style="padding: 16px;">
          <van-button block type="primary" @click="appState = 'lobby'" style="margin-bottom: 10px;">回到大廳</van-button>
          <van-button block type="success" @click="window.location.reload()">重新載入</van-button>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
/* (保持原本樣式不變) */
.quiz-app {
  min-height: 100vh;
  background-color: #f7f8fa;
  padding-bottom: 80px;
}

.header {
  background: white;
  padding: 20px;
  text-align: center;
}

.count {
  font-size: 12px;
  color: #969799;
  margin-top: 10px;
}

.main-card {
  margin-top: 10px;
}

.q-box {
  padding: 20px;
}

.q-title {
  font-size: 18px;
  margin-top: 12px;
  line-height: 1.6;
}

.footer {
  position: fixed;
  bottom: 0;
  width: 100%;
  background: white;
  padding: 15px 0;
  display: flex;
  justify-content: space-around;
  box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.05);
}

.van-button {
  width: 40%;
}

.score-section {
  text-align: center;
  padding: 30px;
  background: white;
}

.chart-section {
  background: white;
  padding: 20px;
  margin-top: 10px;
}

.section-title {
  text-align: center;
  font-weight: bold;
  margin-bottom: 10px;
}

.text-success {
  color: #07c160;
}

.text-danger {
  color: #ee0a24;
}

.explanation {
  font-size: 13px;
  color: #666;
  background: #f9f9f9;
  padding: 8px;
  margin-top: 5px;
}

.welcome-box {
  padding: 30px 20px;
  text-align: center;
  background: #f7f8fa;
  margin-bottom: 20px;
}

.subject-btn {
  height: 100px !important;
  margin-bottom: 15px;
}

.btn-content {
  display: flex;
  flex-direction: column;
  line-height: 1.5;
}

.btn-content strong {
  font-size: 18px;
}

.btn-content span {
  font-size: 14px;
  opacity: 0.8;
}

.quiz-header {
  padding: 10px;
  background: #fff;
  border-bottom: 1px solid #eee;
  display: flex;
  gap: 10px;
  align-items: center;
}

.lobby-container {
  display: flex;
  flex-direction: column;
  /* 讓內容由上往下排 */
  min-height: 80vh;
  /* 設定最小高度，確保 footer 能被推到底部 */
  padding: 20px;
  box-sizing: border-box;
}

.lobby-header {
  text-align: center;
  margin-bottom: 30px;
}

/* 核心：考科按鈕橫向排列 */
.subject-grid {
  display: flex;
  gap: 15px;
  /* 按鈕之間的間距 */
  justify-content: center;
}

.subject-card {
  flex: 1;
  /* 讓兩個按鈕平均分配寬度 */
  background: white;
  border: 1px solid #ebedf0;
  border-radius: 12px;
  padding: 20px 10px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  transition: all 0.3s;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.subject-card:active {
  background: #f2f3f5;
  transform: scale(0.95);
  /* 點擊時縮小的回饋感 */
}

.card-title {
  font-weight: bold;
  font-size: 16px;
  margin-top: 10px;
}

.card-desc {
  font-size: 12px;
  color: #969799;
  margin-top: 5px;
}

/* 頁尾：強制置底並置中 */
.lobby-footer {
  margin-top: auto;
  /* 這是關鍵！它會把 footer 推到最下面 */
  text-align: center;
  padding: 40px 0 20px 0;
}

.login-container {
  display: flex;
  flex-direction: column;
  justify-content: center; /* 垂直置中 */
  align-items: center;     /* 水平置中 */
  min-height: 100vh;       /* 佔滿整個螢幕高度 */
  background-color: #f7f8fa; /* 背景淺灰色，增加層次感 */
  padding: 0 20px;
  box-sizing: border-box;
}

/* Logo 區域 */
.logo-area {
  text-align: center;
  margin-bottom: 40px; /* 與登入框的距離 */
}

.logo-placeholder {
  width: 100px;
  height: 100px;
  background: white;
  border-radius: 20px;
  display: flex;
  justify-content: center;
  align-items: center;
  margin: 0 auto 15px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.05);
}

.welcome-title {
  margin: 0;
  font-size: 24px;
  color: #323233;
  font-weight: bold;
}

.welcome-subtitle {
  margin: 5px 0 0;
  font-size: 14px;
  color: #969799;
}

/* 登入卡片區域 */
.login-card {
  width: 100%;
  max-width: 350px; /* 限制最大寬度，避免在電腦螢幕過寬 */
}

.login-action {
  margin-top: 30px;
  padding: 0 16px;
}

.login-action {
  margin-top: 30px;
  width: 100%;           /* 確保容器跟表單一樣寬 */
  display: flex;          /* 開啟 Flexbox */
  justify-content: center; /* 這裡才是真正的「水平置中」關鍵 */
  padding: 0 16px;       /* 保持兩側一點點呼吸空間，不要貼邊 */
  box-sizing: border-box; /* 確保 padding 不會撐破寬度 */
}

.login-submit-btn {
  /* 如果妳希望按鈕不要太長，可以設定一個最大寬度 */
  width: 100%; 
  max-width: 280px;      /* 讓按鈕縮短一點，看起來更精緻 */
}
</style>