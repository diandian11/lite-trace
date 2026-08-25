// 轻迹 LiteTrace · 语音播报 v2：本地语音包拼接播放（零插件、零后端、离线可用）
// 背景：微信同声传译插件对个人主体不开放（类目/主体限制），改用预置音频方案。
// 语音包由 scripts/gen-audio.sh 用 macOS 婷婷 TTS 批量生成（39 个 mp3，约 224K），
// 覆盖：数字 0-9 / 整十 / 百千万、单位连接词、整句事件，播报按片段队列顺序播放。

const KEY = 'lt_voice'
const D = ['ling', 'yi', 'er', 'san', 'si', 'wu', 'liu', 'qi', 'ba', 'jiu']
const T = ['', 'shi', 'ershi', 'sanshi', 'sishi', 'wushi', 'liushi', 'qishi', 'bashi', 'jiushi']

function enabled() {
  const v = wx.getStorageSync(KEY)
  return v === '' ? true : !!v
}
function setEnabled(on) { wx.setStorageSync(KEY, !!on) }

// 数字 → 片段名数组（支持 0~9999，如 42→[四十,二]、2500→[二,千,五,百]）
function numCn(n) {
  n = Math.min(9999, Math.max(0, Math.floor(n)))
  const out = []
  const th = Math.floor(n / 1000)
  let r = n % 1000
  if (th > 0) {
    out.push(D[th], 'qian')
    if (r === 0) return out
    if (r < 100) out.push('ling')
  }
  const h = Math.floor(r / 100)
  r = r % 100
  if (h > 0) {
    out.push(D[h], 'bai')
    if (r === 0) return out
    if (r < 10) out.push('ling')
  }
  const t = Math.floor(r / 10)
  const u = r % 10
  if (t >= 1) {
    out.push(T[t])
    if (u > 0) out.push(D[u])
  } else if (u > 0 || out.length === 0) {
    // 纯 0-9；或 105/1005 这类「零X」场景（ling 已在上面补过）
    out.push(D[u])
  }
  return out
}

// ---------- 播放器：单 InnerAudioContext 队列顺序播放 ----------
let queue = []
let playing = false
let ctx = null

function next() {
  if (!queue.length) { playing = false; return }
  const name = queue.shift()
  if (!ctx) {
    ctx = wx.createInnerAudioContext()
    ctx.obeyMuteSwitch = false
    ctx.onEnded(next)
    ctx.onError(next) // 出错也继续，防止队列卡死
  }
  ctx.src = '/audio/' + name + '.mp3'
  ctx.play()
}

function speakParts(parts) {
  if (!enabled() || !parts || !parts.length) return
  if (queue.length > 24) queue = [] // 保护：积压过多时丢弃旧队列
  // 拍平嵌套片段（numCn 返回数组），过滤空值
  const flat = []
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]
    if (!p) continue
    if (Array.isArray(p)) { for (let j = 0; j < p.length; j++) if (p[j]) flat.push(p[j]) }
    else flat.push(p)
  }
  queue = queue.concat(flat)
  if (!playing) { playing = true; next() }
}

// ---------- 场景播报 ----------
// 整句事件：start / pause / resume / end / voiceon
function event(name) { speakParts([name]) }

// 每公里：第X公里，用时X分X秒，配速X分X秒
function km(km, sec, paceSec) {
  const pm = Math.floor(sec / 60)
  const ps = sec % 60
  const qm = Math.floor(paceSec / 60)
  const qs = Math.round(paceSec % 60)
  speakParts(['di', numCn(km), 'gongli', 'yongshi', numCn(pm), 'fen',
    ps > 0 ? [numCn(ps), 'miao'] : [],
    'peisu', numCn(qm), 'fen', qs > 0 ? [numCn(qs), 'miao'] : []])
}

// 室内每千步：已走X步，用时X分钟
function steps(n, sec) {
  speakParts(['yizou', numCn(n), 'bu', 'yongshi', numCn(Math.floor(sec / 60)), 'fen'])
}

// 结束总结（户外）：运动结束，共X点X公里，消耗约X千卡
function endOutdoor(kmVal, kcal) {
  const i = Math.floor(kmVal)
  const d = Math.round((kmVal - i) * 10) % 10
  const dist = d > 0 ? [numCn(i), 'dian', D[d]] : numCn(i)
  speakParts(['end', 'gong', dist, 'gongli', 'xiaohao', numCn(kcal), 'qianka'])
}

// 结束总结（室内）：运动结束，共X步，消耗约X千卡
function endIndoor(stepsN, kcal) {
  speakParts(['end', 'gong', numCn(stepsN), 'bu', 'xiaohao', numCn(kcal), 'qianka'])
}

module.exports = {
  enabled: enabled,
  setEnabled: setEnabled,
  available: function () { return true }, // 本地语音包，始终可用
  event: event,
  km: km,
  steps: steps,
  endOutdoor: endOutdoor,
  endIndoor: endIndoor,
  numCn: numCn
}
