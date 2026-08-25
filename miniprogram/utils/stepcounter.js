// 轻迹 LiteTrace · 加速度计步检测器
// 原理：三轴合加速度 → EMA 重力基线 → 动态阈值峰值检测 + 迟滞回调 + 最小步间隔抗抖动
// 输入样本单位为 g（wx.onAccelerometerChange 原始输出）

function createStepCounter(opts) {
  opts = opts || {}
  const minIntervalMs = opts.minIntervalMs || 300  // 两步最小间隔，对应步频上限 200 步/分
  const emaAlpha = opts.emaAlpha || 0.06           // 重力基线平滑系数（越小越稳）
  const baseTh = opts.baseTh || 0.13               // 起步固定阈值(g)
  const minTh = opts.minTh || 0.09                 // 自适应阈值下限

  let base = null        // 重力基线（慢速 EMA）
  let armed = false      // 是否处于「越过阈值、等待回落」状态
  let peakVal = 0        // 本段 armed 内最大波幅
  let peakAvg = 0.22     // 近期有效步峰自适应均值
  let lastStepTs = 0
  let steps = 0

  // 喂入一个采样点，返回累计步数
  function feed(x, y, z, t) {
    const mag = Math.sqrt(x * x + y * y + z * z)
    if (base === null) { base = mag; return steps }

    const d = mag - base
    const th = Math.max(minTh, peakAvg * 0.6)

    if (!armed) {
      // 平静期才缓慢跟踪基线，避免真实步伐把基线拉高导致漏计
      base += (mag - base) * emaAlpha
      if (d > Math.max(th, baseTh)) { armed = true; peakVal = d }
    } else {
      if (d > peakVal) peakVal = d
      if (d < th * 0.4) {
        // 完整回落 → 判定为一步
        if (t - lastStepTs >= minIntervalMs) {
          steps++
          peakAvg = peakAvg * 0.7 + peakVal * 0.3
          lastStepTs = t
        }
        armed = false
      } else if (t - lastStepTs > 2500) {
        // 长时间不回落：持续抖动（如晃手机），放弃本段
        armed = false
      }
    }
    return steps
  }

  return {
    feed: feed,
    reset: function () {
      base = null; armed = false; peakVal = 0
      lastStepTs = 0; steps = 0; peakAvg = 0.22
    }
  }
}

module.exports = { createStepCounter: createStepCounter }
