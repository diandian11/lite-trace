const store = require('../../utils/store')
const achievements = require('../../utils/achievements')

Page({
  data: {
    name: '', genders: ['男', '女'], genderIndex: 0,
    height: '170', birthYear: '1995', targetWeight: '65',
    stats: { sportSessions: 0, activeDays: 0, dietRecords: 0, bestStreak: 0, totalKm: 0, totalKcal: 0 },
    pbItems: [], doneCount: 0, totalCount: 0, badges: []
  },
  onShow() {
    const p = store.getProfile()
    const s = store.stats()
    const badges = achievements.evaluate(s)
    let doneCount = 0
    badges.forEach(function (b) { if (b.done) doneCount++ })
    this.setData({
      name: p.name || '',
      genderIndex: p.gender === 'female' ? 1 : 0,
      height: String(p.height || 170),
      birthYear: String(p.birthYear || 1995),
      targetWeight: String(p.targetWeight || 65),
      stats: s,
      pbItems: this.buildPbView(store.pbs()),
      badges: badges,
      doneCount: doneCount,
      totalCount: badges.length
    })
  },
  // 个人纪录视图模型：无记录显示占位
  buildPbView(pb) {
    function cell(icon, label, rec, fmt) {
      const has = !!rec
      return {
        icon: icon, label: label,
        val: has ? fmt(rec.value) : '--',
        unit: has ? recUnit(label) : '',
        sub: has ? rec.emoji + ' ' + rec.date.slice(5) + ' 创下' : '虚位以待'
      }
    }
    function recUnit(label) {
      if (label === '最远单次') return 'km'
      if (label === '最久单次') return '分钟'
      if (label === '单次步数') return '步'
      return '千卡'
    }
    return [
      cell('🛣️', '最远单次', pb.distance, function (v) { return v.toFixed(2) }),
      cell('⏱️', '最久单次', pb.minutes, function (v) { return String(v) }),
      cell('🦶', '单次步数', pb.steps, function (v) { return String(v) }),
      cell('💥', '单次最燃', pb.kcal, function (v) { return String(v) })
    ]
  },
  tapBadge(e) {
    const b = this.data.badges[+e.currentTarget.dataset.i]
    if (!b) return
    const curStr = b.cat === 'maxDist' ? b.cur.toFixed(1) : String(b.cur)
    wx.showModal({
      title: b.icon + ' ' + b.name,
      content: (b.done ? '✅ 已达成\n' : '') + b.desc + '\n当前进度 ' + curStr + ' / ' + b.goal,
      showCancel: false,
      confirmText: '继续加油'
    })
  },
  bindName(e) { this.setData({ name: e.detail.value }) },
  bindGender(e) { this.setData({ genderIndex: +e.detail.value }) },
  bindHeight(e) { this.setData({ height: e.detail.value }) },
  bindBirth(e) { this.setData({ birthYear: e.detail.value }) },
  bindTarget(e) { this.setData({ targetWeight: e.detail.value }) },
  save() {
    const p = store.getProfile()
    const height = +this.data.height
    const birthYear = +this.data.birthYear
    const target = +this.data.targetWeight
    const thisYear = new Date().getFullYear()
    if (!height || height < 50 || height > 250) {
      wx.showToast({ title: '身高填 50~250 cm', icon: 'none' }); return
    }
    if (!birthYear || birthYear < 1920 || birthYear > thisYear) {
      wx.showToast({ title: '出生年填 1920~' + thisYear, icon: 'none' }); return
    }
    if (!target || target < 25 || target > 300) {
      wx.showToast({ title: '目标体重填 25~300 kg', icon: 'none' }); return
    }
    p.name = (this.data.name || '').trim().slice(0, 20)
    p.gender = this.data.genderIndex === 1 ? 'female' : 'male'
    p.height = height
    p.birthYear = birthYear
    p.targetWeight = target
    store.saveProfile(p)
    wx.showToast({ title: '已保存', icon: 'success' })
  },
  clearData() {
    wx.showModal({
      title: '清空所有数据？',
      content: '运动/饮食/体重/喝水记录将全部删除，无法恢复',
      confirmText: '清空',
      confirmColor: '#FB7185',
      success: (res) => {
        if (res.confirm) {
          store.clearAll()
          wx.showToast({ title: '已清空', icon: 'none' })
          this.onShow()
        }
      }
    })
  }
})
