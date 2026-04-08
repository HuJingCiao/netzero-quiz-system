<script setup>

import { ref, computed, onMounted } from 'vue'
import axios from 'axios'
import { showToast, showLoadingToast, closeToast } from 'vant'
import { Radar } from 'vue-chartjs';
import { Chart as ChartJS, Title, Tooltip, Legend, PointElement, LineElement, RadialLinearScale, Filler } from 'chart.js';

// --- 響應式狀態 (State) ---
const quizList = ref([])      // 題目清單
const currentIndex = ref(0)   // 目前題號 (0 為第一題)
const userAnswers = ref({})    // 紀錄答案 { 題目ID: "A" }
const loading = ref(true)

const API_BASE = "http://localhost:3000/api"

// --- 動作 (Actions) ---
const fetchQuiz = async () => {
  showLoadingToast({ message: '正在讀取淨零題庫...', forbidClick: true })
  try {
    const res = await axios.get(`${API_BASE}/quiz/random`)
    quizList.value = res.data
  } catch (err) {
    showToast('後端連線失敗，請檢查 server 是否啟動')
  } finally {
    loading.value = false
    closeToast()
  }
}

// --- 計算屬性 (Computed) ---
const currentQuestion = computed(() => quizList.value[currentIndex.value] || {})
const progress = computed(() =>
  quizList.value.length ? Math.round(((currentIndex.value + 1) / quizList.value.length) * 100) : 0
)

onMounted(fetchQuiz)

// 換題控制
const next = () => { if (currentIndex.value < quizList.value.length - 1) currentIndex.value++ }
const prev = () => { if (currentIndex.value > 0) currentIndex.value-- }
const submit = () => { showToast('提交成功！明天我們來寫評分邏輯') }


ChartJS.register(Title, Tooltip, Legend, PointElement, LineElement, RadialLinearScale, Filler);

const isFinished = ref(false); // 是否完成測驗
const resultData = ref(null);   // 存放後端回傳的評分結果

const submitQuiz = async () => {
  showLoadingToast({ message: '評分分析中...', forbidClick: true });
  try {
    const res = await axios.post(`${API_BASE}/quiz/submit`, { userAnswers: userAnswers.value });
    resultData.value = res.data;
    isFinished.value = true;
  } catch (err) {
    showToast('提交失敗');
  } finally {
    closeToast();
  }
};

// 格式化雷達圖數據
const chartData = computed(() => {
  if (!resultData.value) return null;
  const labels = Object.keys(resultData.value.analysis);
  const data = labels.map(l => (resultData.value.analysis[l].correct / resultData.value.analysis[l].total) * 100);

  return {
    labels,
    datasets: [{
      label: '能力分布',
      data,
      backgroundColor: 'rgba(7, 193, 96, 0.2)',
      borderColor: '#07c160',
      pointBackgroundColor: '#07c160'
    }]
  };
});

</script>

<template>
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
            <template #right-icon>
              <van-radio :name="opt.label" />
            </template>
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

    <div class="score-section">
      <van-circle v-model:current-rate="resultData.score" :rate="resultData.score" :speed="100"
        :text="resultData.score + '分'" stroke-width="60" color="#07c160" />
      <h3>{{ resultData.score >= 60 ? '恭喜及格！' : '仍需努力！' }}</h3>
    </div>

    <div class="chart-section" v-if="chartData">
      <p class="section-title">弱點分析圖</p>
      <Radar :data="chartData" :options="{ responsive: true }" />
    </div>

    <div class="detail-list">
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
</template>



<style scoped>
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
</style>