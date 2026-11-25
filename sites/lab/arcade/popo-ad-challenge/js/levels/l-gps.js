/** GPS 移动 50 米；可选再加一个方位约束（走的时候朝向不能偏） */
import { el, clamp, haversine } from '../utils.js';
import { watchGeo, geoErrorText, onOrientation, readHeading, requestMotionPermission, sensorErrorText } from '../sensors.js';
import { splash, askPermission, bait, hintPill, guardTaps } from './shared.js';

const GOAL = 50;

/** 先取一次位置来触发系统授权弹窗 */
function probeGeo() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(Object.assign(new Error('unsupported'), { code: 'geo-unsupported' }));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      () => resolve(true),
      (err) => reject(Object.assign(new Error('geo'), { code: err && err.code === 1 ? 'geo-denied' : 'geo-failed' })),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

function permissionText(code) {
  if (String(code).startsWith('geo-')) {
    return geoErrorText(String(code).slice(4));
  }
  return sensorErrorText(code);
}

/**
 * headingLimit 为 0 时只看位移；大于 0 时，走路过程中方位角偏离起始朝向超过这个度数就失败。
 * 拿不到定位或指南针都不判负，只是跳不过去，看完 30 秒广告正常过关。
 */
export function createGpsLevel({ name, tip, headingLimit = 0 }) {
  return {
    name,
    sub: headingLimit ? '广告 30 秒 · 定位 + 指南针' : '广告 30 秒 · 定位',
    sensor: true,
    tip,
    mount(root, api) {
      splash(root, api, { img: 3, dim: true, cta: false });
      askPermission(root, api, {
        icon: headingLimit ? '🧭' : '📍',
        title: headingLimit ? '需要定位 + 指南针' : '需要定位权限',
        desc: headingLimit
          ? `本关同时读取 GPS 和方位。授权后朝一个方向一直走 50 米，朝向偏离超过 ${headingLimit}° 就结束。`
          : '本关用 GPS 计算真实位移。授权后拿着手机走 50 米，室外信号更准。',
        errorText: permissionText,
        run: async () => {
          if (headingLimit) {
            await requestMotionPermission();
          }
          await probeGeo();
        },
      })
        .then(() => begin(true))
        .catch(() => begin(false));

      function begin(usable) {
        const size = 230;
        const r = 100;
        const c = 2 * Math.PI * r;
        const box = el('div');
        box.style.cssText = `position:absolute;left:50%;top:50%;width:${size}px;height:${size}px;margin:-${size / 2}px 0 0 -${size / 2}px;z-index:6;animation:popIn .6s var(--ease-spring) backwards`;
        box.innerHTML = `
          <div style="position:absolute;inset:16px;border-radius:50%;background:rgba(10,15,2,.6)"></div>
          <div style="position:absolute;inset:16px;border-radius:50%;box-shadow:0 0 0 0 rgba(184,237,110,.5);animation:ripple 2s ease-out infinite"></div>
          <svg viewBox="0 0 ${size} ${size}" style="position:absolute;inset:0;transform:rotate(-90deg);overflow:visible">
            <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="10"/>
            <circle class="fg" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--lime)" stroke-width="10" stroke-linecap="round"
              stroke-dasharray="${c}" stroke-dashoffset="${c}" style="transition:stroke-dashoffset .5s var(--ease-out);filter:drop-shadow(0 0 8px var(--lime))"/>
          </svg>
          <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px">
            <span style="font-size:22px;line-height:1">${headingLimit ? '🧭' : '📍'}</span>
            <b class="val num" style="font-size:44px;line-height:1;font-weight:900;letter-spacing:-1px">0.0</b>
            <span style="font-size:12px;line-height:1;color:var(--t3)">/ ${GOAL} 米</span>
            ${headingLimit ? '<span class="dev num" style="margin-top:4px;font-size:12px;line-height:1;color:var(--t2)">偏差 0°</span>' : ''}
          </div>`;
        root.appendChild(box);
        const fg = box.querySelector('.fg');
        const val = box.querySelector('.val');
        const devNode = box.querySelector('.dev');

        bait(root, api, { text: '假装已经走完 50 米', reason: 'GPS 不吃这一套', bottom: '9%', ico: '🏃' });
        const hint = hintPill(root, '正在获取定位…');
        if (!usable) {
          hint.set(`${headingLimit ? '定位或指南针' : '定位'}不可用，看完这支广告就能过关`, 'warn');
        }

        let origin = null;
        let best = 0;
        let finished = false;
        // degraded：彻底拿不到定位（无权限等），只能等广告走完
        // lost：暂时没信号，拿到新位置后自动恢复
        let degraded = !usable;
        let lost = false;

        // 页面任何地方被点击才算失败；定位、指南针出什么问题都只是继续等倒计时
        const offGuard = guardTaps(root, api, '点到了广告画面', { allow: '' });

        // 方位约束：拿到第一个定位点之后，才开始定起始朝向并判定偏差
        let offHeading = () => {};
        let startCalib = () => {};
        if (usable && headingLimit) {
          const diff = (a, b) => ((a - b + 540) % 360) - 180;
          const samples = [];
          let base = null;
          let overSince = 0;
          let calib = 0;
          let calibrating = false;
          const off = onOrientation((e) => {
            const h = readHeading(e);
            if (h == null || finished || degraded || !calibrating) {
              return;
            }
            if (base == null) {
              samples.push(h);
              return;
            }
            const d = Math.abs(diff(h, base));
            devNode.textContent = `偏差 ${d.toFixed(0)}°`;
            devNode.style.color = d > headingLimit * 0.6 ? 'var(--yellow)' : 'var(--t2)';
            if (d > headingLimit) {
              overSince = overSince || performance.now();
              if (performance.now() - overSince > 250) {
                finished = true;
                api.fail(`方向偏了 ${d.toFixed(0)}°`);
              }
            } else {
              overSince = 0;
            }
          });
          startCalib = () => {
            if (calibrating) {
              return;
            }
            calibrating = true;
            calib = setTimeout(() => {
              if (samples.length) {
                const ref = samples[0];
                base = (ref + samples.reduce((a, v) => a + diff(v, ref), 0) / samples.length + 360) % 360;
              }
              // 一直读不到方位时 base 保持为空，不做方位判定，只看位移
            }, 900);
          };
          offHeading = () => {
            clearTimeout(calib);
            off();
          };
        }

        const geo = usable
          ? watchGeo(
              (coords) => {
                if (finished || degraded) {
                  return;
                }
                if (lost) {
                  lost = false;
                }
                if (!origin) {
                  origin = { lat: coords.latitude, lon: coords.longitude };
                  hint.set(headingLimit ? '定位成功，朝前直走' : '定位成功，走起来吧', 'good');
                  startCalib();
                  return;
                }
                best = Math.max(best, haversine(origin.lat, origin.lon, coords.latitude, coords.longitude));
                val.textContent = best.toFixed(1);
                fg.style.strokeDashoffset = String(c * (1 - clamp(best / GOAL, 0, 1)));
                const acc = coords.accuracy || 0;
                if (acc > 80) {
                  hint.set(`信号较弱 ±${acc.toFixed(0)} 米，去空旷处`, 'warn');
                } else {
                  hint.set(`还差 ${Math.max(0, GOAL - best).toFixed(0)} 米`);
                }
                if (best >= GOAL) {
                  finished = true;
                  api.win();
                }
              },
              (err) => {
                if (finished) {
                  return;
                }
                // 任何定位问题都不判负，继续倒计时；被拒绝就不再等定位，其余情况拿到新位置后恢复
                if (err && err.code === 'denied') {
                  degraded = true;
                  hint.set('定位不可用，看完这支广告就能过关', 'warn');
                } else {
                  lost = true;
                  hint.set(origin ? '定位信号丢失，走到空旷处会自动恢复' : '暂时没有定位，继续等待也能过关', 'warn');
                }
              }
            )
          : { stop() {} };

        api.onCleanup(() => {
          finished = true;
          geo.stop();
          offHeading();
          offGuard();
        });
      }
    },
  };
}

export default createGpsLevel({ name: 'GPS 移动 50 米', tip: '走出 50 米跳过广告' });
