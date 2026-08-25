// 轻迹 LiteTrace · 语音播报 v3：本地语音包（多音色）+ 播放链自愈
// 背景：同声传译插件对个人主体不开放；本地 TTS 语音包零插件零后端离线可用。
// v3 修复：安卓上复用单个 InnerAudioContext 快速切 src 会导致播放链卡死
//        （结束播报无声的根因），改为每片段独立实例 + 超时自愈。
// 语音包：scripts/gen-audio.sh 生成 audio/<音色>/*.mp3

const KEY = 'lt_voice'
const TIMBRE_KEY = 'lt_voice_timbre'
// 音色列表（与生成脚本目录一致）
const TIMBRES = [
  { id: 'tt', name: '标准' },
  { id: 'ttq', name: '活力' },
  { id: 'mj', name: '温柔' }
]

const D = ['ling', 'yi', 'er', 'san', 'si', 'wu', 'liu', 'qi', 'ba', 'jiu']
const T = ['', 'shi', 'ershi', 'sanshi', 'sishi', 'wushi', 'liushi', 'qishi', 'bashi', 'jiushi']

function enabled() {
  const v = wx.getStorageSync(KEY)
  return v === '' ? true : !!v
}
function setEnabled(on) { wx.setStorageSync(KEY, !!on) }

let timbreCache = ''
function getTimbre() {
  if (timbreCache) return timbreCache
  const saved = wx.getStorageSync(TIMBRE_KEY)
  timbreCache = TIMBRES.some(function (t) { return t.id === saved }) ? saved : 'tt'
  return timbreCache
}
function setTimbre(id) {
  if (!TIMBRES.some(function (t) { return t.id === id })) return
  timbreCache = id
  wx.setStorageSync(TIMBRE_KEY, id)
}

// 数字 → 片段名数组（支持 0~9999，如 42→[四十,二]、105→[一百零五]）
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

// ---------- 播放器：每片段独立实例，串行播放 ----------
let queue = []
let playing = false
let curCtx = null
let lastAdvance = 0

function next() {
  lastAdvance = Date.now()
  if (!queue.length) { playing = false; curCtx = null; return }
  const name = queue.shift()
  const c = wx.createInnerAudioContext()
  curCtx = c
  c.obeyMuteSwitch = false
  c.src = '/audio/' + getTimbre() + '/' + name + '.mp3'
  let done = false
  const advance = function () {
    if (done || curCtx !== c) return // 只推进一次；实例已被替换则忽略
    done = true
    try { c.destroy() } catch (e) { }
    next()
  }
  c.onEnded(advance)
  c.onError(advance) // 出错也继续，防止队列卡死
  c.play()
}

function speakParts(parts) {
  if (!enabled() || !parts || !parts.length) return
  // 拍平嵌套片段（numCn 返回数组），过滤空值
  const flat = []
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]
    if (!p) continue
    if (Array.isArray(p)) { for (let j = 0; j < p.length; j++) if (p[j]) flat.push(p[j]) }
    else flat.push(p)
  }
  if (!flat.length) return
  // 自愈：播放中超过 8 秒无推进（异常卡死）→ 推毁当前实例、清队列重开
  if (playing && Date.now() - lastAdvance > 8000) {
    if (curCtx) { try { curCtx.destroy() } catch (e) { }; curCtx = null }
    queue = []
    playing = false
  }
  if (queue.length > 24) queue = [] // 保护：积压过多时丢弃旧队列
  queue = queue.concat(flat)
  if (!playing) { playing = true; next() }
}

// ---------- 场景播报 ----------
// 整句事件：start / pause / resume / end / voiceon
function event(name) { speakParts([name]) }

// 每公里：第X公里，用时X分X秒，配速X分X秒
function km(k, sec, paceSec) {
  const pm = Math.floor(sec / 60)
  const ps = sec % 60
  const qm = Math.floor(paceSec / 60)
  const qs = Math.round(paceSec % 60)
  speakParts(['di', numCn(k), 'gongli', 'yongshi', numCn(pm), 'fen',
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
  available: function () { return true },
  TIMBRES: TIMBRES,
  getTimbre: getTimbre,
  setTimbre: setTimbre,
  event: event,
  km: km,
  steps: steps,
  endOutdoor: endOutdoor,
  endIndoor: endIndoor,
  numCn: numCn
}
