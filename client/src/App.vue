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

const API_BASE = window.location.hostname === 'localhost' 
  ? "http://localhost:3000/api" 
  : "https://netzero-quiz-system.onrender.com/api";

// --- 監聽器：持久化作答進度 ---
watch(userAnswers, (newVal) => {
  localStorage.setItem('temp_answers', JSON.stringify(newVal))
}, { deep: true })

watch(currentIndex, (newVal) => {
  localStorage.setItem('temp_index', newVal)
})

// --- 動作 (Actions) ---
const handleLogin = async () => { // 👈 名稱改為 handleLogin
  showLoadingToast({ message: '驗證中...', forbidClick: true })
  try {
    const res = await axios.post(`${API_BASE}/login`, loginForm.value)
    localStorage.setItem(STORAGE_KEY, res.data.token)
    localStorage.setItem('user', JSON.stringify(res.data.user))
    
    isLogin.value = true
    await fetchQuiz() // 登入後立即抓題
    showSuccessToast('登入成功！')
  } catch (err) {
    showFailToast('帳號或密碼錯誤')
  } finally {
    closeToast()
  }
}

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

const submitQuiz = async () => {
  showLoadingToast({ message: '評分分析中...', forbidClick: true })
  try {
    const token = localStorage.getItem(STORAGE_KEY)
    const res = await axios.post(`${API_BASE}/quiz/submit`,
      { userAnswers: userAnswers.value },
      { headers: { Authorization: `Bearer ${token}` } }
    )
    resultData.value = res.data
    isFinished.value = true
    
    // 清除暫存
    localStorage.removeItem('temp_answers')
    localStorage.removeItem('temp_index')
    showSuccessToast('測驗完成！')
  } catch (error) {
    showFailToast('提交失敗，請檢查登入狀態')
  } finally {
    closeToast()
  }
}

// 換題控制
const next = () => { if (currentIndex.value < quizList.value.length - 1) currentIndex.value++ }
const prev = () => { if (currentIndex.value > 0) currentIndex.value-- }

// 初始化
onMounted(async () => {
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

const chartData = computed(() => {
  if (!resultData.value) return null
  const labels = Object.keys(resultData.value.analysis)
  const data = labels.map(l => (resultData.value.analysis[l].correct / resultData.value.analysis[l].total) * 100)
  return {
    labels,
    datasets: [{
      label: '能力分布',
      data,
      backgroundColor: 'rgba(7, 193, 96, 0.2)',
      borderColor: '#07c160',
      pointBackgroundColor: '#07c160'
    }]
  }
})
</script>

<template>
  <div v-if="!isLogin" class="login-container">
    <van-nav-bar title="測驗系統登入" />
    <van-form @submit="handleLogin" style="margin-top: 50px;">
      <van-cell-group inset>
        <van-field v-model="loginForm.username" label="帳號" placeholder="admin" required />
        <van-field v-model="loginForm.password" type="password" label="密碼" placeholder="admin" required />
      </van-cell-group>
      <div style="margin: 16px;">
        <van-button round block type="primary" native-type="submit">登入</van-button>
      </div>
    </van-form>
  </div>

  <div v-else>
    <div v-if="!isFinished" class="quiz-app">
      <van-nav-bar title="淨零碳管理師測驗" fixed placeholder />
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
            <van-cell v-for="opt in currentQuestion.options" :key="opt.label" :title="`${opt.label}. ${opt.text}`"
              clickable @click="userAnswers[currentQuestion.id] = opt.label">
              <template #right-icon><van-radio :name="opt.label" /></template>
            </van-cell>
          </van-cell-group>
        </van-radio-group>
      </div>

      <div class="footer">
        <van-button round plain type="success" @click="prev" :disabled="currentIndex === 0">上一題</van-button>
        <van-button v-if="currentIndex < quizList.length - 1" round type="success" @click="next"
          :disabled="!userAnswers[currentQuestion.id]">下一題</van-button>
        <van-button v-else round type="primary" @click="submitQuiz" :disabled="!userAnswers[currentQuestion.id]">送出結果</van-button>
      </div>
    </div>

    <div v-else class="result-page">
      <van-nav-bar title="測驗結果報告" fixed placeholder />
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
      <van-button block type="success" @click="window.location.reload()" style="margin-top: 20px;">重新測驗</van-button>
    </div>
  </div>
</template>

<style scoped>
/* (保持原本樣式不變) */
.quiz-app { min-height: 100vh; background-color: #f7f8fa; padding-bottom: 80px; }
.header { background: white; padding: 20px; text-align: center; }
.count { font-size: 12px; color: #969799; margin-top: 10px; }
.main-card { margin-top: 10px; }
.q-box { padding: 20px; }
.q-title { font-size: 18px; margin-top: 12px; line-height: 1.6; }
.footer { position: fixed; bottom: 0; width: 100%; background: white; padding: 15px 0; display: flex; justify-content: space-around; box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.05); }
.van-button { width: 40%; }
.score-section { text-align: center; padding: 30px; background: white; }
.chart-section { background: white; padding: 20px; margin-top: 10px; }
.section-title { text-align: center; font-weight: bold; margin-bottom: 10px; }
.text-success { color: #07c160; }
.text-danger { color: #ee0a24; }
.explanation { font-size: 13px; color: #666; background: #f9f9f9; padding: 8px; margin-top: 5px; }
</style>