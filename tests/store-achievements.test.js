// 轻迹 LiteTrace · 数据层与成就系统单测（node 直接跑：node tests/store-achievements.test.js）
const assert = require('assert')

// ---- mock wx 存储 ----
const mem = {}
global.wx = {
  getStorageSync: (k) => (k in mem ? mem[k] : ''),
  setStorageSync: (k, v) => { mem[k] = v },
  removeStorageSync: (k) => { delete mem[k] }
}

const store = require('../miniprogram/utils/store')
const ach = require('../miniprogram/utils/achievements')

function addSport(date, rec) { store.pushOfDay(store.K.sport, date, rec) }

// ---- case1: 空数据 ----
let s = store.stats()
assert.strictEqual(s.bestStreak, 0)
assert.strictEqual(s.streak, 0)
assert.strictEqual(s.totalKm, 0)
let badges = ach.evaluate(s)
assert.strictEqual(badges.length, ach.DEFS.length)
assert.ok(badges.every(b => !b.done), '空数据不应有徽章点亮')

// ---- case2: 三天连续打卡（前天/昨天/今天） ----
const today = new Date()
function daysAgo(n) {
  const d = new Date(today)
  d.setDate(d.getDate() - n)
  return store.fmtDate(d)
}
addSport(daysAgo(2), { minutes: 30, kcal: 200, distance: 3, ts: 1 })
addSport(daysAgo(1), { minutes: 20, kcal: 150, count: 3000, ts: 2 })
addSport(daysAgo(0), { minutes: 60, kcal: 500, distance: 8, ts: 3 })

s = store.stats()
assert.strictEqual(s.streak, 3, '当前连续应为3')
assert.strictEqual(s.bestStreak, 3, '历史最佳应为3')
assert.strictEqual(s.sportSessions, 3)
assert.strictEqual(s.totalKm, 11)
assert.strictEqual(s.maxDist, 8)
assert.strictEqual(s.maxSteps, 3000)
assert.strictEqual(s.maxMinutes, 60)
assert.strictEqual(s.maxKcal, 500)

badges = ach.evaluate(s)
const byId = {}
badges.forEach(b => { byId[b.id] = b })
assert.ok(byId.st3.done, '连续3天应点亮')
assert.ok(!byId.st7.done, '连续7天不应点亮')
assert.ok(byId.km10.done, '累计11km应点亮十公里')
assert.ok(byId.d5.done, '单次8km应点亮五公里')
assert.ok(!byId.d10.done, '单次8km不应点亮十公里')
assert.ok(!byId.kc1000.done, '850千卡不应点亮千卡战士')
assert.ok(byId.n10.pct > 0 && byId.n10.pct < 100, '次数进度应在0-100')

// ---- case3: 断档后历史最佳保留 ----
// 再往前补一段5天连续（10天前~6天前），中间空1天 → 历史最佳5
for (let i = 6; i <= 10; i++) addSport(daysAgo(i), { minutes: 10, kcal: 50, ts: 100 + i })
s = store.stats()
assert.strictEqual(s.bestStreak, 5, '历史最佳应为5（旧5天段）')
assert.strictEqual(s.streak, 3, '当前连续仍为3')
badges = ach.evaluate(s)
badges.forEach(b => { byId[b.id] = b })
assert.ok(byId.st3.done)

// ---- case4: diffDone 新点亮 ----
const before = ach.evaluate(store.stats())
addSport(daysAgo(0), { minutes: 90, kcal: 300, distance: 12, ts: 9 })
const after = ach.evaluate(store.stats())
const news = ach.diffDone(before, after)
const newsIds = news.map(n => n.id)
assert.ok(newsIds.indexOf('d10') >= 0, '单次12km应新点亮十公里挑战')
assert.ok(newsIds.indexOf('st3') < 0, '已点亮的不再重复')

// ---- case5: newBestsOf（首条不庆祝，破纪录才庆祝） ----
// 当前 maxDist=12；跑 15km → 破纪录
let bests = store.newBestsOf({ distance: 15, minutes: 80, kcal: 600, count: 15000 })
assert.ok(bests.some(b => b.label === '最远单次'))
assert.ok(bests.some(b => b.label === '单次步数'))
// 不破纪录
bests = store.newBestsOf({ distance: 5, minutes: 10, kcal: 100, count: 100 })
assert.strictEqual(bests.length, 0)

// ---- case6: 空库首条记录不触发庆祝 ----
Object.keys(mem).forEach(k => delete mem[k])
bests = store.newBestsOf({ distance: 42, minutes: 200, kcal: 2000, count: 50000 })
assert.strictEqual(bests.length, 0, '首条记录不算破纪录')

// ---- case7: pbs 明细 ----
addSport('2026-08-01', { name: '慢跑(户外)', emoji: '🏃', minutes: 30, kcal: 300, distance: 5, ts: 1000 })
addSport('2026-08-02', { name: '快走', emoji: '🚶', minutes: 90, kcal: 400, count: 12000, ts: 1001 })
const p = store.pbs()
assert.strictEqual(p.distance.value, 5)
assert.strictEqual(p.distance.date, '2026-08-01')
assert.strictEqual(p.minutes.value, 90)
assert.strictEqual(p.steps.value, 12000)
assert.strictEqual(p.kcal.value, 400)

console.log('✅ store + achievements 全部断言通过')
