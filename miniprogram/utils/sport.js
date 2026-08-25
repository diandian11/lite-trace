// 轻迹 LiteTrace · 运动类型库与 MET 消耗估算
// kcal = MET × 体重(kg) × 时长(h) × 强度系数

const TYPES = [
  { key: 'run', name: '跑步', met: 9.0, emoji: '🏃' },
  { key: 'walk', name: '快走', met: 4.3, emoji: '🚶' },
  { key: 'rope', name: '跳绳', met: 11.0, emoji: '🪢' },
  { key: 'ride', name: '骑行', met: 7.5, emoji: '🚴' },
  { key: 'gym', name: '撸铁', met: 5.0, emoji: '🏋️' },
  { key: 'yoga', name: '瑜伽', met: 3.0, emoji: '🧘' },
  { key: 'swim', name: '游泳', met: 8.3, emoji: '🏊' },
  { key: 'hiit', name: 'HIIT', met: 10.0, emoji: '🔥' },
  { key: 'ball', name: '球类', met: 6.5, emoji: '⚽' },
  { key: 'stretch', name: '拉伸', met: 2.3, emoji: '🤸' }
]

const INTENSITY = [
  { key: 'low', name: '低强度', f: 0.85 },
  { key: 'mid', name: '中等', f: 1.0 },
  { key: 'high', name: '高强度', f: 1.15 }
]

function findType(key) {
  for (let i = 0; i < TYPES.length; i++) if (TYPES[i].key === key) return TYPES[i]
  return TYPES[0]
}

function findIntensity(key) {
  for (let i = 0; i < INTENSITY.length; i++) if (INTENSITY[i].key === key) return INTENSITY[i]
  return INTENSITY[1]
}

function kcal(typeKey, minutes, weightKg, intensityKey) {
  const t = findType(typeKey)
  const i = findIntensity(intensityKey)
  return Math.round(t.met * (weightKg || 65) * (minutes / 60) * i.f)
}

module.exports = {
  TYPES: TYPES,
  INTENSITY: INTENSITY,
  kcal: kcal,
  findType: findType,
  findIntensity: findIntensity
}
