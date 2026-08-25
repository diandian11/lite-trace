const store = require('../../utils/store')
const sport = require('../../utils/sport')
const stepcounter = require('../../utils/stepcounter')

// 实时计步支持的类型（与手动打卡共用 MET 库）
const LIVE_TYPES = [
  { key: 'walk', name: '快走', emoji: '🚶' },
  { key: 'run', name: '慢跑', emoji: '🏃' }
]

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
    // 实时计步
    liveTypeIndex: 0, liveOn: false, livePaused: false,
    liveSteps: 0, liveTime: '00:00', liveCadence: 0, liveKcal: 0
  },

  onLoad() {
    this.setData({
      typeNames: sport.TYPES.map(t => t.emoji + ' ' + t.name),
      intensityNames: sport.INTENSITY.map(i => i.name)
    })
    this.counter = null
    this.liveTimer = null
    this.liveSec = 0
    this.stepTs = []
  },
  onShow() { this.refresh() },
  // 切走/锁屏自动暂停，防回调失效与计时漂移
  onHide() {
    if (this.data.liveOn && !this.data.livePaused) this.pauseLive(true)
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
    store.removeOfDay(store.K.sport, store.today(), +e.currentTarget.dataset.idx)
    this.refresh()
  },

  // ---------- 实时计步 ----------
  setLiveType(e) {
    if (this.data.liveOn) return
    this.setData({ liveTypeIndex: +e.currentTarget.dataset.i })
  },

  bindAccel(self) {
    wx.onAccelerometerChange(function (res) {
      if (!self.data.liveOn || self.data.livePaused || !self.counter) return
      const steps = self.counter.feed(res.x, res.y, res.z, Date.now())
      if (steps > self.data.liveSteps) {
        self.stepTs.push(Date.now())
        self.setData({ liveSteps: steps })
      }
    })
  },

  startLive() {
    if (this.data.liveOn) return
    this.counter = stepcounter.createStepCounter()
    this.stepTs = []
    this.liveSec = 0
    this.setData({
      liveOn: true, livePaused: false,
      liveSteps: 0, liveTime: '00:00', liveCadence: 0, liveKcal: 0
    })
    wx.vibrateShort({ type: 'light' })
    const self = this
    wx.startAccelerometer({
      interval: 'game',
      fail(res) {
        const msg = (res && (res.errMsg || res.errMsg === '')) ? res.errMsg : JSON.stringify(res)
        console.error('startAccelerometer fail:', res)
        wx.showModal({
          title: '传感器启动失败',
          content: String(msg || '未知错误').slice(0, 120),
          showCancel: false,
          confirmText: '知道了'
        })
        self.teardownLive()
      }
    })
    this.bindAccel(this)
    this.liveTimer = setInterval(function () {
      if (!self.data.livePaused) { self.liveSec++; self.tickLive() }
    }, 1000)
    this.tickLive()
  },

  tickLive() {
    const t = LIVE_TYPES[this.data.liveTypeIndex]
    const now = Date.now()
    while (this.stepTs.length && now - this.stepTs[0] > 12000) this.stepTs.shift()
    const cadence = this.stepTs.length >= 3 ? this.stepTs.length * 5 : 0  // 近12秒样本×5≈步/分
    this.setData({
      liveTime: fmtTime(this.liveSec),
      liveCadence: cadence,
      liveKcal: sport.kcal(t.key, this.liveSec / 60, this.weightKg(), 'mid')
    })
  },

  pauseLive(silent) {
    if (!this.data.liveOn || this.data.livePaused) return
    if (this.liveTimer) { clearInterval(this.liveTimer); this.liveTimer = null }
    wx.stopAccelerometer()
    wx.offAccelerometerChange()
    this.setData({ livePaused: true })
    if (!silent) wx.showToast({ title: '已暂停', icon: 'none' })
  },

  resumeLive() {
    if (!this.data.liveOn || !this.data.livePaused) return
    this.setData({ livePaused: false })
    wx.startAccelerometer({ interval: 'game' })
    this.bindAccel(this)
    const self = this
    this.liveTimer = setInterval(function () {
      if (!self.data.livePaused) { self.liveSec++; self.tickLive() }
    }, 1000)
  },

  togglePause() {
    if (this.data.livePaused) this.resumeLive()
    else this.pauseLive(false)
  },

  teardownLive() {
    if (this.liveTimer) { clearInterval(this.liveTimer); this.liveTimer = null }
    wx.stopAccelerometer()
    wx.offAccelerometerChange()
    this.setData({ liveOn: false, livePaused: false })
  },

  finishLive() {
    const steps = this.data.liveSteps
    const sec = this.liveSec
    const t = LIVE_TYPES[this.data.liveTypeIndex]
    this.teardownLive()
    if (steps < 5 || sec < 30) {
      wx.showToast({ title: '步数太少，本次未保存', icon: 'none' })
      return
    }
    const minutes = Math.max(1, Math.round(sec / 60))
    const kcal = sport.kcal(t.key, minutes, this.weightKg(), 'mid')
    const cadence = Math.round(steps / (sec / 60))
    store.pushOfDay(store.K.sport, store.today(), {
      typeKey: t.key, name: t.name, emoji: t.emoji,
      minutes: minutes, count: steps, unit: '步',
      intensity: '实时', source: 'live', cadence: cadence,
      kcal: kcal, ts: Date.now()
    })
    wx.vibrateShort({ type: 'light' })
    wx.showToast({ title: '已保存 +' + kcal + ' 千卡 · ' + steps + ' 步', icon: 'success' })
    this.refresh()
  }
})
