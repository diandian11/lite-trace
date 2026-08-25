// 轻迹 LiteTrace · stepcounter 仿真测试（node tests/stepcounter.test.js）
// 模拟 50Hz 加速度采样（game 档），基线 z=1g

const { createStepCounter } = require('../miniprogram/utils/stepcounter')

let failures = 0

function run(name, buildSignal, durationSec, check) {
  const c = createStepCounter()
  const dt = 20 // ms，50Hz
  let steps = 0
  for (let t = 0; t <= durationSec * 1000; t += dt) {
    const dz = buildSignal(t)
    const s = c.feed(0, 0, 1 + dz, t)
    if (s > steps) steps = s
  }
  // 结束后再空跑 3 秒，让暂计步充分结算/丢弃
  let final = steps
  for (let t = durationSec * 1000 + dt; t <= (durationSec + 3) * 1000; t += dt) {
    final = c.feed(0, 0, 1, t)
  }
  const ok = check(final)
  console.log((ok ? '✓' : '✗') + ' ' + name + ' → 最终步数 ' + final)
  if (!ok) failures++
}

// —— 场景1：正常快走 2Hz(120步/分)，摆幅 0.25g，20 秒 ≈ 40 步
run('快走 2Hz×20s', t => 0.25 * Math.sin(2 * Math.PI * 2.0 * t / 1000), 20,
  n => n >= 32 && n <= 48)

// —— 场景2：轻摆走路 1.7Hz(102步/分)，摆幅 0.20g，15 秒 ≈ 25 步
run('轻幅慢走 1.7Hz×15s', t => 0.20 * Math.sin(2 * Math.PI * 1.7 * t / 1000), 15,
  n => n >= 18 && n <= 28)

// —— 场景3：单次大晃（拿起来看一眼）
run('单次大晃不计数', t => (t > 3000 && t < 3250) ? 0.4 * Math.sin(Math.PI * (t - 3000) / 250) : 0, 8,
  n => n === 0)

// —— 场景4：两次晃动（间隔1秒，如调整握姿）
function twoBumps(t) {
  if (t > 3000 && t < 3220) return 0.35 * Math.sin(Math.PI * (t - 3000) / 220)
  if (t > 4000 && t < 4220) return 0.35 * Math.sin(Math.PI * (t - 4000) / 220)
  return 0
}
run('两次晃动不计数', twoBumps, 10, n => n === 0)

// —— 场景5：持续小抖动 0.1g（低于触发阈值）
run('持续小抖动不计数', t => 0.10 * Math.sin(2 * Math.PI * 3 * t / 1000), 10,
  n => n === 0)

// —— 场景6：三连快晃（间隔400ms，凑不满4步的爆发）
function threeBumps(t) {
  const starts = [3000, 3400, 3800]
  for (let i = 0; i < 3; i++) {
    if (t > starts[i] && t < starts[i] + 220) return 0.3 * Math.sin(Math.PI * (t - starts[i]) / 220)
  }
  return 0
}
run('三连快晃不计数', threeBumps, 10, n => n === 0)

// —— 场景7：走5秒 → 停3秒 → 再走5秒（停顿后能恢复计数）
function walkPauseWalk(t) {
  const w = f => 0.25 * Math.sin(2 * Math.PI * f * t / 1000)
  if (t < 5000) return w(2.0)
  if (t >= 8000 && t < 13000) return w(2.0)
  return 0
}
run('走-停-走 恢复计数', walkPauseWalk, 15, n => n >= 12 && n <= 26)

process.exit(failures ? 1 : 0)
