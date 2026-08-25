const store = require('../../utils/store')
const sport = require('../../utils/sport')
const stepcounter = require('../../utils/stepcounter')
const geo = require('../../utils/geo')
const voice = require('../../utils/voice')

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
    voiceOn: true, voiceAvailable: false, // 语音播报（插件可用时才显示开关）
    // 记录列表日期浏览
    viewDate: '', todayStr: ''
  },

  onLoad() {
    this.setData({
      typeNames: sport.TYPES.map(t => t.emoji + ' ' + t.name),
      intensityNames: sport.INTENSITY.map(i => i.name),
      viewDate: store.today(),
      todayStr: store.today(),
      voiceOn: voice.available() && voice.enabled(),
      voiceAvailable: voice.available()
    })
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
  onShow() { this.refresh() },
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
  },

  // ---------- 记录列表日期浏览 ----------
  prevDay() {
    const d = new Date(this.data.viewDate.replace(/-/g, '/') + ' 00:00:00')
    d.setDate(d.getDate() - 1)
    this.setData({ viewDate: store.fmtDate(d) })
    this.refresh()
  },
  nextDay() {
    if (this.data.viewDate >= this.data.todayStr) return
    const d = new Date(this.data.viewDate.replace(/-/g, '/') + ' 00:00:00')
    d.setDate(d.getDate() + 1)
    this.setData({ viewDate: store.fmtDate(d) })
    this.refresh()
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
    this.setData({ minutes: '30', count: '', viewDate: store.today() })
    this.refresh()
  },
  del(e) {
    const idx = +e.currentTarget.dataset.idx
    const rec = this.data.records[idx]
    if (rec && rec.hasTrack) store.removeTrack(rec.ts)
    store.removeOfDay(store.K.sport, this.data.viewDate, idx)
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

  // ---------- 实时记录 ----------
  setLiveMode(e) {
    if (this.data.liveOn) return
    this.setData({ liveMode: e.currentTarget.dataset.m })
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
    this.setData({
      liveOn: true, livePaused: false,
      liveSteps: 0, liveTime: '00:00', liveCadence: 0, liveKcal: 0,
      autoLabel: '✨ 自动',
      outDist: '0.00', outPace: '--\'--', heading: '--', poly: [], mapFull: false
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
      }
    } else {
      // 室内：每满1000步播报
      const mark = Math.floor(this.data.liveSteps / 1000)
      if (mark > this.lastStepMark) {
        this.lastStepMark = mark
        voice.steps(mark * 1000, sec)
      }
    }
    this.setData(patch)
  },

  pauseLive(silent) {
    if (!this.data.liveOn || this.data.livePaused) return
    this.pausedMs += Date.now() - this.lastResumeTs
    if (this.liveTimer) { clearInterval(this.liveTimer); this.liveTimer = null }
    this.stopAccel()
    if (this.data.liveMode === 'outdoor') this.stopLoc()
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
    this.setData({ liveOn: false, livePaused: false, mapFull: false })
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
      store.pushOfDay(store.K.sport, store.today(), rec)
      store.saveTrack(ts, geo.simplify(this.trackPts, 8, 800))
      wx.vibrateShort({ type: 'light' })
      voice.endOutdoor(+geo.fmtKm(this.trackM), kcal)
      wx.showToast({
        title: '已保存 ' + geo.fmtKm(this.trackM) + ' 公里 +' + kcal + ' 千卡',
        icon: 'success'
      })
      this.setData({ viewDate: store.today() })
    } else {
      if (steps < 5 || sec < 30) {
        wx.showToast({ title: '步数太少，本次未保存', icon: 'none' })
        return
      }
      const minutes = Math.max(1, Math.round(sec / 60))
      const kcal = sport.kcal(t.key, minutes, this.weightKg(), 'mid')
      store.pushOfDay(store.K.sport, store.today(), {
        typeKey: t.key, name: t.name, emoji: t.emoji,
        minutes: minutes, count: steps, unit: '步',
        intensity: '实时', source: 'live', cadence: cadence,
        kcal: kcal, ts: Date.now()
      })
      wx.vibrateShort({ type: 'light' })
      voice.endIndoor(steps, kcal)
      wx.showToast({ title: '已保存 +' + kcal + ' 千卡 · ' + steps + ' 步', icon: 'success' })
      this.setData({ viewDate: store.today() })
    }
    this.refresh()
  }
})
