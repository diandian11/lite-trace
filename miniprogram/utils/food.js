// 轻迹 LiteTrace · 餐段与内置食物库（千卡/份）

const MEALS = [
  { key: 'breakfast', name: '早餐', emoji: '🥗' },
  { key: 'lunch', name: '午餐', emoji: '🍱' },
  { key: 'dinner', name: '晚餐', emoji: '🍜' },
  { key: 'snack', name: '加餐', emoji: '🍎' }
]

const LIB = [
  { name: '鸡蛋(个)', kcal: 70 },
  { name: '米饭(碗)', kcal: 200 },
  { name: '鸡胸肉100g', kcal: 133 },
  { name: '全麦面包(片)', kcal: 80 },
  { name: '牛奶250ml', kcal: 160 },
  { name: '苹果(个)', kcal: 95 },
  { name: '香蕉(根)', kcal: 105 },
  { name: '燕麦50g', kcal: 190 },
  { name: '豆浆300ml', kcal: 100 },
  { name: '面条(碗)', kcal: 350 },
  { name: '汉堡(个)', kcal: 550 },
  { name: '薯条(中)', kcal: 330 },
  { name: '可乐330ml', kcal: 140 },
  { name: '奶茶(中杯)', kcal: 400 },
  { name: '西兰花100g', kcal: 36 },
  { name: '三文鱼100g', kcal: 200 },
  { name: '牛肉100g', kcal: 250 },
  { name: '豆腐100g', kcal: 80 },
  { name: '坚果30g', kcal: 180 },
  { name: '酸奶100g', kcal: 70 },
  { name: '玉米(根)', kcal: 110 },
  { name: '红薯150g', kcal: 160 },
  { name: '饺子10个', kcal: 420 },
  { name: '沙拉(份)', kcal: 150 }
]

module.exports = { MEALS: MEALS, LIB: LIB }
