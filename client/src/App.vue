<script setup>
// 這裡就是「引入 Vue 功能」的地方
import { ref, computed, onMounted } from 'vue'
import axios from 'axios'
import { showToast, showLoadingToast, closeToast } from 'vant'

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
</script>

<template>
  <div class="quiz-app">
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
          <van-cell 
            v-for="opt in currentQuestion.options" 
            :key="opt.label" 
            :title="`${opt.label}. ${opt.text}`" 
            clickable
            @click="userAnswers[currentQuestion.id] = opt.label"
          >
            <template #right-icon>
              <van-radio :name="opt.label" />
            </template>
          </van-cell>
        </van-cell-group>
      </van-radio-group>
    </div>

    <div class="footer">
      <van-button round plain type="success" @click="prev" :disabled="currentIndex === 0">上一題</van-button>
      
      <van-button 
        v-if="currentIndex < quizList.length - 1"
        round type="success" @click="next" :disabled="!userAnswers[currentQuestion.id]"
      >下一題</van-button>
      
      <van-button v-else round type="primary" @click="submit" :disabled="!userAnswers[currentQuestion.id]">送出結果</van-button>
    </div>
  </div>
</template>

<style scoped>
.quiz-app { min-height: 100vh; background-color: #f7f8fa; padding-bottom: 80px; }
.header { background: white; padding: 20px; text-align: center; }
.count { font-size: 12px; color: #969799; margin-top: 10px; }
.main-card { margin-top: 10px; }
.q-box { padding: 20px; }
.q-title { font-size: 18px; margin-top: 12px; line-height: 1.6; }
.footer { 
  position: fixed; bottom: 0; width: 100%; background: white; 
  padding: 15px 0; display: flex; justify-content: space-around;
  box-shadow: 0 -2px 10px rgba(0,0,0,0.05);
}
.van-button { width: 40%; }
</style>