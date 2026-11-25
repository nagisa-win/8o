/**
 * ADB 协议层的自检：包编解码、密钥结构、签名长度与验签。
 * 用法：node tools/test-adb.mjs
 */
import { buildPacket, parsePackets, generateKey, signToken, CMD, cnxnPayload, text, base64 } from "../sites/lab/assets/adb.js";

let fail = 0;
const ok = (cond, name, extra = "") => {
  console.log(`${cond ? "✓" : "✗"} ${name}${extra ? "  " + extra : ""}`);
  if (!cond) fail += 1;
};

// 1) 包编解码 + 半包拼接
const p1 = buildPacket(CMD.CNXN, 0x01000001, 4096, cnxnPayload());
const p2 = buildPacket(CMD.AUTH, 1, 0, new Uint8Array(20).fill(7));
const joined = new Uint8Array(p1.length + p2.length);
joined.set(p1);
joined.set(p2, p1.length);

const whole = parsePackets(joined);
ok(whole.packets.length === 2, "整包解析数量", `got ${whole.packets.length}`);
ok(whole.packets[0].name === "CNXN" && whole.packets[0].arg1 === 4096, "CNXN 字段正确");
ok(text(whole.packets[0].payload).startsWith("host::features="), "CNXN 负载是 host 标识");
ok(whole.rest.length === 0, "无残留");

const cut = parsePackets(joined.subarray(0, p1.length + 10));
ok(cut.packets.length === 1 && cut.rest.length === 10, "半包被正确留到下次", `rest=${cut.rest.length}`);

// 2) magic 校验能抓住损坏的包
const broken = new Uint8Array(p1);
broken[20] ^= 0xff;
let threw = false;
try { parsePackets(broken); } catch { threw = true; }
ok(threw, "magic 不匹配时报错");

// 3) 密钥结构与签名
const key = await generateKey("test@8o.nz");
ok(key.selfCheck, "n0inv × n ≡ -1 (mod 2^32)");
const raw = Uint8Array.from(atob(key.adbPublicKey.split(" ")[0]), (c) => c.charCodeAt(0));
ok(raw.length === 524, "adbkey.pub 结构长度 524 字节", `got ${raw.length}`);
ok(new DataView(raw.buffer).getUint32(0, true) === 64, "len 字段 = 64 word");
ok(new DataView(raw.buffer).getUint32(520, true) === 65537, "exponent = 65537");
ok(key.adbPublicKey.endsWith(" test@8o.nz"), "公钥带注释后缀");

const token = crypto.getRandomValues(new Uint8Array(20));
const sig = await signToken(key.privateKey, token);
ok(sig.length === 256, "签名长度 256 字节", `got ${sig.length}`);
const verified = await crypto.subtle.verify({ name: "RSASSA-PKCS1-v1_5" }, key.publicKey, sig, token);
ok(verified, "签名可被对应公钥验证");

console.log(fail ? `\n${fail} 项失败` : "\n全部通过");
process.exit(fail ? 1 : 0);
