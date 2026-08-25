const store = require('../../utils/store')
const sport = require('../../utils/sport')

Page({
  data: {
    typeNames: [], typeIndex: 0,
    intensityNames: [], intensityIndex: 1,
    minutes: '30', count: '',
    records: [], totalMin: 0, totalKcal: 0
  },
  onLoad() {
    this.setData({
      typeNames: sport.TYPES.map(t => t.emoji + ' ' + t.name),
      intensityNames: sport.INTENSITY.map(i => i.name)
    })
  },
  onShow() { this.refresh() },
  refresh() {
    const rs = store.sportOfDay(store.today())
    this.setData({
      records: rs,
      totalMin: rs.reduce((s, x) => s + (+x.minutes || 0), 0),
      totalKcal: rs.reduce((s, x) => s + (+x.kcal || 0), 0)
    })
  },
  bindType(e) { this.setData({ typeIndex: +e.detail.value }) },
  bindIntensity(e) { this.setData({ intensityIndex: +e.detail.value }) },
  bindMinutes(e) { this.setData({ minutes: e.detail.value }) },
  bindCount(e) { this.setData({ count: e.detail.value }) },
  save() {
    const minutes = +this.data.minutes
    if (!minutes || minutes <= 0) {
      wx.showToast({ title: '先填运动时长', icon: 'none' })
      return
    }
    const t = sport.TYPES[this.data.typeIndex]
    const it = sport.INTENSITY[this.data.intensityIndex]
    const p = store.getProfile()
    const w = store.getWeight(store.today()) || store.latestWeight() || p.startWeight || 65
    const kcal = sport.kcal(t.key, minutes, w, it.key)
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
  }
})
