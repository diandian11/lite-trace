// 轻迹 LiteTrace · 轨迹详情页：地图回看户外运动轨迹 + 海报分享
const store = require('../../utils/store')
const geo = require('../../utils/geo')
const poster = require('../../utils/poster')
const config = require('../../utils/config')

Page({
  data: {
    rec: null, day: '', dateLabel: '',
    mapLat: 39.908, mapLng: 116.397, poly: [],
    pace: '--\'--',
    posterShow: false
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
    this.pts = pts
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

  // ---------- 海报 ----------
  // 流程：先趁地图可见时截好图，再开弹层直接画地图版；任何一步失败都回退示意版并提示
  makePoster() {
    const self = this
    const hasTrack = this.pts && this.pts.length >= 2 && !this.data.mapFull
    if (!hasTrack) {
      this.setData({ posterShow: true })
      setTimeout(function () { self.renderPoster('') }, 150)
      return
    }
    wx.showLoading({ title: '正在生成', mask: true })
    let settled = false
    const openStyled = function () {
      if (settled) return
      settled = true
      wx.hideLoading()
      self.setData({ posterShow: true })
      setTimeout(function () { self.renderPoster('') }, 150)
      wx.showToast({ title: '已生成·轨迹示意版', icon: 'none' })
    }
    const openMapped = function (path) {
      if (settled) return
      settled = true
      wx.hideLoading()
      self.setData({ posterShow: true })
      setTimeout(function () { self.renderPoster(path) }, 150)
    }
    try {
      const mctx = wx.createMapContext('trackmap')
      mctx.includePoints({ points: this.pts, padding: [60, 60, 60, 60] })
      setTimeout(function () {
        try {
          if (typeof mctx.snapshot !== 'function') return self.tryStaticMap(openStyled, openMapped)
          mctx.snapshot({
            success: function (r) {
              if (r && r.tempImagePath) openMapped(r.tempImagePath)
              else self.tryStaticMap(openStyled, openMapped)
            },
            fail: function () { self.tryStaticMap(openStyled, openMapped) }
          })
        } catch (e) { self.tryStaticMap(openStyled, openMapped) }
      }, 900)
      // 总兑底：5秒还没结果直接走示意版，防卡 loading
      setTimeout(openStyled, 5000)
    } catch (e) { this.tryStaticMap(openStyled, openMapped) }
  },

  // 静态图海报：轨迹+起终点由腾讯服务端烘焙进图，免对齐问题
  // 失败时弹窗器出微信原始报错，方便定位（域名白名单/key配额等）
  tryStaticMap(openStyled, openMapped) {
    const url = this.staticMapUrl()
    if (!url) return openStyled()
    wx.downloadFile({
      url: url,
      success: function (r) {
        if (r.statusCode === 200 && r.tempFilePath) {
          openMapped(r.tempFilePath)
        } else {
          openStyled()
          wx.showModal({
            title: '地图服务返回 ' + r.statusCode,
            content: 'key 或参数可能有问题，截图发给小助手',
            showCancel: false
          })
        }
      },
      fail: function (e) {
        openStyled()
        wx.showModal({
          title: '真实地图获取失败',
          content: (e && e.errMsg) || '未知错误',
          showCancel: false
        })
      }
    })
  },

  // 组装静态图 URL：抽稀≤160点、6位小数；path自适应视野；起绿终红小圆点
  staticMapUrl() {
    if (!config.LBS_KEY) return ''
    const pts = this.pts
    if (!pts || pts.length < 2) return ''
    const step = Math.max(1, Math.ceil(pts.length / 160))
    const seg = []
    for (let i = 0; i < pts.length; i += step) {
      seg.push(pts[i].latitude.toFixed(6) + ',' + pts[i].longitude.toFixed(6))
    }
    const e = pts[pts.length - 1]
    const endStr = e.latitude.toFixed(6) + ',' + e.longitude.toFixed(6)
    if (seg[seg.length - 1] !== endStr) seg.push(endStr)
    const s = pts[0]
    return 'https://apis.map.qq.com/ws/staticmap/v2/' +
      '?size=640x468' +
      '&path=color:0x5EEAD4ff,weight:5|' + encodeURIComponent(seg.join(';')) +
      '&markers=size:tiny|color:0x10B981|' + s.latitude.toFixed(6) + ',' + s.longitude.toFixed(6) +
      '&markers=size:tiny|color:0xFB7185|' + endStr +
      '&key=' + config.LBS_KEY
  },

  renderPoster(mapPath) {
    const self = this
    const query = wx.createSelectorQuery().in(this)
    query.select('#posterCanvas').fields({ node: true }).exec(function (res) {
      if (!res || !res[0] || !res[0].node) {
        // 节点未就绪，短重试一次
        setTimeout(function () { self.renderPoster(mapPath) }, 400)
        return
      }
      const canvas = res[0].node
      const dpr = (wx.getWindowInfo ? wx.getWindowInfo() : { pixelRatio: 2 }).pixelRatio || 2
      const rec = self.data.rec
      if (!rec) return
      const data = {
        date: self.data.day,
        name: rec.emoji + ' ' + rec.name,
        distance: rec.distance,
        minutes: rec.minutes,
        pace: self.data.pace,
        kcal: rec.kcal,
        steps: rec.count,
        points: self.pts
      }
      const draw = function (img) {
        try {
          poster.drawPoster(canvas, dpr, data, img)
        } catch (e) {
          try { poster.drawPoster(canvas, dpr, data, null) } catch (e2) {
            wx.showToast({ title: '海报绘制失败', icon: 'none' })
          }
        }
        self.posterCanvas = canvas
        // 预生成临时文件，供转发卡片当缩略图
        wx.canvasToTempFilePath({
          canvas: canvas,
          success: function (r) { self.posterTemp = r.tempFilePath },
          fail: function () { }
        })
      }
      if (mapPath && canvas.createImage) {
        const img = canvas.createImage()
        img.onload = function () { draw(img) }
        img.onerror = function () {
          draw(null)
          wx.showToast({ title: '地图图解码失败，已用示意版', icon: 'none' })
        }
        img.src = mapPath
      } else {
        draw(null)
      }
    })
  },

  closePoster() { this.setData({ posterShow: false }) },

  noop() { },

  savePoster() {
    if (!this.posterCanvas) return
    wx.canvasToTempFilePath({
      canvas: this.posterCanvas,
      success: function (res) {
        wx.saveImageToPhotosAlbum({
          filePath: res.tempFilePath,
          success: function () { wx.showToast({ title: '已保存到相册', icon: 'success' }) },
          fail: function (err) {
            const msg = (err && err.errMsg) || ''
            if (msg.indexOf('auth') >= 0 || msg.indexOf('denied') >= 0) {
              wx.showModal({
                title: '需要相册权限',
                content: '请在设置中开启「保存到相册」权限后重试',
                confirmText: '去设置',
                success: function (r) { if (r.confirm) wx.openSetting() }
              })
            } else if (msg.indexOf('cancel') < 0) {
              wx.showToast({ title: '保存失败', icon: 'none' })
            }
          }
        })
      },
      fail: function () { wx.showToast({ title: '海报生成失败', icon: 'none' }) }
    })
  },

  onShareAppMessage() {
    const rec = this.data.rec
    const title = rec
      ? '我用轻迹完成了 ' + rec.distance + ' 公里 ' + rec.name + '，每天轻一点 💪'
      : '轻迹 LiteTrace · 每天轻一点，每步留痕迹'
    return {
      title: title,
      path: '/pages/today/today',
      imageUrl: this.posterTemp || undefined
    }
  },

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
