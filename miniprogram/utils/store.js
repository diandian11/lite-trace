// 轻迹 LiteTrace · 数据层（本地存储封装 + 业务计算）
// v1.2 迁移云开发时，仅需替换本文件实现，页面代码不动

const K = {
  profile: 'lt_profile',
  weight: 'lt_weight',
  sport: 'lt_sport',
  diet: 'lt_diet',
  water: 'lt_water',
  tracks: 'lt_tracks',
  snapshot: 'lt_live_snapshot'
}

function fmtDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return y + '-' + m + '-' + day
}

function today() { return fmtDate(new Date()) }

function get(key, fallback) {
  try {
    const v = wx.getStorageSync(key)
    return (v === '' || v == null) ? fallback : v
  } catch (e) { return fallback }
}

function set(key, val) { wx.setStorageSync(key, val) }

// ---------- 资料 ----------
function defaultProfile() {
  return {
    name: '',
    gender: 'male',
    height: 170,
    birthYear: 1995,
    targetWeight: 65,
    startWeight: null,
    startDate: today()
  }
}

function getProfile() {
  const p = get(K.profile, null)
  return p || defaultProfile()
}

function saveProfile(p) { set(K.profile, p) }

// ---------- 通用日历结构（key -> {date: [records]}） ----------
function dayMap(key) { return get(key, {}) }

function listOfDay(key, date) {
  const m = dayMap(key)
  return (m[date] || []).map(function (r, i) {
    r.idx = i
    return r
  })
}

function pushOfDay(key, date, item) {
  const m = dayMap(key)
  if (!m[date]) m[date] = []
  m[date].push(item)
  set(key, m)
}

function removeOfDay(key, date, idx) {
  const m = dayMap(key)
  if (m[date]) {
    m[date].splice(idx, 1)
    set(key, m)
  }
}

// ---------- 运动 ----------
function sportOfDay(date) { return listOfDay(K.sport, date) }

// 某月每天运动汇总（日历标记用）：{ '2026-08-01': { n: 条数, kcal: 千卡 } }
function sportMonth(year, month) {
  const pre = year + '-' + String(month).padStart(2, '0') + '-'
  const m = dayMap(K.sport)
  const out = {}
  Object.keys(m).forEach(function (d) {
    if (d.indexOf(pre) !== 0) return
    const rs = m[d]
    if (!rs || !rs.length) return
    let kcal = 0
    for (let i = 0; i < rs.length; i++) kcal += (+rs[i].kcal || 0)
    out[d] = { n: rs.length, kcal: Math.round(kcal) }
  })
  return out
}

// ---------- 实时运动快照（崩溃恢复）：每满1公里/1000步静默写入 ----------
function saveSnapshot(s) { set(K.snapshot, s) }
function getSnapshot() { return get(K.snapshot, null) }
function clearSnapshot() {
  try { wx.removeStorageSync(K.snapshot) } catch (e) { }
}

// ---------- 周统计（周一为一周起点）：每天分钟/千卡 + 合计 ----------
function weekStat(dateStr) {
  const m = dayMap(K.sport)
  const d = new Date(dateStr.replace(/-/g, '/') + ' 00:00:00')
  const dow = (d.getDay() + 6) % 7 // 周一=0
  d.setDate(d.getDate() - dow)
  const days = []
  let totalMin = 0, totalKcal = 0, activeDays = 0
  for (let i = 0; i < 7; i++) {
    const ds = fmtDate(d)
    const rs = m[ds] || []
    let min = 0, kcal = 0
    for (let j = 0; j < rs.length; j++) {
      min += (+rs[j].minutes || 0)
      kcal += (+rs[j].kcal || 0)
    }
    if (min > 0 || kcal > 0) activeDays++
    totalMin += min
    totalKcal += kcal
    days.push({ date: ds, min: min, kcal: Math.round(kcal) })
    d.setDate(d.getDate() + 1)
  }
  return { days: days, totalMin: totalMin, totalKcal: Math.round(totalKcal), activeDays: activeDays }
}

// ---------- 饮食 ----------
function dietOfDay(date) { return listOfDay(K.diet, date) }

function intakeKcal(date) {
  return dietOfDay(date).reduce(function (s, x) { return s + (+x.kcal || 0) }, 0)
}

// ---------- 体重（date -> kg） ----------
function getWeight(date) {
  const m = dayMap(K.weight)
  return m[date] != null ? m[date] : null
}

function setWeight(date, kg) {
  const m = dayMap(K.weight)
  m[date] = kg
  set(K.weight, m)
}

function weightRecords() {
  const m = dayMap(K.weight)
  return Object.keys(m).sort().map(function (d) {
    return { date: d, kg: m[d] }
  })
}

function latestWeight() {
  const rs = weightRecords()
  return rs.length ? rs[rs.length - 1].kg : null
}

// ---------- 喝水 ----------
function waterOfDay(date) {
  const m = get(K.water, {})
  return m[date] || 0
}

function addWater(date, ml) {
  const m = get(K.water, {})
  m[date] = Math.max(0, (m[date] || 0) + ml)
  set(K.water, m)
  return m[date]
}

// ---------- GPS 轨迹（ts -> [points]，独立 key 避免列表读取冗余） ----------
const TRACK_MAX = 30 // 最多保留 30 条轨迹，超出丢最旧
function getTracks() { return get(K.tracks, {}) }
function saveTrack(ts, points) {
  const t = getTracks()
  t[ts] = points
  const keys = Object.keys(t).map(Number).sort(function (a, b) { return a - b })
  while (keys.length > TRACK_MAX) { delete t[keys.shift()] }
  set(K.tracks, t)
}
function getTrack(ts) { return getTracks()[ts] || [] }
function removeTrack(ts) {
  const t = getTracks()
  delete t[ts]
  set(K.tracks, t)
}

// ---------- 业务计算 ----------
// BMR: Mifflin-St Jeor
function bmr(profile, weightKg) {
  const p = profile
  const age = Math.min(Math.max(new Date().getFullYear() - (p.birthYear || 1995), 10), 90)
  const w = weightKg || p.startWeight || 65
  const base = 10 * w + 6.25 * (p.height || 170) - 5 * age
  return Math.round(p.gender === 'female' ? base - 161 : base + 5)
}

// 连续打卡天数（当日有运动/饮食/体重任意记录即算）
function streak() {
  const sp = dayMap(K.sport)
  const di = dayMap(K.diet)
  const wt = dayMap(K.weight)
  function has(d) {
    return (sp[d] && sp[d].length) || (di[d] && di[d].length) || wt[d] != null
  }
  let n = 0
  const d = new Date()
  if (!has(fmtDate(d))) d.setDate(d.getDate() - 1) // 今天还没记，从昨天起算
  while (has(fmtDate(d))) {
    n++
    d.setDate(d.getDate() - 1)
  }
  return n
}

// 成就统计
function stats() {
  const sp = dayMap(K.sport)
  const di = dayMap(K.diet)
  const wt = dayMap(K.weight)
  let sportSessions = 0, activeDays = 0, dietRecords = 0
  const days = {}
  Object.keys(sp).forEach(function (d) {
    sportSessions += sp[d].length
    if (sp[d].length) days[d] = 1
  })
  Object.keys(di).forEach(function (d) {
    dietRecords += di[d].length
    if (di[d].length) days[d] = 1
  })
  Object.keys(wt).forEach(function (d) { if (wt[d] != null) days[d] = 1 })
  activeDays = Object.keys(days).length
  const bestStreak = streak() // v1.1 再算历史最佳
  return { sportSessions: sportSessions, activeDays: activeDays, dietRecords: dietRecords, bestStreak: bestStreak }
}

// 清空全部数据（保留资料结构重置为默认）
function clearAll() {
  Object.keys(K).forEach(function (k) { wx.removeStorageSync(K[k]) })
  saveProfile(defaultProfile())
}

module.exports = {
  K: K,
  fmtDate: fmtDate,
  today: today,
  get: get,
  set: set,
  defaultProfile: defaultProfile,
  getProfile: getProfile,
  saveProfile: saveProfile,
  listOfDay: listOfDay,
  pushOfDay: pushOfDay,
  removeOfDay: removeOfDay,
  sportOfDay: sportOfDay,
  sportMonth: sportMonth,
  saveSnapshot: saveSnapshot,
  getSnapshot: getSnapshot,
  clearSnapshot: clearSnapshot,
  weekStat: weekStat,
  dietOfDay: dietOfDay,
  intakeKcal: intakeKcal,
  getWeight: getWeight,
  setWeight: setWeight,
  weightRecords: weightRecords,
  latestWeight: latestWeight,
  waterOfDay: waterOfDay,
  addWater: addWater,
  saveTrack: saveTrack,
  getTrack: getTrack,
  removeTrack: removeTrack,
  bmr: bmr,
  streak: streak,
  stats: stats,
  clearAll: clearAll
}
