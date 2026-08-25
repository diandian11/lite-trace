// 轻迹 LiteTrace · GPS 轨迹工具：测距/抽稀/配速格式化

function rad(d) { return d * Math.PI / 180 }

// Haversine 两点距离（米）
function distM(a, b) {
  const R = 6371000
  const dLat = rad(b.latitude - a.latitude)
  const dLng = rad(b.longitude - a.longitude)
  const s = Math.pow(Math.sin(dLat / 2), 2) +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.pow(Math.sin(dLng / 2), 2)
  return 2 * R * Math.asin(Math.sqrt(s))
}

function fmtKm(m) { return (m / 1000).toFixed(2) }

// 配速 分'秒"/公里；距离太短显示 --
function fmtPace(sec, m) {
  if (m < 50) return '--\'--'
  const pk = sec / (m / 1000)
  const mm = Math.floor(pk / 60)
  const ss = Math.round(pk % 60)
  return mm + '\'' + (ss < 10 ? '0' : '') + ss + '"'
}

function headingName(deg) {
  const names = ['北', '东北', '东', '东南', '南', '西南', '西', '西北']
  return names[Math.round(deg / 45) % 8]
}

// 轨迹抽稀：与上一保留点距离 ≥ minM 才保留；超上限整体等距抽稀（存盘用）
function simplify(points, minM, maxPts) {
  minM = minM || 8
  maxPts = maxPts || 800
  const out = []
  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    if (!out.length || distM(out[out.length - 1], p) >= minM) out.push(p)
  }
  if (out.length > maxPts) {
    const step = out.length / maxPts
    const cut = []
    for (let i = 0; i < maxPts; i++) cut.push(out[Math.floor(i * step)])
    cut.push(out[out.length - 1])
    return cut
  }
  return out
}

// 速度→颜色（慢红 → 快绿，5档）
function speedColor(mps) {
  if (mps == null) return '#10B981'
  if (mps < 1.4) return '#EF4444'
  if (mps < 1.8) return '#F59E0B'
  if (mps < 2.2) return '#EAB308'
  if (mps < 2.7) return '#84CC16'
  return '#10B981'
}

// 轨迹速度热力线：按相邻点速度着色，同色段合并为一条 polyline；无时间戳的旧轨迹回退单色
function heatPolylines(points, width) {
  width = width || 4
  if (!points || points.length < 2) return []
  let hasT = true
  for (let i = 0; i < points.length; i++) {
    if (points[i].t == null) { hasT = false; break }
  }
  if (!hasT) return [{ points: points, color: '#10B981', width: width, arrowLine: true }]
  const lines = []
  let cur = null, curColor = null
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i]
    const dt = (b.t - a.t) / 1000
    const v = dt > 0 ? distM(a, b) / dt : 0
    const c = speedColor(v)
    if (!cur || c !== curColor) {
      if (cur) lines.push(cur)
      cur = { points: [a, b], color: c, width: width }
      curColor = c
    } else {
      cur.points.push(b)
    }
  }
  if (cur) lines.push(cur)
  return lines
}

module.exports = {
  distM: distM,
  fmtKm: fmtKm,
  fmtPace: fmtPace,
  headingName: headingName,
  simplify: simplify,
  speedColor: speedColor,
  heatPolylines: heatPolylines
}
