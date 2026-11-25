/** 方向 + 50 米：GPS 关卡加方位约束，走的时候朝向偏离不能超过 10° */
import { createGpsLevel } from './l-gps.js';

export default createGpsLevel({
  name: '方向 + 50 米',
  tip: '朝一个方向走出 50 米跳过广告',
  headingLimit: 10,
});
