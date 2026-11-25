/** 传感器与权限封装：陀螺仪 / 指南针 / 麦克风 / 定位 */

function fail(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

export const orientationSupported = () => typeof window.DeviceOrientationEvent !== 'undefined';
export const motionSupported = () => typeof window.DeviceMotionEvent !== 'undefined';

export function onOrientation(cb) {
  const handler = (e) => cb(e);
  window.addEventListener('deviceorientation', handler, true);
  return () => window.removeEventListener('deviceorientation', handler, true);
}

export function onMotion(cb) {
  const handler = (e) => cb(e);
  window.addEventListener('devicemotion', handler, true);
  return () => window.removeEventListener('devicemotion', handler, true);
}

/** 方位角：iOS 用 webkitCompassHeading，Android 用 alpha 换算 */
export function readHeading(e) {
  if (!e) return null;
  if (typeof e.webkitCompassHeading === 'number' && isFinite(e.webkitCompassHeading)) {
    return (e.webkitCompassHeading + 360) % 360;
  }
  if (typeof e.alpha === 'number' && isFinite(e.alpha)) {
    return (360 - e.alpha + 360) % 360;
  }
  return null;
}

/** 等待第一帧有效数据，用来判断授权后是否真的有传感器读数 */
function probeOrientation(timeout = 1600) {
  return new Promise((resolve) => {
    let settled = false;
    const off = onOrientation((e) => {
      if (settled) return;
      const hasTilt = typeof e.beta === 'number' && typeof e.gamma === 'number';
      const hasHeading = readHeading(e) !== null;
      if (hasTilt || hasHeading) {
        settled = true;
        off();
        resolve({ ok: true, event: e });
      }
    });
    setTimeout(() => {
      if (settled) return;
      settled = true;
      off();
      resolve({ ok: false });
    }, timeout);
  });
}

let motionGranted = false;

async function queryPermission(name) {
  try {
    const res = await navigator.permissions.query({ name });
    return res.state;
  } catch (_) {
    return 'unknown';
  }
}

/** 请求运动与方向传感器权限（需在用户手势里调用） */
export async function requestMotionPermission() {
  if (!orientationSupported()) throw fail('unsupported', '设备不支持方向传感器');

  const DOE = window.DeviceOrientationEvent;
  const DME = window.DeviceMotionEvent;
  try {
    if (!motionGranted && DOE && typeof DOE.requestPermission === 'function') {
      const res = await DOE.requestPermission();
      if (res !== 'granted') throw fail('denied', '方向权限被拒绝');
    }
    if (!motionGranted && DME && typeof DME.requestPermission === 'function') {
      const res = await DME.requestPermission();
      if (res !== 'granted') throw fail('denied', '运动权限被拒绝');
    }
  } catch (e) {
    if (e && e.code) throw e;
    throw fail('denied', '权限被拒绝');
  }

  const probe = await probeOrientation(motionGranted ? 800 : 1600);
  if (!probe.ok) {
    // 安卓浏览器可以在网站设置里屏蔽运动传感器，这时事件照常触发但数值全是 null
    const state = await queryPermission('accelerometer');
    throw fail(state === 'denied' ? 'blocked' : 'no-data', '没有收到传感器数据');
  }
  motionGranted = true;
  return probe.event;
}

/** 麦克风：返回可读 RMS 音量的采集器 */
export async function requestMic() {
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
    throw fail('unsupported', '设备不支持麦克风');
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
  } catch (e) {
    const denied = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
    throw fail(denied ? 'denied' : 'failed', denied ? '麦克风权限被拒绝' : '麦克风启动失败');
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) {
    stream.getTracks().forEach((t) => t.stop());
    throw fail('unsupported', '音频分析不可用');
  }
  const ctx = new AC();
  if (ctx.state === 'suspended') { try { await ctx.resume(); } catch (_) { /* noop */ } }
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);
  const buffer = new Float32Array(analyser.fftSize);

  let stopped = false;
  return {
    read() {
      analyser.getFloatTimeDomainData(buffer);
      let sum = 0;
      for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
      return Math.sqrt(sum / buffer.length);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      try { stream.getTracks().forEach((t) => t.stop()); } catch (_) { /* noop */ }
      try { const p = ctx.close(); if (p && p.catch) p.catch(() => {}); } catch (_) { /* noop */ }
    },
  };
}

/** 定位监听 */
export function watchGeo(onPosition, onError) {
  if (!navigator.geolocation) {
    onError && onError(fail('unsupported', '设备不支持定位'));
    return { stop() {} };
  }
  const id = navigator.geolocation.watchPosition(
    (pos) => onPosition(pos.coords),
    (err) => onError && onError(fail(err && err.code === 1 ? 'denied' : 'failed', err && err.message)),
    { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 }
  );
  return { stop() { navigator.geolocation.clearWatch(id); } };
}

export function geoErrorText(code) {
  switch (code) {
    case 'denied': return '定位权限被拒绝';
    case 'unsupported': return '设备不支持定位';
    default: return '定位暂时不可用';
  }
}

export function sensorErrorText(code) {
  switch (code) {
    case 'denied': return '权限被拒绝';
    case 'unsupported': return '设备没有这个传感器';
    case 'no-data': return '收不到传感器数据';
    case 'blocked': return '浏览器屏蔽了运动传感器，请在网站设置里允许';
    default: return '传感器启动失败';
  }
}
