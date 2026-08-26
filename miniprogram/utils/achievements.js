// 轻迹 LiteTrace · 成就系统（纯函数，无 wx 依赖，可单测）
// ctx 由 store.stats() 提供：
//   bestStreak 历史最长连续 / sportSessions 累计次数 / totalKm 累计公里
//   totalKcal 累计千卡 / maxDist 单次最远km / maxSteps 单次最多步

const DEFS = [
  // 🔥 连续打卡（按历史最长连续算，永久保留）
  { id: 'st3', cat: 'bestStreak', icon: '🌱', name: '初来乍到', desc: '累计连续打卡 3 天', goal: 3 },
  { id: 'st7', cat: 'bestStreak', icon: '🔥', name: '渐入佳境', desc: '累计连续打卡 7 天', goal: 7 },
  { id: 'st14', cat: 'bestStreak', icon: '🔥', name: '半月征程', desc: '累计连续打卡 14 天', goal: 14 },
  { id: 'st21', cat: 'bestStreak', icon: '🏆', name: '21天习惯', desc: '累计连续打卡 21 天', goal: 21 },
  { id: 'st30', cat: 'bestStreak', icon: '🏔️', name: '月度坚守', desc: '累计连续打卡 30 天', goal: 30 },
  { id: 'st100', cat: 'bestStreak', icon: '👑', name: '百日传说', desc: '累计连续打卡 100 天', goal: 100 },
  // 🥾 累计里程
  { id: 'km10', cat: 'totalKm', icon: '🥾', name: '十公里俱乐部', desc: '累计户外 10 公里', goal: 10 },
  { id: 'km50', cat: 'totalKm', icon: '🚶', name: '五十公里行', desc: '累计户外 50 公里', goal: 50 },
  { id: 'km100', cat: 'totalKm', icon: '🏅', name: '百公里徽章', desc: '累计户外 100 公里', goal: 100 },
  { id: 'km500', cat: 'totalKm', icon: '🌍', name: '五百公里环游', desc: '累计户外 500 公里', goal: 500 },
  // 👟 累计运动
  { id: 'n10', cat: 'sportSessions', icon: '👟', name: '热身完成', desc: '累计运动 10 次', goal: 10 },
  { id: 'n50', cat: 'sportSessions', icon: '🎽', name: '常驻运动员', desc: '累计运动 50 次', goal: 50 },
  { id: 'n100', cat: 'sportSessions', icon: '🌟', name: '百场老将', desc: '累计运动 100 次', goal: 100 },
  // 🌅 单次挑战
  { id: 'd5', cat: 'maxDist', icon: '🌅', name: '破晓五公里', desc: '单次户外 5 公里', goal: 5 },
  { id: 'd10', cat: 'maxDist', icon: '🌄', name: '十公里挑战', desc: '单次户外 10 公里', goal: 10 },
  { id: 'd211', cat: 'maxDist', icon: '🐇', name: '半马勇士', desc: '单次户外 21.1 公里', goal: 21.1 },
  { id: 's10k', cat: 'maxSteps', icon: '🦶', name: '万步青年', desc: '单次记录 10000 步', goal: 10000 },
  // ⚡ 累计消耗
  { id: 'kc1000', cat: 'totalKcal', icon: '💪', name: '千卡战士', desc: '累计消耗 1000 千卡', goal: 1000 },
  { id: 'kc10000', cat: 'totalKcal', icon: '⚡', name: '万千卡熔炉', desc: '累计消耗 10000 千卡', goal: 10000 }
]

// 评估：给每个徽章附上 done / 当前进度 / 百分比
function evaluate(ctx) {
  return DEFS.map(function (def) {
    const cur = Math.max(0, +ctx[def.cat] || 0)
    const done = cur >= def.goal
    const pct = Math.min(100, Math.round(cur / def.goal * 100))
    return {
      id: def.id, cat: def.cat, icon: def.icon, name: def.name,
      desc: def.desc, goal: def.goal,
      cur: cur, done: done, pct: done ? 100 : pct
    }
  })
}

// 两次评估之间新点亮的徽章
function diffDone(before, after) {
  const map = {}
  before.forEach(function (b) { map[b.id] = b })
  return after.filter(function (a) { return a.done && map[a.id] && !map[a.id].done })
}

module.exports = { DEFS: DEFS, evaluate: evaluate, diffDone: diffDone }
