const store = require('../../utils/store')
const sport = require('../../utils/sport')
const stepcounter = require('../../utils/stepcounter')
const geo = require('../../utils/geo')

// 类型不再让用户选：室内按步频、户外按配速自动识别
function inAutoType(cadence) { return cadence >= 115 ? 'run' : 'walk' }
function outAutoType(sec, meters, cadence) {
  if (meters >= 30 && sec > 0) {
    return (sec / 60) / (meters / 1000) <= 8 ? 'run' : 'walk'
  }
  if (cadence > 0) return inAutoType(cadence)
  return 'walk'
}
const TYPE_INFO = {
  walk: { key: 'walk', name: '快走', emoji: '🚶' },
  run: { key: 'run', name: '慢跑', emoji: '🏃' }
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
    liveOn: false, livePaused: false, autoLabel: '🚶 快走',
    liveSteps: 0, liveTime: '00:00', liveCadence: 0, liveKcal: 0,
    outDist: '0.00', outPace: '--\'--', heading: '--',
    mapLat: 39.908, mapLng: 116.397, poly: [], mapFull: false
  },

  onLoad() {
    this.setData({
      typeNames: sport.TYPES.map(t => t.emoji + ' ' + t.name),
      intensityNames: sport.INTENSITY.map(i => i.name)
    })
    this.counter = null
    this.liveTimer = null
    this.stepTs = []
    this.trackPts = []
    this.trackM = 0
    this.lastLoc = null
    this.lastMapSet = 0
    this.lastHeading = -99
  },
  onShow() { this.refresh() },
  onHide() {
    if (this.data.liveOn && !this.data.livePaused && this.data.liveMode === 'indoor') {
      this.pauseLive(true)
    }
  },
  onUnload() { this.teardownLive() },

  refresh() {
    const rs = store.sportOfDay(store.today())
    this.setData({
      records: rs,
      totalMin: rs.reduce((s, x) => s + (+x.minutes || 0), 0),
      totalKcal: rs.reduce((s, x) => s + (+x.kcal || 0), 0)
    })
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
    this.setData({ minutes: '30', count: '' })
    this.refresh()
  },
  del(e) {
    const idx = +e.currentTarget.dataset.idx
    const rec = this.data.records[idx]
    if (rec && rec.hasTrack) store.removeTrack(rec.ts)
    store.removeOfDay(store.K.sport, store.today(), idx)
    this.refresh()
  },
  openTrack(e) {
    const idx = +e.currentTarget.dataset.idx
    const rec = this.data.records[idx]
    if (!rec || !rec.hasTrack) return
    wx.navigateTo({
      url: '/pages/track/track?day=' + store.today() + '&ts=' + rec.ts
    })
  },

  // ---------- 实时记录 ----------
  setLiveMode(e) {
    if (this.data.liveOn) return
    this.setData({ liveMode: e.currentTarget.dataset.m })
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
      const p = { latitude: +res.latitude.toFixed(6), longitude: +res.longitude.toFixed(6) }
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
      const now = Date.now()
      if (now - self.lastMapSet > 2500) {
        self.lastMapSet = now
        self.setData({
          outDist: geo.fmtKm(self.trackM),
          poly: [{ points: self.trackPts.slice(), color: '#10B981', width: 4, arrowLine: true }],
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
    this.lastLoc = null
    this.lastMapSet = 0
    this.lastHeading = -99
    this.liveStartTs = Date.now()
    this.pausedMs = 0
    this.lastResumeTs = Date.now()
    this.setData({
      liveOn: true, livePaused: false,
      liveSteps: 0, liveTime: '00:00', liveCadence: 0, liveKcal: 0,
      autoLabel: '🚶 快走',
      outDist: '0.00', outPace: '--\'--', heading: '--', poly: [], mapFull: false
    })
    wx.vibrateShort({ type: 'light' })
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

  tickLive() {
    const sec = this.elapsedSec()
    const outdoor = this.data.liveMode === 'outdoor'
    const now = Date.now()
    while (this.stepTs.length && now - this.stepTs[0] > 12000) this.stepTs.shift()
    const cadence = this.stepTs.length >= 3 ? this.stepTs.length * 5 : 0
    const typeKey = outdoor
      ? outAutoType(sec, this.trackM, cadence)
      : inAutoType(cadence)
    const t = TYPE_INFO[typeKey]
    const patch = {
      liveTime: fmtTime(sec),
      liveCadence: cadence,
      autoLabel: t.emoji + ' ' + t.name,
      liveKcal: sport.kcal(t.key, sec / 60, this.weightKg(), 'mid')
    }
    if (outdoor) patch.outPace = geo.fmtPace(sec, this.trackM)
    this.setData(patch)
  },

  pauseLive(silent) {
    if (!this.data.liveOn || this.data.livePaused) return
    this.pausedMs += Date.now() - this.lastResumeTs
    if (this.liveTimer) { clearInterval(this.liveTimer); this.liveTimer = null }
    this.stopAccel()
    if (this.data.liveMode === 'outdoor') this.stopLoc()
    this.setData({ livePaused: true })
    if (!silent) wx.showToast({ title: '已暂停', icon: 'none' })
  },

  resumeLive() {
    if (!this.data.liveOn || !this.data.livePaused) return
    this.lastResumeTs = Date.now()
    this.setData({ livePaused: false })
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
    if (this.liveTimer) { clearInterval(this.liveTimer); this.liveTimer = null }
    this.stopAccel()
    this.stopLoc()
    this.stopCompass()
    this.setData({ liveOn: false, livePaused: false, mapFull: false })
  },

  finishLive() {
    const outdoor = this.data.liveMode === 'outdoor'
    const sec = this.elapsedSec()
    const steps = this.data.liveSteps
    const cadence = sec > 0 ? Math.round(steps / (sec / 60)) : 0
    const typeKey = outdoor ? outAutoType(sec, this.trackM, cadence) : inAutoType(cadence)
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
      wx.showToast({
        title: '已保存 ' + geo.fmtKm(this.trackM) + ' 公里 +' + kcal + ' 千卡',
        icon: 'success'
      })
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
      wx.showToast({ title: '已保存 +' + kcal + ' 千卡 · ' + steps + ' 步', icon: 'success' })
    }
    this.refresh()
  }
})
