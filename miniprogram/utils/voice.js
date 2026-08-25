// 轻迹 LiteTrace · 语音播报（微信同声传译插件 TTS）
// 插件不可用/合成失败时静默降级，不影响运动记录
let plugin = null
try { plugin = requirePlugin('WechatSI') } catch (e) { plugin = null }

const KEY = 'lt_voice'
const cache = {}      // 文本 -> 临时音频文件（静态短语复用，避免重复合成）
const cacheKeys = []  // 插入序，超过30条淘汰最旧
let ctx = null
let inited = false

function enabled() {
  const v = wx.getStorageSync(KEY)
  return v === '' ? true : !!v
}

function setEnabled(on) { wx.setStorageSync(KEY, !!on) }

function ensureInit() {
  if (inited) return
  inited = true
  try { wx.setInnerAudioOption({ obeyMuteSwitch: false }) } catch (e) { }
}

function play(src) {
  if (ctx) { try { ctx.destroy() } catch (e) { } }
  ctx = wx.createInnerAudioContext()
  ctx.src = src
  ctx.obeyMuteSwitch = false
  ctx.play()
}

function speak(text) {
  if (!plugin || !text || !enabled()) return
  ensureInit()
  if (cache[text]) { play(cache[text]); return }
  plugin.textToSpeech({
    lang: 'zh_CN',
    content: text,
    success(res) {
      if (res && res.filename) {
        cache[text] = res.filename
        cacheKeys.push(text)
        if (cacheKeys.length > 30) delete cache[cacheKeys.shift()]
        play(res.filename)
      }
    },
    fail() { /* 静默降级 */ }
  })
}

module.exports = { speak: speak, enabled: enabled, setEnabled: setEnabled }
