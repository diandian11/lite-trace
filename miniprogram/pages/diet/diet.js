const store = require('../../utils/store')
const food = require('../../utils/food')

Page({
  data: {
    meals: food.MEALS, mealIndex: 0,
    lib: food.LIB, name: '', kcal: '',
    records: [], totalKcal: 0
  },
  onShow() { this.refresh() },
  refresh() {
    const rs = store.dietOfDay(store.today())
    this.setData({
      records: rs,
      totalKcal: rs.reduce((s, x) => s + (+x.kcal || 0), 0)
    })
  },
  pickMeal(e) { this.setData({ mealIndex: +e.currentTarget.dataset.i }) },
  pickFood(e) {
    const f = this.data.lib[+e.currentTarget.dataset.i]
    this.setData({ name: f.name, kcal: String(f.kcal) })
  },
  bindName(e) { this.setData({ name: e.detail.value }) },
  bindKcal(e) { this.setData({ kcal: e.detail.value }) },
  save() {
    const kcal = +this.data.kcal
    if (!this.data.name) { wx.showToast({ title: '填个食物名', icon: 'none' }); return }
    if (!kcal || kcal <= 0) { wx.showToast({ title: '填估算千卡', icon: 'none' }); return }
    const m = this.data.meals[this.data.mealIndex]
    store.pushOfDay(store.K.diet, store.today(), {
      meal: m.key, mealName: m.name, emoji: m.emoji,
      name: this.data.name, kcal: Math.round(kcal), ts: Date.now()
    })
    wx.showToast({ title: '已记录', icon: 'success' })
    this.setData({ name: '', kcal: '' })
    this.refresh()
  },
  del(e) {
    store.removeOfDay(store.K.diet, store.today(), +e.currentTarget.dataset.idx)
    this.refresh()
  }
})
