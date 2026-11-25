/** 关卡顺序：10 个原始关卡 + 8 个新增关卡（标 ★），按难度穿插 */
import silent from './l-silent.js';
import hold from './l-hold.js';
import fakeClose from './l-fake-close.js';
import captcha from './l-captcha.js';
import swipe from './l-swipe.js';
import traffic from './l-traffic.js';
import rhythm from './l-rhythm.js';
import bubble from './l-bubble.js';
import shake from './l-shake.js';
import disc from './l-disc.js';
import compass from './l-compass.js';
import pinch from './l-pinch.js';
import mic from './l-mic.js';
import tilt from './l-tilt.js';
import sswipe from './l-sswipe.js';
import timing from './l-timing.js';
import gps from './l-gps.js';
import gpsCompass from './l-gps-compass.js';

const ORDER = [
  silent, // 1  静默 30 秒
  hold, // 2  ★ 稳定长按
  fakeClose, // 3  真假关闭按钮
  captcha, // 4  ★ 迷彩验证码
  swipe, // 5  垂直上滑
  traffic, // 6  红绿灯
  rhythm, // 7  ★ 节拍点击
  bubble, // 8  水平仪
  shake, // 9  ★ 摇一摇
  disc, // 10 光滑圆盘
  compass, // 11 指南针定格
  pinch, // 12 ★ 双指捏合
  mic, // 13 麦克风静音
  tilt, // 14 水平 + 旋转
  sswipe, // 15 ★ S 形滑动（触屏 + 加速度计 + 指南针）
  timing, // 16 ★ 计时挑战
  gps, // 17 GPS 移动 50 米
  gpsCompass, // 18 ★ 方向 + 50 米
];

export const LEVELS = ORDER.map((level, index) => ({ ...level, n: index + 1 }));
export const TOTAL = LEVELS.length;
