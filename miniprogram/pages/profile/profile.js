const store = require('../../utils/store')

Page({
  data: {
    name: '', genders: ['男', '女'], genderIndex: 0,
    height: '170', birthYear: '1995', targetWeight: '65',
    stats: { sportSessions: 0, activeDays: 0, dietRecords: 0, bestStreak: 0 }
  },
  onShow() {
    const p = store.getProfile()
    this.setData({
      name: p.name || '',
      genderIndex: p.gender === 'female' ? 1 : 0,
      height: String(p.height || 170),
      birthYear: String(p.birthYear || 1995),
      targetWeight: String(p.targetWeight || 65),
      stats: store.stats()
    })
  },
  bindName(e) { this.setData({ name: e.detail.value }) },
  bindGender(e) { this.setData({ genderIndex: +e.detail.value }) },
  bindHeight(e) { this.setData({ height: e.detail.value }) },
  bindBirth(e) { this.setData({ birthYear: e.detail.value }) },
  bindTarget(e) { this.setData({ targetWeight: e.detail.value }) },
  save() {
    const p = store.getProfile()
    p.name = this.data.name
    p.gender = this.data.genderIndex === 1 ? 'female' : 'male'
    p.height = +this.data.height || 170
    p.birthYear = +this.data.birthYear || 1995
    p.targetWeight = +this.data.targetWeight || 65
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
