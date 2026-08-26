// 轻迹 LiteTrace · 轨迹海报绘制（Canvas 2D，页面传入 type=2d 的 canvas 节点）
// 设计尺寸 690×1000 逻辑像素，绘制后由页面 canvasToTempFilePath 导出

// 轨迹点归一化到画布框内（经度按 cos(纬度) 修正，保持形状不走样）
function fitPoints(points, x, y, w, h, pad) {
  if (!points || points.length < 2) return null
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity
  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    if (p.latitude < minLat) minLat = p.latitude
    if (p.latitude > maxLat) maxLat = p.latitude
    if (p.longitude < minLng) minLng = p.longitude
    if (p.longitude > maxLng) maxLng = p.longitude
  }
  const kx = Math.cos((minLat + maxLat) / 2 * Math.PI / 180)
  const spanX = (maxLng - minLng) * kx || 1e-9
  const spanY = (maxLat - minLat) || 1e-9
  const availW = w - 2 * pad, availH = h - 2 * pad
  const scale = Math.min(availW / spanX, availH / spanY)
  const ox = x + pad + (availW - spanX * scale) / 2
  const oy = y + pad + (availH - spanY * scale) / 2
  const out = []
  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    out.push({ x: ox + (p.longitude - minLng) * kx * scale, y: oy + (maxLat - p.latitude) * scale })
  }
  return out
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function drawTrack(ctx, fitted) {
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  // 底层白色描边增轮廓
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'
  ctx.lineWidth = 12
  ctx.beginPath()
  for (let i = 0; i < fitted.length; i++) {
    if (i) ctx.lineTo(fitted[i].x, fitted[i].y)
    else ctx.moveTo(fitted[i].x, fitted[i].y)
  }
  ctx.stroke()
  // 主线：薄荷绿 + 辉光
  ctx.shadowColor = 'rgba(94,234,212,0.95)'
  ctx.shadowBlur = 16
  ctx.strokeStyle = '#5EEAD4'
  ctx.lineWidth = 7
  ctx.beginPath()
  for (let i = 0; i < fitted.length; i++) {
    if (i) ctx.lineTo(fitted[i].x, fitted[i].y)
    else ctx.moveTo(fitted[i].x, fitted[i].y)
  }
  ctx.stroke()
  ctx.shadowBlur = 0
  // 起点⦿ 终点●
  const s0 = fitted[0], s1 = fitted[fitted.length - 1]
  ctx.fillStyle = '#FFFFFF'
  ctx.beginPath(); ctx.arc(s0.x, s0.y, 7, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = '#5EEAD4'; ctx.lineWidth = 3
  ctx.beginPath(); ctx.arc(s0.x, s0.y, 7, 0, Math.PI * 2); ctx.stroke()
  ctx.fillStyle = '#FB7185'
  ctx.beginPath(); ctx.arc(s1.x, s1.y, 7, 0, Math.PI * 2); ctx.fill()
}

// 主入口：data = { date, name, distance, minutes, pace, kcal, steps, points }
// mapImg: 可选，地图图 Image（snapshot截图 或 腾讯静态图），轨迹线已烘焙图内，不再自绘免错位
function drawPoster(canvas, dpr, data, mapImg) {
  const W = 690, H = 1000
  canvas.width = W * dpr
  canvas.height = H * dpr
  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)
  const hasMap = !!(mapImg && mapImg.width)

  // 背景：深夜绿渐变
  const bg = ctx.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#04211c')
  bg.addColorStop(0.55, '#064e3b')
  bg.addColorStop(1, '#065f46')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  // 右上角薄荷光晕
  const glow = ctx.createRadialGradient(W * 0.88, H * 0.1, 10, W * 0.88, H * 0.1, 340)
  glow.addColorStop(0, 'rgba(94,234,212,0.16)')
  glow.addColorStop(1, 'rgba(94,234,212,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)

  // 顶部：日期 + 品牌
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.font = '22px sans-serif'
  ctx.fillText(data.date, 48, 62)
  ctx.textAlign = 'right'
  ctx.font = '600 24px sans-serif'
  ctx.fillStyle = '#5EEAD4'
  ctx.fillText('轻迹 LiteTrace', W - 48, 62)

  // 运动名
  ctx.textAlign = 'left'
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.font = '28px sans-serif'
  ctx.fillText(data.name, 48, 116)

  // 大数字：公里
  const distStr = data.distance != null ? String(data.distance) : '--'
  ctx.fillStyle = '#FFFFFF'
  ctx.font = '800 100px sans-serif'
  ctx.fillText(distStr, 44, 226)
  const dw = ctx.measureText(distStr).width
  ctx.font = '500 32px sans-serif'
  ctx.fillStyle = '#5EEAD4'
  ctx.fillText('km', 44 + dw + 14, 226)

  // 数据行
  ctx.font = '26px sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.8)'
  const bits = [data.minutes + ' 分钟', data.pace + ' /km', data.kcal + ' 千卡']
  if (data.steps) bits.push(data.steps + ' 步')
  ctx.fillText(bits.join('  ·  '), 48, 274)

  // 轨迹卡
  const boxX = 24, boxY = 318, boxW = W - 48, boxH = 470
  if (hasMap) {
    // 真实地图打底：圆角裁剪 cover 铺满 + 夜色蒙层压杂色 + 细描边
    ctx.save()
    roundRect(ctx, boxX, boxY, boxW, boxH, 28)
    ctx.clip()
    const iw = mapImg.width, ih = mapImg.height
    const sc = Math.max(boxW / iw, boxH / ih)
    const dw2 = iw * sc, dh = ih * sc
    ctx.drawImage(mapImg, boxX + (boxW - dw2) / 2, boxY + (boxH - dh) / 2, dw2, dh)
    const dim = ctx.createLinearGradient(0, boxY, 0, boxY + boxH)
    dim.addColorStop(0, 'rgba(4,33,28,0.45)')
    dim.addColorStop(0.5, 'rgba(4,33,28,0.32)')
    dim.addColorStop(1, 'rgba(4,33,28,0.55)')
    ctx.fillStyle = dim
    ctx.fillRect(boxX, boxY, boxW, boxH)
    ctx.restore()
    roundRect(ctx, boxX, boxY, boxW, boxH, 28)
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'
    ctx.lineWidth = 2
    ctx.stroke()
    // 轨迹线/起终点已烘焙在地图图内（静态图服务端绘制 / 地图组件截图自带），不再叠加
  } else {
    // 示意版：半透明卡 + 自绘辉光轨迹线
    roundRect(ctx, boxX, boxY, boxW, boxH, 28)
    ctx.fillStyle = 'rgba(255,255,255,0.06)'
    ctx.fill()
    const fitted = fitPoints(data.points, boxX, boxY, boxW, boxH, 42)
    if (fitted) {
      drawTrack(ctx, fitted)
    } else {
      ctx.textAlign = 'center'
      ctx.fillStyle = 'rgba(255,255,255,0.4)'
      ctx.font = '28px sans-serif'
      ctx.fillText('轨迹未保存', W / 2, boxY + boxH / 2 - 10)
      ctx.font = '22px sans-serif'
      ctx.fillText('下一次户外记录将自动留痕', W / 2, boxY + boxH / 2 + 30)
    }
  }

  // 底部 slogan
  ctx.textAlign = 'center'
  ctx.fillStyle = 'rgba(255,255,255,0.72)'
  ctx.font = '600 28px sans-serif'
  ctx.fillText('每天轻一点 · 每步留痕迹', W / 2, H - 84)
  ctx.fillStyle = 'rgba(94,234,212,0.5)'
  ctx.font = '20px sans-serif'
  ctx.fillText('— 记录于 轻迹 LiteTrace —', W / 2, H - 46)

  return { W: W, H: H }
}

module.exports = { drawPoster: drawPoster, fitPoints: fitPoints }
