const store = require('../../utils/store')
const sport = require('../../utils/sport')
const stepcounter = require('../../utils/stepcounter')
const geo = require('../../utils/geo')
const voice = require('../../utils/voice')
const achievements = require('../../utils/achievements')

// 室内按步频自动识别
function inAutoType(cadence) { return cadence >= 115 ? 'jog' : 'walk' }
// 户外按近期速度(m/s)+步频自动识别：慢走/慢跑/快跑/骑行
function classifyOutdoor(mps, cadence) {
  // 骑行特征：速度≥2.5m/s 且几乎无步伐节律（手机感知不到蹬踏节奏）
  if (mps != null && mps >= 2.5 && (!cadence || cadence < 40)) return 'ride'
  if (mps == null || mps <= 0) return cadence >= 115 ? 'jog' : 'walk'
  if (mps < 1.4) return 'walk'
  if (mps < 2.8) return 'jog'
  if (mps < 4.5) return 'run'
  return cadence >= 70 ? 'run' : 'ride'
}
const OUT_KEYS = ['walk', 'jog', 'run', 'ride']
const TYPE_INFO = {
  walk: { key: 'walk', name: '慢走', emoji: '🚶' },
  jog: { key: 'jog', name: '慢跑', emoji: '🏃' },
  run: { key: 'run', name: '快跑', emoji: '💨' },
  ride: { key: 'ride', name: '骑行', emoji: '🚴' }
}

// 运动目标选项（按模式，none=不设目标）
const GOALS = {
  outdoor: [
    { t: 'none', label: '✨ 无目标' },
    { t: 'dist', label: '1 km', v: 1000 },
    { t: 'dist', label: '3 km', v: 3000 },
    { t: 'dist', label: '5 km', v: 5000 },
    { t: 'dist', label: '10 km', v: 10000 },
    { t: 'time', label: '30 分钟', v: 1800 },
    { t: 'time', label: '60 分钟', v: 3600 }
  ],
  indoor: [
    { t: 'none', label: '✨ 无目标' },
    { t: 'steps', label: '1000 步', v: 1000 },
    { t: 'steps', label: '3000 步', v: 3000 },
    { t: 'steps', label: '6000 步', v: 6000 },
    { t: 'time', label: '20 分钟', v: 1200 },
    { t: 'time', label: '40 分钟', v: 2400 }
  ]
}

function fmtTime(sec) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return (m < 10 ? '0' + m : '' + m) + ':' + (s < 10 ? '0' + s : '' + s)
}

Page({
  data: {
    typeNames: [], typeIndex: 0,
    intensityNames: [], intensityIndex: 1,
    minutes: '30', count: '',
    records: [], totalMin: 0, totalKcal: 0,
    // 实时记录（室内计步 / 户外GPS）
    liveMode: 'indoor',
    liveOn: false, livePaused: false, autoLabel: '✨ 自动',
    liveSteps: 0, liveTime: '00:00', liveCadence: 0, liveKcal: 0,
    outDist: '0.00', outPace: '--\'--', heading: '--',
    mapLat: 39.908, mapLng: 116.397, poly: [], mapFull: false,
    outTypeIndex: -1, // -1=自动识别，0慢走 1慢跑 2快跑 3骑行
    finishProgress: 0, holding: false, holdSecLeft: '', // 长按结束进度
    // 运动目标
    goals: [], goalIdx: 0,
    goalHas: false, goalPct: 0, goalDeg: 0, goalText: '', goalDone: false,
    // 周小结
    weekBars: [], weekTotalMin: 0, weekActiveDays: 0, weekTotalKcal: 0, weekPct: 0, weekShow: false,
    voiceOn: true, voiceAvailable: false, // 语音播报（本地语音包，始终可用）
    timbres: [], timbre: 'tt', // 播报音色
    // 运动记录：日历视图 + 当日明细
    viewDate: '', todayStr: '',
    calTitle: '', calCells: [], calMonthKcal: 0, calCanNext: false,
    calDrill: false, // false=日历态，true=当日明细态（原地替换日历）
  },

  onLoad() {
    this.setData({
      typeNames: sport.TYPES.map(t => t.emoji + ' ' + t.name),
      intensityNames: sport.INTENSITY.map(i => i.name),
      viewDate: store.today(),
      todayStr: store.today(),
      voiceOn: voice.available() && voice.enabled(),
      voiceAvailable: voice.available(),
      timbres: voice.TIMBRES,
      timbre: voice.getTimbre(),
      goals: GOALS[this.data.liveMode]
    })
    const n0 = new Date()
    this.calY = n0.getFullYear()
    this.calM = n0.getMonth()
    this.buildCal()
    this.counter = null
    this.liveTimer = null
    this.stepTs = []
    this.speedBuf = [] // 近期速度滑窗 [{t, m}]，供类型自动识别
    this.trackPts = []
    this.trackM = 0
    this.lastLoc = null
    this.lastMapSet = 0
    this.lastHeading = -99
    this.lastKm = 0      // 已播报的整公里数
    this.lastStepMark = 0 // 室内已播报的整千步数
  },
  onShow() {
    this.checkSnapshot()
    this.refresh()
  },
  onHide() {
    this.clearHold()
    if (this.data.liveOn && !this.data.livePaused && this.data.liveMode === 'indoor') {
      this.pauseLive(true)
    }
  },
  onUnload() { this.teardownLive() },

  refresh() {
    const day = this.data.viewDate || store.today()
    // hasTrack 由轨迹库实时推导（兼容旧记录，修复📍永不显示的bug）
    const rs = store.sportOfDay(day).map(function (r) {
      r.hasTrack = (store.getTrack(r.ts) || []).length > 0
      return r
    })
    this.setData({
      viewDate: day,
      records: rs,
      totalMin: rs.reduce((s, x) => s + (+x.minutes || 0), 0),
      totalKcal: rs.reduce((s, x) => s + (+x.kcal || 0), 0)
    })
    this.buildWeek()
  },

  // ---------- 日历视图 ----------
  // 构建 y 年 m 月(0-11)月历：周一开头，有运动的日子标千卡，选中日高亮
  buildCal() {
    const y = this.calY, m = this.calM
    const tStr = this.data.todayStr
    const sel = this.data.viewDate
    const monthSum = store.sportMonth(y, m + 1)
    let mk = 0
    Object.keys(monthSum).forEach(function (d) { mk += monthSum[d].kcal })
    const lead = (new Date(y, m, 1).getDay() + 6) % 7 // 周一=0
    const dim = new Date(y, m + 1, 0).getDate()
    const cells = []
    for (let i = 0; i < lead; i++) cells.push({ id: 'b' + i, day: '', date: '' })
    for (let d = 1; d <= dim; d++) {
      const ds = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0')
      const s = monthSum[ds]
      cells.push({
        id: 'd' + d, day: d, date: ds,
        kcal: s ? s.kcal : 0,
        isToday: ds === tStr,
        sel: ds === sel,
        future: ds > tStr
      })
    }
    const now = new Date()
    this.setData({
      calTitle: y + '年' + (m + 1) + '月',
      calCells: cells,
      calMonthKcal: mk,
      calCanNext: !(y === now.getFullYear() && m === now.getMonth())
    })
  },
  prevMonth() {
    const d = new Date(this.calY, this.calM - 1, 1)
    this.calY = d.getFullYear()
    this.calM = d.getMonth()
    this.buildCal()
  },
  nextMonth() {
    if (!this.data.calCanNext) return
    const d = new Date(this.calY, this.calM + 1, 1)
    this.calY = d.getFullYear()
    this.calM = d.getMonth()
    this.buildCal()
  },
  // 点日期：原地切换到当日明细
  pickDay(e) {
    const ds = e.currentTarget.dataset.d
    if (!ds || ds > this.data.todayStr) return
    this.setData({ viewDate: ds, calDrill: true })
    this.refresh()
  },
  // 返回日历
  backToCal() {
    this.setData({ calDrill: false })
    this.buildCal()
  },

  // ---------- 周小结（WHO 建议150分钟/周） ----------
  buildWeek() {
    const w = store.weekStat(this.data.todayStr)
    let maxMin = 0
    for (let i = 0; i < w.days.length; i++) maxMin = Math.max(maxMin, w.days[i].min)
    const names = ['一', '二', '三', '四', '五', '六', '日']
    const bars = w.days.map(function (d, i) {
      return {
        id: 'w' + i,
        name: names[i],
        h: maxMin > 0 ? Math.max(4, Math.round(d.min / maxMin * 100)) : 4,
        min: d.min,
        today: d.date === store.today()
      }
    })
    this.setData({
      weekBars: bars,
      weekTotalMin: w.totalMin,
      weekActiveDays: w.activeDays,
      weekTotalKcal: w.totalKcal,
      weekPct: Math.min(100, Math.round(w.totalMin / 150 * 100))
    })
  },
  toggleWeekShow() { this.setData({ weekShow: !this.data.weekShow }) },

  // ---------- 崩溃恢复：未正常结束的运动按快照补录 ----------
  checkSnapshot() {
    if (this.data.liveOn) return
    const s = store.getSnapshot()
    if (!s || !s.sec || s.sec < 30) { if (s) store.clearSnapshot(); return }
    const d = new Date(s.startTs)
    const when = (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
    const what = s.m === 'outdoor'
      ? '户外记录了 ' + geo.fmtKm(s.distM || 0) + ' 公里 / ' + Math.max(1, Math.round(s.sec / 60)) + ' 分钟'
      : '室内记录了 ' + (s.steps || 0) + ' 步 / ' + Math.max(1, Math.round(s.sec / 60)) + ' 分钟'
    const self = this
    wx.showModal({
      title: '上次运动未正常结束',
      content: when + ' 的' + what + '。补录保存吗？',
      confirmText: '补录',
      cancelText: '丢弃',
      success(res) {
        if (res.confirm) self.recoverLive(s)
        store.clearSnapshot()
        self.buildCal()
        self.refresh()
      }
    })
  },
  // 按快照补录一条记录（含轨迹）
  recoverLive(s) {
    const outdoor = s.m === 'outdoor'
    if (outdoor && (s.distM || 0) < 50) return
    if (!outdoor && (s.steps || 0) < 5) return
    const t = TYPE_INFO[s.typeKey] || TYPE_INFO.walk
    const minutes = Math.max(1, Math.round(s.sec / 60))
    const day = store.fmtDate(new Date(s.startTs))
    const rec = {
      typeKey: t.key, name: t.name + (outdoor ? '(户外)' : ''), emoji: t.emoji,
      minutes: minutes, intensity: '补录', source: 'recover',
      kcal: sport.kcal(t.key, minutes, this.weightKg(), 'mid'), ts: s.startTs
    }
    if (outdoor) {
      rec.distance = +geo.fmtKm(s.distM)
      if (s.pts && s.pts.length) store.saveTrack(s.startTs, s.pts)
    } else {
      rec.count = s.steps
      rec.unit = '步'
    }
    store.pushOfDay(store.K.sport, day, rec)
    wx.showToast({ title: '已补录 ' + minutes + ' 分钟', icon: 'success' })
  },

  // ---------- 手动打卡 ----------
  bindType(e) { this.setData({ typeIndex: +e.detail.value }) },
  bindIntensity(e) { this.setData({ intensityIndex: +e.detail.value }) },
  bindMinutes(e) { this.setData({ minutes: e.detail.value }) },
  bindCount(e) { this.setData({ count: e.detail.value }) },
  weightKg() {
    const p = store.getProfile()
    return store.getWeight(store.today()) || store.latestWeight() || p.startWeight || 65
  },
  save() {
    const minutes = +this.data.minutes
    if (!minutes || minutes <= 0) {
      wx.showToast({ title: '先填运动时长', icon: 'none' })
      return
    }
    const t = sport.TYPES[this.data.typeIndex]
    const it = sport.INTENSITY[this.data.intensityIndex]
    const kcal = sport.kcal(t.key, minutes, this.weightKg(), it.key)
    store.pushOfDay(store.K.sport, store.today(), {
      typeKey: t.key, name: t.name, emoji: t.emoji,
      minutes: minutes, count: this.data.count,
      intensity: it.name, kcal: kcal, ts: Date.now()
    })
    wx.showToast({ title: '已打卡 +' + kcal + ' 千卡', icon: 'success' })
    this.setData({ minutes: '30', count: '', viewDate: store.today(), calDrill: false })
    this.buildCal()
    this.refresh()
  },
  del(e) {
    const idx = +e.currentTarget.dataset.idx
    const rec = this.data.records[idx]
    if (rec && rec.hasTrack) store.removeTrack(rec.ts)
    store.removeOfDay(store.K.sport, this.data.viewDate, idx)
    this.buildCal()
    this.refresh()
  },
  openTrack(e) {
    const idx = +e.currentTarget.dataset.idx
    const rec = this.data.records[idx]
    if (!rec || !rec.hasTrack) return
    wx.navigateTo({
      url: '/pages/track/track?day=' + this.data.viewDate + '&ts=' + rec.ts
    })
  },

  // ---------- 语音播报 ----------
  toggleVoice(e) {
    voice.setEnabled(e.detail.value)
    this.setData({ voiceOn: e.detail.value })
    if (e.detail.value) voice.event('voiceon')
  },
  // 切换音色并立即试听
  setTimbreTap(e) {
    const id = e.currentTarget.dataset.id
    if (!id || id === this.data.timbre) return
    voice.setTimbre(id)
    this.setData({ timbre: id })
    voice.event('voiceon')
  },

  // ---------- 实时记录 ----------
  setLiveMode(e) {
    if (this.data.liveOn) return
    const m = e.currentTarget.dataset.m
    this.setData({ liveMode: m, goalIdx: 0, goals: GOALS[m] })
  },
  // 选目标（仅运动前）
  setGoal(e) {
    if (this.data.liveOn) return
    this.setData({ goalIdx: +e.currentTarget.dataset.i })
  },
  // 户外类型：-1 自动 / 0-3 手动锁定，运动中也可切换
  setOutType(e) {
    this.setData({ outTypeIndex: +e.currentTarget.dataset.i })
    if (this.data.liveOn) this.tickLive()
  },
  toggleMapFull() { this.setData({ mapFull: !this.data.mapFull }) },

  elapsedSec() {
    if (!this.liveStartTs) return this.liveSec || 0
    return Math.max(0, Math.floor((Date.now() - this.liveStartTs - this.pausedMs) / 1000))
  },

  ensureAccelListener() {
    if (this.accelBound) return
    const self = this
    wx.onAccelerometerChange(function (res) {
      if (!self.data.liveOn || self.data.livePaused || !self.counter) return
      const steps = self.counter.feed(res.x, res.y, res.z, Date.now())
      if (steps > self.data.liveSteps) {
        self.stepTs.push(Date.now())
        self.setData({ liveSteps: steps })
      }
    })
    this.accelBound = true
  },
  startAccelSafe() {
    wx.stopAccelerometer({
      complete() {
        wx.startAccelerometer({
          interval: 'game',
          fail(res) { console.error('accel fail', res) }
        })
      }
    })
  },
  stopAccel() {
    wx.stopAccelerometer()
    if (this.accelBound) { wx.offAccelerometerChange(); this.accelBound = false }
  },

  ensureLocListener() {
    if (this.locBound) return
    const self = this
    wx.onLocationChange(function (res) {
      if (!self.data.liveOn || self.data.livePaused) return
      if (res.accuracy != null && res.accuracy > 50) return
      const p = { latitude: +res.latitude.toFixed(6), longitude: +res.longitude.toFixed(6), t: Date.now() }
      if (!self.lastLoc) {
        self.lastLoc = p
        self.trackPts.push(p)
        self.setData({ mapLat: p.latitude, mapLng: p.longitude })
        return
      }
      const d = geo.distM(self.lastLoc, p)
      if (d < 3) return
      self.lastLoc = p
      self.trackPts.push(p)
      self.trackM += d
      self.speedBuf.push({ t: Date.now(), m: self.trackM })
      const now = Date.now()
      if (now - self.lastMapSet > 2500) {
        self.lastMapSet = now
        self.setData({
          outDist: geo.fmtKm(self.trackM),
          poly: geo.heatPolylines(self.trackPts, 4),
          mapLat: p.latitude, mapLng: p.longitude
        })
      }
    })
    this.locBound = true
  },
  startLocSafe() {
    const self = this
    wx.offLocationChange()
    this.locBound = false
    wx.stopLocationUpdate({
      complete() {
        wx.startLocationUpdate({
          success() { self.ensureLocListener() },
          fail(res) {
            console.error('location fail', res)
            const msg = res && res.errMsg ? res.errMsg : JSON.stringify(res)
            let title = '定位启动失败'
            let content = String(msg).slice(0, 120)
            if (/auth|deny/i.test(msg)) {
              title = '需要位置权限'
              content = '请在设置中允许「位置信息」，用于记录运动轨迹'
            } else if (/privacy|104/i.test(msg)) {
              title = '需要隐私声明'
              content = '请在小程序后台「用户隐私保护指引」中声明收集「位置信息」后重试'
            }
            wx.showModal({
              title: title, content: content, showCancel: false,
              confirmText: '知道了',
              complete() { self.teardownLive() }
            })
          }
        })
      }
    })
  },
  stopLoc() {
    wx.stopLocationUpdate()
    if (this.locBound) { wx.offLocationChange(); this.locBound = false }
  },

  ensureCompass() {
    if (this.compassBound) return
    const self = this
    wx.onCompassChange(function (res) {
      if (!self.data.liveOn || self.data.livePaused) return
      const d = Math.round(res.direction)
      if (Math.abs(d - self.lastHeading) < 8) return
      self.lastHeading = d
      self.setData({ heading: geo.headingName(d) + ' ' + d + '°' })
    })
    this.compassBound = true
  },
  stopCompass() {
    if (this.compassBound) { wx.offCompassChange(); this.compassBound = false }
  },

  startLive() {
    if (this.data.liveOn) return
    const outdoor = this.data.liveMode === 'outdoor'
    this.counter = stepcounter.createStepCounter()
    this.stepTs = []
    this.trackPts = []
    this.trackM = 0
    this.speedBuf = []
    this.lastLoc = null
    this.lastMapSet = 0
    this.lastHeading = -99
    this.lastKm = 0
    this.lastStepMark = 0
    this.liveStartTs = Date.now()
    this.pausedMs = 0
    this.lastResumeTs = Date.now()
    this.goal = GOALS[this.data.liveMode][this.data.goalIdx] || GOALS[this.data.liveMode][0]
    this.goalDone = false
    this.lastTypeKey = 'walk'
    const g = this.goal
    const gTxt = g.t === 'none' ? '' : (g.t === 'dist' ? '0.00/' + (g.v / 1000).toFixed(1) + ' km' : g.t === 'time' ? '00:00/' + fmtTime(g.v) : '0/' + g.v + ' 步')
    this.setData({
      liveOn: true, livePaused: false,
      liveSteps: 0, liveTime: '00:00', liveCadence: 0, liveKcal: 0,
      autoLabel: '✨ 自动',
      outDist: '0.00', outPace: '--\'--', heading: '--', poly: [], mapFull: false,
      goalHas: g.t !== 'none', goalPct: 0, goalDeg: 0, goalDone: false, goalText: gTxt
    })
    wx.vibrateShort({ type: 'light' })
    voice.event('start')
    this.ensureAccelListener()
    this.startAccelSafe()
    if (outdoor) {
      this.startLocSafe()
      this.ensureCompass()
    }
    const self = this
    this.liveTimer = setInterval(function () { self.tickLive() }, 1000)
    this.tickLive()
  },

  // 当前生效类型：手动锁定优先，否则按近期速度(20s滑窗)+步频自动识别
  currentType(cadence) {
    if (this.data.outTypeIndex >= 0) return OUT_KEYS[this.data.outTypeIndex]
    const buf = this.speedBuf || []
    const now = Date.now()
    while (buf.length && now - buf[0].t > 20000) buf.shift()
    let mps = null
    if (buf.length >= 2) {
      const dt = (buf[buf.length - 1].t - buf[0].t) / 1000
      if (dt >= 5) mps = (buf[buf.length - 1].m - buf[0].m) / dt
    }
    return classifyOutdoor(mps, cadence)
  },

  tickLive() {
    const sec = this.elapsedSec()
    const outdoor = this.data.liveMode === 'outdoor'
    const now = Date.now()
    while (this.stepTs.length && now - this.stepTs[0] > 12000) this.stepTs.shift()
    const cadence = this.stepTs.length >= 3 ? this.stepTs.length * 5 : 0
    const typeKey = outdoor ? this.currentType(cadence) : inAutoType(cadence)
    const t = TYPE_INFO[typeKey]
    this.lastTypeKey = typeKey
    const auto = this.data.outTypeIndex < 0
    const patch = {
      liveTime: fmtTime(sec),
      liveCadence: cadence,
      autoLabel: (outdoor && auto ? '✨ 自动·' : '') + t.emoji + ' ' + t.name,
      liveKcal: sport.kcal(t.key, sec / 60, this.weightKg(), 'mid')
    }
    if (outdoor) patch.outPace = geo.fmtPace(sec, this.trackM)
    // 户外：每满1公里播报（公里数/用时/平均配速）
    if (outdoor) {
      const km = Math.floor(this.trackM / 1000)
      if (km > this.lastKm) {
        this.lastKm = km
        const pk = this.trackM > 0 ? sec / this.trackM * 1000 : 0
        voice.km(km, sec, pk)
        this.saveSnapNow(sec, typeKey)
      }
    } else {
      // 室内：每满1000步播报
      const mark = Math.floor(this.data.liveSteps / 1000)
      if (mark > this.lastStepMark) {
        this.lastStepMark = mark
        voice.steps(mark * 1000, sec)
        this.saveSnapNow(sec, typeKey)
      }
    }
    // 目标进度与达成
    if (this.goal && this.goal.t !== 'none') {
      let cur = 0
      let txt = ''
      if (this.goal.t === 'dist') {
        cur = this.trackM
        txt = geo.fmtKm(cur) + '/' + (this.goal.v / 1000).toFixed(1) + ' km'
      } else if (this.goal.t === 'time') {
        cur = sec
        txt = fmtTime(cur) + '/' + fmtTime(this.goal.v)
      } else {
        cur = this.data.liveSteps
        txt = cur + '/' + this.goal.v + ' 步'
      }
      const pct = this.goal.v > 0 ? Math.min(100, Math.round(cur / this.goal.v * 100)) : 0
      patch.goalPct = pct
      patch.goalDeg = Math.round(pct * 3.6)
      patch.goalText = txt
      if (pct >= 100 && !this.goalDone) {
        this.goalDone = true
        patch.goalDone = true
        wx.vibrateShort({ type: 'medium' })
        voice.event('goaldone')
      }
    }
    this.setData(patch)
  },

  // 静默快照（崩溃恢复）：每满1公里/1000步及暂停时写入
  saveSnapNow(sec, typeKey) {
    if (!this.data.liveOn) return
    store.saveSnapshot({
      m: this.data.liveMode,
      startTs: this.liveStartTs,
      sec: sec,
      steps: this.data.liveSteps,
      distM: Math.round(this.trackM),
      typeKey: typeKey || this.lastTypeKey || 'walk',
      pts: this.data.liveMode === 'outdoor' ? geo.simplify(this.trackPts, 8, 800) : []
    })
  },

  pauseLive(silent) {
    if (!this.data.liveOn || this.data.livePaused) return
    this.pausedMs += Date.now() - this.lastResumeTs
    if (this.liveTimer) { clearInterval(this.liveTimer); this.liveTimer = null }
    this.stopAccel()
    if (this.data.liveMode === 'outdoor') this.stopLoc()
    this.saveSnapNow(this.elapsedSec(), this.lastTypeKey)
    this.setData({ livePaused: true })
    if (!silent) {
      wx.showToast({ title: '已暂停', icon: 'none' })
      voice.event('pause')
    }
  },

  resumeLive() {
    if (!this.data.liveOn || !this.data.livePaused) return
    this.lastResumeTs = Date.now()
    this.setData({ livePaused: false })
    voice.event('resume')
    this.ensureAccelListener()
    this.startAccelSafe()
    if (this.data.liveMode === 'outdoor') {
      this.startLocSafe()
      this.ensureCompass()
    }
    const self = this
    this.liveTimer = setInterval(function () { self.tickLive() }, 1000)
  },

  togglePause() {
    if (this.data.livePaused) this.resumeLive()
    else this.pauseLive(false)
  },

  teardownLive() {
    this.clearHold()
    if (this.liveTimer) { clearInterval(this.liveTimer); this.liveTimer = null }
    this.stopAccel()
    this.stopLoc()
    this.stopCompass()
    this.setData({ liveOn: false, livePaused: false, mapFull: false, goalHas: false })
  },

  // ---------- 长按3秒结束（防误触，带进度条） ----------
  startHoldFinish() {
    if (!this.data.liveOn || this.holdTimer) return
    const self = this
    this.holdStartTs = Date.now()
    this.setData({ holding: true, finishProgress: 0, holdSecLeft: '3.0' })
    this.holdTimer = setInterval(function () {
      const el = Date.now() - self.holdStartTs
      if (el >= 3000) {
        self.clearHold()
        wx.vibrateShort({ type: 'medium' })
        self.finishLive()
      } else {
        self.setData({
          finishProgress: Math.round(el / 30),
          holdSecLeft: ((3000 - el) / 1000).toFixed(1)
        })
      }
    }, 80)
  },
  cancelHoldFinish() {
    if (!this.holdTimer) return
    this.clearHold()
  },
  holdFinishHint() {
    if (this.data.liveOn) wx.showToast({ title: '长按「停止保存」3秒生效', icon: 'none' })
  },
  clearHold() {
    if (this.holdTimer) { clearInterval(this.holdTimer); this.holdTimer = null }
    if (this.data.holding) this.setData({ holding: false, finishProgress: 0, holdSecLeft: '' })
  },

  finishLive() {
    const outdoor = this.data.liveMode === 'outdoor'
    const sec = this.elapsedSec()
    const steps = this.data.liveSteps
    const cadence = sec > 0 ? Math.round(steps / (sec / 60)) : 0
    const typeKey = outdoor ? this.currentType(cadence) : inAutoType(cadence)
    const t = TYPE_INFO[typeKey]
    this.teardownLive()
    store.clearSnapshot() // 正常结束，清除崩溃恢复快照
    if (outdoor) {
      if (this.trackM < 50 || sec < 60) {
        wx.showToast({ title: '距离或时长太短，本次未保存', icon: 'none' })
        return
      }
      const minutes = Math.max(1, Math.round(sec / 60))
      const kcal = sport.kcal(t.key, minutes, this.weightKg(), 'mid')
      const ts = Date.now()
      const rec = {
        typeKey: t.key, name: t.name + '(户外)', emoji: t.emoji,
        minutes: minutes, distance: +geo.fmtKm(this.trackM),
        intensity: 'GPS', source: 'gps', kcal: kcal, ts: ts
      }
      if (steps >= 5) {
        rec.count = steps
        rec.unit = '步'
        rec.cadence = cadence
      }
      const bests = store.newBestsOf(rec)
      const achBefore = achievements.evaluate(store.stats())
      store.pushOfDay(store.K.sport, store.today(), rec)
      store.saveTrack(ts, geo.simplify(this.trackPts, 8, 800))
      wx.vibrateShort({ type: 'light' })
      voice.endOutdoor(+geo.fmtKm(this.trackM), kcal)
      wx.showToast({
        title: '已保存 ' + geo.fmtKm(this.trackM) + ' 公里 +' + kcal + ' 千卡',
        icon: 'success'
      })
      this.setData({ viewDate: store.today() })
      this.celebrate(bests, achBefore)
    } else {
      if (steps < 5 || sec < 30) {
        wx.showToast({ title: '步数太少，本次未保存', icon: 'none' })
        return
      }
      const minutes = Math.max(1, Math.round(sec / 60))
      const kcal = sport.kcal(t.key, minutes, this.weightKg(), 'mid')
      const rec = {
        typeKey: t.key, name: t.name, emoji: t.emoji,
        minutes: minutes, count: steps, unit: '步',
        intensity: '实时', source: 'live', cadence: cadence,
        kcal: kcal, ts: Date.now()
      }
      const bests = store.newBestsOf(rec)
      const achBefore = achievements.evaluate(store.stats())
      store.pushOfDay(store.K.sport, store.today(), rec)
      wx.vibrateShort({ type: 'light' })
      voice.endIndoor(steps, kcal)
      wx.showToast({ title: '已保存 +' + kcal + ' 千卡 · ' + steps + ' 步', icon: 'success' })
      this.setData({ viewDate: store.today(), calDrill: false })
      this.celebrate(bests, achBefore)
    }
    this.buildCal()
    this.refresh()
  },

  // ---------- 破纪录 / 新成就庆祝 ----------
  // bests: 保存前算好的破纪录列表；achBefore: 保存前的成就快照
  celebrate(bests, achBefore) {
    const after = achievements.evaluate(store.stats())
    const news = achievements.diffDone(achBefore, after)
    const msgs = []
    if (bests && bests.length) {
      msgs.push('🏆 刷新个人纪录：' + bests.map(function (b) { return b.label + ' ' + b.text }).join('，'))
    }
    if (news.length) {
      msgs.push('🏅 解锁成就：' + news.map(function (a) { return a.icon + ' ' + a.name }).join('、'))
    }
    if (!msgs.length) return
    // 延迟弹出，先让「已保存」toast 露脸
    setTimeout(function () {
      wx.vibrateShort({ type: 'heavy' })
      voice.event('goaldone')
      wx.showModal({
        title: '🎉 干得漂亮！',
        content: msgs.join('\n'),
        showCancel: false,
        confirmText: '继续加油'
      })
    }, 900)
  }
})
