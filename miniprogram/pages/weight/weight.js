const store = require('../../utils/store')
const wt = require('../../utils/weighttrend')

const COLORS = {
  primary: '#10B981', mint: '#5EEAD4', accent: '#FB7185',
  ink: '#1F2937', ink3: '#9CA3AF', grid: 'rgba(31,41,55,0.06)',
  band: 'rgba(16,185,129,0.10)', bandLine: 'rgba(16,185,129,0.35)'
}

Page({
  data: {
    kg: '', records: [],
    current: null, target: 65, start: null, lost: 0, remain: 0,
    // 趋势
    range: '365', chartEmpty: true,
    bmi: null, bmiLabel: '', bmiColor: COLORS.primary,
    healthyMin: null, healthyMax: null,
    advice: null
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

    // BMI 与健康区间（身高固定时 BMI 与体重同形，曲线里画健康体重带）
    const bmi = wt.bmiOf(current, p.height)
    const cat = wt.bmiCategory(bmi)
    const hr = wt.healthyWeightRange(p.height)

    // 趋势预警（近28天拟合）
    const slope = wt.weeklySlope(rs, 28)
    const goalReached = !!(current && target && current <= target)
    const advice = wt.trendAdvice(slope, { goalReached })

    this.setData({
      records: rs.slice(-14).reverse(),
      current: current, target: target, start: start,
      lost: lost, remain: remain,
      kg: todayW != null ? String(todayW) : '',
      bmi: bmi, bmiLabel: cat ? cat.label : '', bmiColor: cat ? cat.color : COLORS.primary,
      healthyMin: hr ? hr[0] : null, healthyMax: hr ? hr[1] : null,
      advice: advice
    }, () => this.drawChart(rs, p))
  },
  setRange(e) {
    const range = e.currentTarget.dataset.range
    if (range === this.data.range) return
    this.setData({ range }, () => this.refresh())
  },
  drawChart(rs, p) {
    const days = +this.data.range
    const cd = wt.buildChartData(rs, days)
    if (!cd.points.length) { this.setData({ chartEmpty: true }); return }
    this.setData({ chartEmpty: false })
    wx.createSelectorQuery().in(this)
      .select('#trendChart').fields({ node: true, size: true })
      .exec((res) => {
        if (!res || !res[0] || !res[0].node) return
        this.renderChart(res[0].node, res[0].width, res[0].height, cd, p)
      })
  },
  renderChart(canvas, cssW, cssH, cd, p) {
    const dpr = (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()).pixelRatio || 2
    canvas.width = cssW * dpr
    canvas.height = cssH * dpr
    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, cssW, cssH)

    const padL = 38, padR = 10, padT = 12, padB = 22
    const iw = cssW - padL - padR, ih = cssH - padT - padB
    let yMin = cd.yMin, yMax = cd.yMax

    // 目标线纳入范围；健康带做软夹逼（至少露出与数据的交叠部分）
    const target = p.targetWeight
    const healthy = wt.healthyWeightRange(p.height)

    const X = (i) => padL + (cd.points.length === 1 ? iw / 2 : i / (cd.points.length - 1) * iw)
    const Y = (kg) => padT + (yMax - kg) / (yMax - yMin) * ih

    // 健康体重区间带（BMI 18.5~24 对应体重）
    if (healthy) {
      const bTop = Math.max(Y(Math.min(healthy[1], yMax)), padT)
      const bBot = Math.min(Y(Math.max(healthy[0], yMin)), padT + ih)
      if (bBot > bTop) {
        ctx.fillStyle = COLORS.band
        ctx.fillRect(padL, bTop, iw, bBot - bTop)
        ctx.strokeStyle = COLORS.bandLine
        ctx.lineWidth = 1
        ctx.setLineDash([4, 4])
        ctx.beginPath()
        ctx.moveTo(padL, Y(healthy[1])); ctx.lineTo(padL + iw, Y(healthy[1]))
        ctx.moveTo(padL, Y(healthy[0])); ctx.lineTo(padL + iw, Y(healthy[0]))
        ctx.stroke()
        ctx.setLineDash([])
        ctx.fillStyle = COLORS.primary
        ctx.font = '9px sans-serif'
        ctx.textAlign = 'left'
        ctx.fillText('健康', padL + 4, bTop + 10)
      }
    }

    // 网格 + Y 轴刻度（4条）
    ctx.strokeStyle = COLORS.grid
    ctx.fillStyle = COLORS.ink3
    ctx.font = '9px sans-serif'
    ctx.textAlign = 'right'
    for (let g = 0; g <= 3; g++) {
      const kg = yMin + (yMax - yMin) * g / 3
      const y = Y(kg)
      ctx.beginPath()
      ctx.moveTo(padL, y); ctx.lineTo(padL + iw, y)
      ctx.stroke()
      ctx.fillText(kg.toFixed(1), padL - 4, y + 3)
    }

    // 目标虚线
    if (target && target >= yMin && target <= yMax) {
      ctx.strokeStyle = COLORS.accent
      ctx.lineWidth = 1
      ctx.setLineDash([5, 4])
      ctx.beginPath()
      ctx.moveTo(padL, Y(target)); ctx.lineTo(padL + iw, Y(target))
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = COLORS.accent
      ctx.font = '9px sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText('目标', padL + iw - 22, Y(target) - 3)
    }

    // 体重主线
    const pts = cd.points
    ctx.strokeStyle = COLORS.primary
    ctx.lineWidth = 2
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.beginPath()
    for (let i = 0; i < pts.length; i++) {
      if (i) ctx.lineTo(X(i), Y(pts[i].kg))
      else ctx.moveTo(X(i), Y(pts[i].kg))
    }
    ctx.stroke()

    // 末点高亮
    const last = pts[pts.length - 1]
    ctx.fillStyle = '#fff'
    ctx.strokeStyle = COLORS.primary
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(X(pts.length - 1), Y(last.kg), 3.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = COLORS.primary
    ctx.font = 'bold 10px sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText(last.kg.toFixed(1), X(pts.length - 1) - 6, Y(last.kg) - 6)

    // X 轴时间标注（首/中/尾）
    ctx.fillStyle = COLORS.ink3
    ctx.font = '9px sans-serif'
    ctx.textAlign = 'left'
    const fmt = (s) => s.slice(5).replace('-', '/')
    ctx.fillText(fmt(pts[0].date), padL, cssH - 6)
    ctx.textAlign = 'center'
    if (pts.length > 2) ctx.fillText(fmt(pts[Math.floor((pts.length - 1) / 2)].date), padL + iw / 2, cssH - 6)
    ctx.textAlign = 'right'
    ctx.fillText(fmt(last.date), padL + iw, cssH - 6)
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
