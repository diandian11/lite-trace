// 轻迹 LiteTrace · 轨迹详情页：地图回看户外运动轨迹
const store = require('../../utils/store')
const geo = require('../../utils/geo')

Page({
  data: {
    rec: null, day: '', dateLabel: '',
    mapLat: 39.908, mapLng: 116.397, poly: [],
    pace: '--\'--'
  },

  onLoad(opts) {
    const day = opts.day || store.today()
    const ts = +opts.ts
    const rs = store.sportOfDay(day)
    let rec = null
    let idx = -1
    for (let i = 0; i < rs.length; i++) {
      if (rs[i].ts === ts) { rec = rs[i]; idx = i; break }
    }
    if (!rec) {
      wx.showToast({ title: '记录不存在', icon: 'none' })
      setTimeout(function () { wx.navigateBack() }, 800)
      return
    }
    this.recIdx = idx
    const pts = store.getTrack(ts) || []
    this.setData({
      rec: rec, day: day, dateLabel: day,
      pace: geo.fmtPace(rec.minutes * 60, (rec.distance || 0) * 1000),
      mapLat: pts.length ? pts[0].latitude : 39.908,
      mapLng: pts.length ? pts[0].longitude : 116.397,
      poly: geo.heatPolylines(pts, 4),
      mapFull: false
    })
    // 视野自动适配整条轨迹
    if (pts.length > 1) {
      setTimeout(function () {
        const ctx = wx.createMapContext('trackmap')
        ctx.includePoints({ points: pts, padding: [60, 60, 60, 60] })
      }, 400)
    }
  },

  toggleMapFull() { this.setData({ mapFull: !this.data.mapFull }) },

  del() {
    const self = this
    wx.showModal({
      title: '删除这条记录？',
      content: '运动记录与轨迹将一起删除',
      confirmColor: '#EF4444',
      success(r) {
        if (!r.confirm) return
        store.removeTrack(self.data.rec.ts)
        store.removeOfDay(store.K.sport, self.data.day, self.recIdx)
        wx.navigateBack()
      }
    })
  }
})
