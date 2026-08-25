const store = require('../../utils/store')

Page({
  data: {
    date: '', streak: 0,
    intake: 0, budget: 0, bmr: 0, burnSport: 0, pct: 0,
    sportMin: 0, dietCount: 0, weightKg: '',
    water: 0
  },
  onShow() { this.refresh() },
  refresh() {
    const t = store.today()
    const p = store.getProfile()
    const w = store.getWeight(t) || store.latestWeight()
    const bmr = store.bmr(p, w)
    const sports = store.sportOfDay(t)
    const burnSport = sports.reduce((s, x) => s + (+x.kcal || 0), 0)
    const intake = store.intakeKcal(t)
    const budget = bmr + burnSport
    this.setData({
      date: t,
      streak: store.streak(),
      intake: intake, budget: budget, bmr: bmr, burnSport: burnSport,
      pct: budget ? Math.min(100, Math.round(intake / budget * 100)) : 0,
      sportMin: sports.reduce((s, x) => s + (+x.minutes || 0), 0),
      dietCount: store.dietOfDay(t).length,
      weightKg: w != null ? w : '',
      water: store.waterOfDay(t)
    })
  },
  addWater() {
    this.setData({ water: store.addWater(store.today(), 250) })
  },
  subWater() {
    this.setData({ water: store.addWater(store.today(), -250) })
  },
  goTab(e) {
    wx.switchTab({ url: e.currentTarget.dataset.url })
  }
})
