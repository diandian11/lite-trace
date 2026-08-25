const store = require('../../utils/store')

Page({
  data: {
    kg: '', records: [],
    current: null, target: 65, start: null, lost: 0, remain: 0
  },
  onShow() { this.refresh() },
  refresh() {
    const p = store.getProfile()
    const rs = store.weightRecords()
    const current = rs.length ? rs[rs.length - 1].kg : null
    const start = p.startWeight || current
    const target = p.targetWeight
    const lost = (start && current) ? +(start - current).toFixed(1) : 0
    const remain = (current && target) ? +(current - target).toFixed(1) : 0
    const todayW = store.getWeight(store.today())
    this.setData({
      records: rs.slice(-14).reverse(),
      current: current, target: target, start: start,
      lost: lost, remain: remain,
      kg: todayW != null ? String(todayW) : ''
    })
  },
  bindKg(e) { this.setData({ kg: e.detail.value }) },
  save() {
    const kg = parseFloat(this.data.kg)
    if (!kg || kg < 25 || kg > 300) {
      wx.showToast({ title: '体重填 25~300 kg', icon: 'none' })
      return
    }
    const v = +kg.toFixed(1)
    store.setWeight(store.today(), v)
    const p = store.getProfile()
    if (!p.startWeight) {
      p.startWeight = v
      p.startDate = store.today()
      store.saveProfile(p)
    }
    wx.showToast({ title: '已记录 ' + v + ' kg', icon: 'success' })
    this.refresh()
  }
})
