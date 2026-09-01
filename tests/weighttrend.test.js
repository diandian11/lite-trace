// 轻迹 LiteTrace · 体重趋势计算单测（node 直接跑：node tests/weighttrend.test.js）
const assert = require('assert')
const wt = require('../miniprogram/utils/weighttrend')

function daysAgoDate(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return d.getFullYear() + '-' + m + '-' + day
}

// ---- BMI ----
assert.strictEqual(wt.bmiOf(70, 175), 22.9)
assert.strictEqual(wt.bmiOf(null, 175), null)
assert.strictEqual(wt.bmiOf(70, null), null)

// ---- BMI 分级（中国标准） ----
assert.strictEqual(wt.bmiCategory(17.0).label, '偏瘦')
assert.strictEqual(wt.bmiCategory(22.0).label, '正常')
assert.strictEqual(wt.bmiCategory(25.0).label, '超重')
assert.strictEqual(wt.bmiCategory(29.0).label, '肥胖')
assert.strictEqual(wt.bmiCategory(null), null)

// ---- 健康体重区间（175cm → 18.5*h² ~ 24*h²） ----
const range = wt.healthyWeightRange(175)
assert.ok(Math.abs(range[0] - 56.7) < 0.2, '健康下限约56.7kg，实际' + range[0])
assert.ok(Math.abs(range[1] - 73.5) < 0.2, '健康上限约73.5kg，实际' + range[1])
assert.strictEqual(wt.healthyWeightRange(null), null)

// ---- 周斜率：平稳下降数据（每周约 -0.5kg） ----
const recs = []
for (let i = 28; i >= 0; i--) recs.push({ date: daysAgoDate(i), kg: 75 - (28 - i) * (0.5 / 7) })
const slope = wt.weeklySlope(recs, 28)
assert.ok(slope && Math.abs(slope.perWeek + 0.5) < 0.1, '斜率应约-0.5kg/周，实际' + (slope && slope.perWeek))
assert.strictEqual(slope.points, 28, '28个自然日窗口含今天，28天前的记录在窗口外')

// ---- 数据不足返回 null ----
assert.strictEqual(wt.weeklySlope(recs.slice(0, 2), 28), null)
assert.strictEqual(wt.weeklySlope([], 28), null)

// ---- 预警文案分级 ----
assert.strictEqual(wt.trendAdvice(null).level, 'none')
assert.strictEqual(wt.trendAdvice({ perWeek: -0.5 }).level, 'good', '稳步下降')
assert.strictEqual(wt.trendAdvice({ perWeek: -1.5 }).level, 'warn', '下降过快')
assert.strictEqual(wt.trendAdvice({ perWeek: 0.0 }).level, 'stable')
assert.strictEqual(wt.trendAdvice({ perWeek: 0.5 }).level, 'warn', '略有回升')
assert.strictEqual(wt.trendAdvice({ perWeek: 1.5 }).level, 'warn', '上升过快')
assert.strictEqual(wt.trendAdvice({ perWeek: -0.5 }, { goalReached: true }).level, 'good', '达成目标优先')

// ---- 曲线数据窗口与Y轴范围 ----
const chart = wt.buildChartData(recs, 365)
assert.strictEqual(chart.points.length, 29)
assert.ok(chart.yMin < 74.5 && chart.yMax > 75, 'Y轴范围应含全部数据')
const chart30 = wt.buildChartData(recs, 30)
assert.strictEqual(chart30.points.length, 29)
assert.strictEqual(wt.buildChartData([], 30).points.length, 0)

console.log('✅ weighttrend tests passed')
