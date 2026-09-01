// 轻迹 LiteTrace · 体重趋势计算（纯函数，node 可测）
// BMI 中国标准：<18.5 偏瘦，18.5~24 正常，24~28 超重，≥28 肥胖
const DAY = 86400000

function bmiOf(kg, heightCm) {
  if (!kg || !heightCm) return null
  const m = heightCm / 100
  return +(kg / (m * m)).toFixed(1)
}

function bmiCategory(bmi) {
  if (bmi == null) return null
  if (bmi < 18.5) return { label: '偏瘦', color: '#38BDF8' }
  if (bmi < 24) return { label: '正常', color: '#10B981' }
  if (bmi < 28) return { label: '超重', color: '#F59E0B' }
  return { label: '肥胖', color: '#FB7185' }
}

// 健康体重区间（BMI 18.5~24 换算成 kg，随身高变化）
function healthyWeightRange(heightCm) {
  if (!heightCm) return null
  const m = heightCm / 100
  return [+(18.5 * m * m).toFixed(1), +(24 * m * m).toFixed(1)]
}

// 东八区第 daysBack 天前的零点（daysBack=0 → 今天零点；负数 → 未来天零点）
function dayStart(daysBack) {
  const d = new Date(Date.now() + 8 * 3600000)
  d.setUTCDate(d.getUTCDate() - daysBack)
  d.setUTCHours(0, 0, 0, 0)
  return d.getTime() - 8 * 3600000
}

// 最小二乘拟合最近 windowDays 个自然日内记录，返回每周变化 kg
function weeklySlope(records, windowDays) {
  if (!records || !records.length) return null
  const from = dayStart(windowDays - 1)
  const to = dayStart(-1) // 今天零点，加一天缓冲含今天全部
  const pts = []
  for (const r of records) {
    const t = new Date(r.date + 'T00:00:00+08:00').getTime()
    if (t >= from && t <= to) pts.push([t / DAY, r.kg])
  }
  if (pts.length < 3) return null
  const n = pts.length
  let sx = 0, sy = 0, sxy = 0, sxx = 0
  for (const p of pts) { sx += p[0]; sy += p[1]; sxy += p[0] * p[1]; sxx += p[0] * p[0] }
  const denom = n * sxx - sx * sx
  if (!denom) return null
  return { perWeek: +((n * sxy - sx * sy) / denom * 7).toFixed(2), points: n }
}

// 趋势预警文案
function trendAdvice(slope, opts) {
  opts = opts || {}
  if (!slope) return { level: 'none', icon: '📭', text: '再记录几天数据，就能看出趋势啦' }
  const w = slope.perWeek
  if (opts.goalReached) return { level: 'good', icon: '🎉', text: '目标体重已达成，保持住就是胜利！' }
  if (w < -1.0) return { level: 'warn', icon: '⚠️', text: '每周降 ' + Math.abs(w).toFixed(1) + ' kg，下降偏快，注意营养均衡' }
  if (w <= -0.2) return { level: 'good', icon: '✅', text: '每周约 -' + Math.abs(w).toFixed(1) + ' kg，稳步下降，保持！' }
  if (w < 0.2) return { level: 'stable', icon: '➖', text: '近期体重平稳' }
  if (w < 1.0) return { level: 'warn', icon: '📈', text: '每周约 +' + w.toFixed(1) + ' kg，略有回升，留意饮食' }
  return { level: 'warn', icon: '⚠️', text: '每周涨 ' + w.toFixed(1) + ' kg，上升较快，注意控制' }
}

// 曲线数据：截取最近 days 个自然天，返回点位与 Y 轴范围
function buildChartData(records, days) {
  const from = dayStart(days - 1)
  const to = dayStart(-1)
  const pts = []
  for (const r of records) {
    const t = new Date(r.date + 'T00:00:00+08:00').getTime()
    if (t >= from && t <= to) pts.push({ t, kg: r.kg, date: r.date })
  }
  if (!pts.length) return { points: [], yMin: 0, yMax: 0 }
  let min = Infinity, max = -Infinity
  for (const p of pts) { if (p.kg < min) min = p.kg; if (p.kg > max) max = p.kg }
  const span = max - min || 2
  return { points: pts, yMin: +(+((min - span * 0.25).toFixed(1))), yMax: +(+((max + span * 0.25).toFixed(1))) }
}

module.exports = { DAY, bmiOf, bmiCategory, healthyWeightRange, weeklySlope, trendAdvice, buildChartData }
