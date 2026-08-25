// 轻迹 LiteTrace · 加速度计步检测器 v2
// 原理：三轴合加速度 → EMA 重力基线 → 动态阈值峰值检测 + 迟滞回调
// v2 抗误计（issue #1）：
//   1. 提高固定触发门槛 0.13g→0.18g，自适应阈值下限 0.09g→0.13g
//   2. 爆发门控：连续 ≥4 步（6 秒窗口内）才开始计入总数，
//      散发的 1~2 次晃动进「暂计」并在停止后丢弃 —— 单晃手机不再计数
//   3. 步间隔合理带 300~1200ms，超出视为噪声
// 输入样本单位为 g（wx.onAccelerometerChange 原始输出）

const START_TH = 0.18      // 起步固定触发阈值(g)
const MIN_TH = 0.13        // 自适应阈值下限(g)
const MIN_INTERVAL = 300   // 两步最小间隔(ms)，步频上限 200/分
const BURST_MIN = 4        // 连续多少步才确认是「走路」
const BURST_WINDOW = 6000  // 爆发窗口(ms)
const BURST_IDLE_RESET = 2500 // 停止多久后丢弃未确认的暂计步

function createStepCounter(opts) {
  opts = opts || {}
  const emaAlpha = opts.emaAlpha || 0.06

  let base = null        // 重力基线（慢速 EMA）
  let armed = false      // 越过阈值、等待回落
  let armedTs = 0        // 本次 armed 的时刻（防卡死计时基准）
  let peakVal = 0
  let peakAvg = 0.28     // 近期有效步峰自适应均值
  let lastStepTs = 0
  let committed = 0      // 已确认步数
  let pending = []       // 暂计步时间戳（未达 BURST_MIN 前）

  function prune(t) {
    // 窗口外的暂计步直接丢；停顿超时也丢
    while (pending.length && t - pending[0] > BURST_WINDOW) pending.shift()
    if (pending.length && pending.length < BURST_MIN &&
        t - pending[pending.length - 1] > BURST_IDLE_RESET) pending = []
  }

  function feed(x, y, z, t) {
    const mag = Math.sqrt(x * x + y * y + z * z)
    if (base === null) { base = mag; return committed }
    prune(t)

    const d = mag - base
    const th = Math.max(MIN_TH, peakAvg * 0.6)

    if (!armed) {
      base += (mag - base) * emaAlpha // 平静期才缓慢跟踪基线
      if (d > Math.max(th, START_TH)) { armed = true; armedTs = t; peakVal = d }
    } else {
      if (d > peakVal) peakVal = d
      if (d < th * 0.4) {
        // 完整回落 → 候选一步；仅拒绝过快(<300ms)的伪峰，长间隙视为新节奏开始
        const gap = t - lastStepTs
        if (lastStepTs === 0 || gap >= MIN_INTERVAL) {
          pending.push(t)
          if (pending.length >= BURST_MIN) {
            committed += pending.length
            pending = []
          }
          peakAvg = peakAvg * 0.75 + peakVal * 0.25
          lastStepTs = t
        }
        armed = false
      } else if (t - armedTs > 2500) {
        armed = false // 持续顶在高位不回落：非步伐形态，放弃（从本次armed起算）
      }
    }
    return committed + pending.length
  }

  return {
    feed: feed,
    reset: function () {
      base = null; armed = false; armedTs = 0; peakVal = 0
      lastStepTs = 0; committed = 0; pending = []; peakAvg = 0.28
    }
  }
}

module.exports = { createStepCounter: createStepCounter }
