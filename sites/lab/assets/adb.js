/**
 * 最小 ADB 协议实现（浏览器端）：USB 包编解码 + RSA 认证签名 + adbkey.pub 结构生成。
 * 参考 AOSP 的 protocol.txt 与 adb_auth.cpp，只实现握手与单路 shell 所需的部分。
 * 这个文件不碰 DOM，可以在 Node 里直接单测。
 */

export const CMD = {
  CNXN: 0x4e584e43,
  AUTH: 0x48545541,
  OPEN: 0x4e45504f,
  OKAY: 0x59414b4f,
  CLSE: 0x45534c43,
  WRTE: 0x45545257,
  SYNC: 0x434e5953,
};

export const AUTH_TYPE = { TOKEN: 1, SIGNATURE: 2, RSAPUBLICKEY: 3 };

const HEADER = 24;

const enc = new TextEncoder();
const dec = new TextDecoder();

/** 组装一个 ADB 包；magic 是 command 取反，用来做完整性校验 */
export function buildPacket(command, arg0, arg1, payload = new Uint8Array(0)) {
  const body = payload instanceof Uint8Array ? payload : new Uint8Array(payload);
  const buf = new ArrayBuffer(HEADER + body.length);
  const view = new DataView(buf);
  view.setUint32(0, command, true);
  view.setUint32(4, arg0, true);
  view.setUint32(8, arg1, true);
  view.setUint32(12, body.length, true);
  view.setUint32(16, 0, true); // 新版协议不再校验 CRC，固定 0
  view.setUint32(20, (command ^ 0xffffffff) >>> 0, true);
  new Uint8Array(buf, HEADER).set(body);
  return new Uint8Array(buf);
}

/** 解析缓冲区里所有完整的包，返回剩下的半包（USB 传输可能截断） */
export function parsePackets(chunk) {
  const packets = [];
  let offset = 0;

  while (chunk.length - offset >= HEADER) {
    const view = new DataView(chunk.buffer, chunk.byteOffset + offset, HEADER);
    const command = view.getUint32(0, true);
    const arg0 = view.getUint32(4, true);
    const arg1 = view.getUint32(8, true);
    const length = view.getUint32(12, true);
    const magic = view.getUint32(20, true);

    if ((command ^ 0xffffffff) >>> 0 !== magic) {
      throw new Error(`包校验失败：magic 不匹配（command 0x${command.toString(16)}）`);
    }
    if (chunk.length - offset < HEADER + length) break;

    packets.push({
      command,
      name: Object.keys(CMD).find((k) => CMD[k] === command) || `0x${command.toString(16)}`,
      arg0,
      arg1,
      length,
      payload: chunk.subarray(offset + HEADER, offset + HEADER + length),
    });
    offset += HEADER + length;
  }

  return { packets, rest: chunk.subarray(offset) };
}

/** 文本负载（去掉结尾的 \0） */
export const text = (bytes) => dec.decode(bytes).replace(/\0+$/, "");

export const bytes = (str) => enc.encode(str);

/* ==================== 密钥与签名 ==================== */

const modInverse = (a, m) => {
  let [old_r, r] = [((a % m) + m) % m, m];
  let [old_s, s] = [1n, 0n];
  while (r !== 0n) {
    const q = old_r / r;
    [old_r, r] = [r, old_r - q * r];
    [old_s, s] = [s, old_s - q * s];
  }
  return ((old_s % m) + m) % m;
};

const bytesToBigInt = (u8) => {
  let v = 0n;
  for (const b of u8) v = (v << 8n) | BigInt(b);
  return v;
};

const bigIntToLeWords = (v, words) => {
  const out = new Uint8Array(words * 4);
  let n = v;
  for (let i = 0; i < words; i += 1) {
    out[i * 4] = Number(n & 0xffn);
    out[i * 4 + 1] = Number((n >> 8n) & 0xffn);
    out[i * 4 + 2] = Number((n >> 16n) & 0xffn);
    out[i * 4 + 3] = Number((n >> 24n) & 0xffn);
    n >>= 32n;
  }
  return out;
};

/**
 * 生成 ADB 需要的 RSA-2048 密钥，并算出 Android 那套 RSAPublicKey 结构（base64 后可直接写进 adbkey.pub）。
 * 结构：len(4) n0inv(4) n[len*4] rr[len*4] exponent(4)，全部小端。
 */
export async function generateKey(label = "lab@8o.nz") {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
      hash: "SHA-1",
    },
    true,
    ["sign", "verify"]
  );

  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const modulusBytes = Uint8Array.from(atob(jwk.n.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  const n = bytesToBigInt(modulusBytes);

  const words = modulusBytes.length / 4; // 64
  const n0inv = (0x100000000n - modInverse(n & 0xffffffffn, 0x100000000n)) & 0xffffffffn;
  const R = 1n << BigInt(words * 32);
  const rr = (R * R) % n;
  const exponent = 65537n;

  const struct = new Uint8Array(4 + 4 + words * 4 + words * 4 + 4);
  const view = new DataView(struct.buffer);
  view.setUint32(0, words, true);
  view.setUint32(4, Number(n0inv), true);
  struct.set(bigIntToLeWords(n, words), 8);
  struct.set(bigIntToLeWords(rr, words), 8 + words * 4);
  view.setUint32(8 + words * 8, Number(exponent), true);

  return {
    privateKey: pair.privateKey,
    publicKey: pair.publicKey,
    adbPublicKey: `${base64(struct)} ${label}`,
    modulusBits: modulusBytes.length * 8,
    /** 自检用：n0inv × n ≡ -1 (mod 2^32) */
    selfCheck: ((n0inv * (n & 0xffffffffn)) & 0xffffffffn) === 0xffffffffn,
  };
}

export function base64(u8) {
  let s = "";
  for (const b of u8) s += String.fromCharCode(b);
  return btoa(s);
}

/** ADB 要的签名就是 PKCS#1 v1.5 + SHA-1 的裸签名，长度固定 256 字节 */
export async function signToken(privateKey, token) {
  const sig = await crypto.subtle.sign({ name: "RSASSA-PKCS1-v1_5" }, privateKey, token);
  return new Uint8Array(sig);
}

/** 握手用的 CNXN 负载 */
export function cnxnPayload(maxData = 4096) {
  // features 里带上 shell_v2 之外最保守的集合，老设备也能认
  const banner = "host::features=cmd,stat_v2,ls_v2,fixed_push_mkdir,apex";
  return bytes(`${banner}\0`);
}

/** Open 一个服务通道，例如 shell:getprop ro.product.model */
export function servicePayload(service) {
  return bytes(`${service}\0`);
}

/** 从原始 USB 描述符里找一个 ADB 接口（class 0xFF / subclass 0x42 / protocol 0x01） */
export function findAdbInterface(device) {
  for (const config of device.configurations || []) {
    for (const iface of config.interfaces) {
      for (const alt of iface.alternates) {
        if (alt.interfaceClass === 0xff && alt.interfaceSubclass === 0x42) {
          const inEp = alt.endpoints.find((e) => e.direction === "in" && e.type === "bulk");
          const outEp = alt.endpoints.find((e) => e.direction === "out" && e.type === "bulk");
          if (inEp && outEp) {
            return { configValue: config.configurationValue, interfaceNumber: iface.interfaceNumber, alternate: alt, inEp, outEp };
          }
        }
      }
    }
  }
  return null;
}

export const hex = (n, pad = 2) => `0x${n.toString(16).padStart(pad, "0")}`;
