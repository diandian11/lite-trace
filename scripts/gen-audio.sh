#!/bin/bash
# 生成运动播报语音包：macOS say(婷婷) → mp3(48k mono)
# 产出 miniprogram/audio/*.mp3，由 utils/announcer.js 按片段拼接播放
set -e
cd "$(dirname "$0")/.."
OUT=miniprogram/audio
mkdir -p "$OUT"
V=Tingting

gen() { # $1=文件名 $2=朗读文本
  say -v "$V" -o /tmp/_lt_tts.aiff "$2"
  ffmpeg -y -loglevel error -i /tmp/_lt_tts.aiff \
    -codec:a libmp3lame -b:a 48k -ac 1 -ar 24000 "$OUT/$1.mp3"
}

# 数字 0-9
gen ling 零;  gen yi 一;    gen er 二;   gen san 三
gen si 四;    gen wu 五;    gen liu 六;  gen qi 七
gen ba 八;    gen jiu 九
# 整十 10-90
gen shi 十;       gen ershi 二十;  gen sanshi 三十
gen sishi 四十;   gen wushi 五十;  gen liushi 六十
gen qishi 七十;   gen bashi 八十;  gen jiushi 九十
gen bai 百
# 单位与连接词
gen di 第
gen gongli 公里
gen yongshi 用时
gen fen 分
gen miao 秒
gen peisu 配速
gen xiaohao 消耗约
gen qianka 千卡
gen gong 共
gen bu 步
# 事件整句
gen start 运动开始，加油
gen pause 已暂停
gen resume 继续
gen end 运动结束

echo "--- 生成结果 ---"
ls "$OUT" | wc -l
du -sh "$OUT"
