<template>
  <k-layout>
    <template #header>
      临时封禁管理
    </template>
    
    <div class="temporaryban-container">
      <k-card class="stats-card">
        <template #header>
          <div class="card-header">
            <span>违规统计概览</span>
            <k-button size="mini" @click="refresh">刷新</k-button>
          </div>
        </template>
        <div class="stats-grid">
          <div class="stat-item">
            <div class="stat-value">{{ stats.totalViolations || 0 }}</div>
            <div class="stat-label">总违规次数</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">{{ stats.todayViolations || 0 }}</div>
            <div class="stat-label">今日违规</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">{{ stats.activeGroups || 0 }}</div>
            <div class="stat-label">监控群组</div>
          </div>
        </div>
      </k-card>

      <k-card class="records-card" title="最近违规记录">
        <k-table :data="recentRecords" :columns="columns" empty="暂无违规记录"></k-table>
      </k-card>
    </div>
  </k-layout>
</template>

<script lang="ts" setup>
import { ref, onMounted } from 'vue'
import { send } from '@koishijs/client'

const stats = ref<any>({})
const recentRecords = ref<any[]>([])

const columns = [
  { prop: 'timestamp', label: '时间', minWidth: 160 },
  { prop: 'groupId', label: '群组 ID', minWidth: 120 },
  { prop: 'userId', label: '用户 ID', minWidth: 120 },
  { prop: 'words', label: '触发词', minWidth: 150 },
  { prop: 'content', label: '原始内容', minWidth: 200 },
]

const refresh = async () => {
  try {
    const data = await send('temporaryban/get-stats')
    stats.value = data.stats
    recentRecords.value = data.recentRecords.map((r: any) => ({
      ...r,
      timestamp: new Date(r.timestamp).toLocaleString()
    }))
  } catch (e) {
    console.error('Failed to fetch stats:', e)
  }
}

onMounted(() => {
  refresh()
})
</script>

<style scoped>
.temporaryban-container {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
  padding: 20px 0;
  text-align: center;
}

.stat-value {
  font-size: 24px;
  font-weight: bold;
  color: var(--k-text-active);
}

.stat-label {
  font-size: 14px;
  color: var(--k-text-light);
  margin-top: 5px;
}
</style>
