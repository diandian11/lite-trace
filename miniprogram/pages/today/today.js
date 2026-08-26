const store = require('../../utils/store')

// 连续天数→火焰等级：无火/单火(1-2)/燃烧(3-6)/双火(7-13)/三火(14-29)/四火金焰(30+)
function flameOf(n) {
  if (n <= 0) return { emoji: '', cls: 'f0' }
  if (n < 3) return { emoji: '🔥', cls: 'f1' }
  if (n < 7) return { emoji: '🔥', cls: 'f2' }
  if (n < 14) return { emoji: '🔥🔥', cls: 'f3' }
  if (n < 30) return { emoji: '🔥🔥🔥', cls: 'f3' }
  return { emoji: '🔥🔥🔥🔥', cls: 'f4' }
}

Page({
  data: {
    date: '', streak: 0, flameEmoji: '', flameCls: 'f0', hello: '',
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
    const streak = store.streak()
    const f = flameOf(streak)
    this.setData({
      date: t,
      streak: streak,
      flameEmoji: f.emoji, flameCls: f.cls,
      hello: streak > 0 ? '连续打卡 ' + streak + ' 天' : '今天记一笔，点燃你的火焰',
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
