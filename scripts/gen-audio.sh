#!/bin/bash
# 生成运动播报语音包 v2：多音色版本
# 三套音色：tt=标准(婷婷175) ttq=活力(婷婷205加速) mj=温柔(美佳台湾腔)
# 产出 miniprogram/audio/<音色>/*.mp3，由 utils/voice.js 按片段拼接播放
set -e
cd "$(dirname "$0")/.."
OUT=miniprogram/audio

# 片段名 -> 朗读文本
NAMES=(ling yi er san si wu liu qi ba jiu \
  shi ershi sanshi sishi wushi liushi qishi bashi jiushi \
  bai qian wan \
  di gongli yongshi fen miao peisu xiaohao qianka gong bu yizou dian \
  start pause resume end voiceon)
TEXTS=(零 一 二 三 四 五 六 七 八 九 \
  十 二十 三十 四十 五十 六十 七十 八十 九十 \
  百 千 万 \
  第 公里 用时 分 秒 配速 消耗约 千卡 共 步 已走 点 \
  "运动开始，加油" 已暂停 继续 "运动结束" 语音播报已开启)

gen_pack() { # $1=目录 $2=语音 $3=语速
  local dir="$1" v="$2" rate="$3"
  mkdir -p "$OUT/$dir"
  for i in "${!NAMES[@]}"; do
    say -v "$v" -r "$rate" -o /tmp/_lt_$dir.aiff "${TEXTS[$i]}"
    ffmpeg -y -loglevel error -i /tmp/_lt_$dir.aiff \
      -codec:a libmp3lame -b:a 48k -ac 1 -ar 24000 "$OUT/$dir/${NAMES[$i]}.mp3"
  done
  echo "$dir: $(ls "$OUT/$dir" | wc -l | tr -d ' ') 片段"
}

gen_pack tt  Tingting 175   # 标准女声
gen_pack ttq Tingting 205   # 活力（加速版）
gen_pack mj  Meijia   175   # 温柔（台湾腔）

# 清掉 v1 的根目录旧包（已迁移到子目录）
find "$OUT" -maxdepth 1 -name '*.mp3' -delete
echo "--- 总计 ---"
du -sh "$OUT"
