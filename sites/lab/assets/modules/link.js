/**
 * 连接舱：WebRTC 点对点传文件。
 * 信令完全手动（复制粘贴 SDP），所以不需要任何服务器中转；文件也不经过任何服务器。
 * 附带一个本机回环自检：同一个页面起两个 PeerConnection，验证通道与分块逻辑正确。
 */

const CHUNK = 16 * 1024;
const HIGH_WATER = 4 * 1024 * 1024;
const ICE = { iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }] };

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const fmtSize = (n) => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
};

/** SDP 用 base64 打包，方便直接粘进聊天窗口 */
const packSdp = (desc) => btoa(JSON.stringify({ type: desc.type, sdp: desc.sdp }));
const unpackSdp = (text) => JSON.parse(atob(text.trim()));

/** 等 ICE 收集完再导出，避免"粘过去连不上" */
const waitIce = (pc) =>
  new Promise((resolve) => {
    if (pc.iceGatheringState === "complete") return resolve();
    const timer = setTimeout(resolve, 3000);
    pc.addEventListener("icegatheringstatechange", () => {
      if (pc.iceGatheringState === "complete") {
        clearTimeout(timer);
        resolve();
      }
    });
  });

let cleanup = null;

export async function mount(root) {
  root.innerHTML = `
    <div class="module__head">
      <div>
        <p class="label">// BAY-05 · LINK</p>
        <h2>连接舱</h2>
        <p>WebRTC 点对点传文件：信令靠手动复制粘贴，文件不落任何服务器。也可以先跑一次本机回环自检看实现对不对。</p>
      </div>
      <div class="row">
        <button class="btn-sm" id="selftest" type="button">本机回环自检</button>
      </div>
    </div>

    <div class="module__body">
      <div class="card">
        <div class="card__title"><span>SIGNALING · 发起方</span><span id="offer-state">未开始</span></div>
        <div class="row" style="margin-bottom:10px">
          <button class="btn-sm" id="make-offer" type="button">① 生成本端信令</button>
          <button class="btn-sm" id="use-answer" type="button">③ 填入对方应答</button>
        </div>
        <textarea id="local-sdp" rows="3" spellcheck="false" placeholder="生成后把这段发给对方"></textarea>
        <textarea id="remote-sdp" rows="3" spellcheck="false" placeholder="把对方的应答粘贴到这里" style="margin-top:8px"></textarea>
      </div>

      <div class="card">
        <div class="card__title"><span>SIGNALING · 接收方</span><span id="answer-state">未开始</span></div>
        <div class="field">
          <label for="incoming">对方的信令</label>
          <textarea id="incoming" rows="3" spellcheck="false" placeholder="粘贴对方发来的那一段"></textarea>
        </div>
        <div class="row">
          <button class="btn-sm" id="make-answer" type="button">② 生成应答</button>
        </div>
      </div>

      <div class="card">
        <div class="card__title"><span>TRANSFER</span><span id="link-state">未连接</span></div>
        <input type="file" id="file" disabled />
        <div class="link-bar"><i id="send-bar"></i></div>
        <p class="hint" id="send-info">通道建立后可以选择文件发送</p>
        <div class="link-bar"><i id="recv-bar" style="background:linear-gradient(to right,var(--mint),var(--accent))"></i></div>
        <p class="hint" id="recv-info">接收进度会显示在这里</p>
      </div>

      <div class="card">
        <div class="card__title"><span>LOG</span><span>ICE / 通道</span></div>
        <pre class="out" id="link-log" style="max-height:220px">—</pre>
      </div>
    </div>
  `;

  const $ = (s) => root.querySelector(s);
  const listeners = [];
  const on = (el, ev, fn) => {
    el.addEventListener(ev, fn);
    listeners.push([el, ev, fn]);
  };

  const pcs = new Set();
  const log = (line) => {
    const el = $("#link-log");
    el.textContent = el.textContent === "—" ? line : `${el.textContent}\n${line}`;
    el.scrollTop = el.scrollHeight;
  };

  /** 建一个 PeerConnection 并挂上统一的日志与通道处理 */
  function newPeer({ onChannel, label }) {
    const pc = new RTCPeerConnection(ICE);
    pcs.add(pc);

    pc.addEventListener("iceconnectionstatechange", () => {
      log(`[${label}] ICE ${pc.iceConnectionState}`);
      if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") setLinkState("已连接", "var(--mint)");
      if (pc.iceConnectionState === "failed") setLinkState("ICE 失败", "var(--rose)");
    });

    pc.addEventListener("datachannel", (ev) => onChannel(ev.channel));

    return pc;
  }

  function setLinkState(textValue, color) {
    $("#link-state").textContent = textValue;
    $("#link-state").style.color = color || "";
  }

  /** 挂到 DataChannel 上：管协议、进度、收文件 */
  function bindChannel(channel) {
    channel.binaryType = "arraybuffer";
    sendFile.channel = channel; // 两侧都能用同一个通道往回发
    $("#file").disabled = false;
    setLinkState("已连接", "var(--mint)");
    log(`通道 ${channel.label} 已打开`);

    let meta = null;
    let received = 0;
    let parts = [];

    channel.addEventListener("message", (ev) => {
      const data = ev.data;

      if (typeof data === "string") {
        if (data === "done") {
          const blob = new Blob(parts, { type: meta?.type || "application/octet-stream" });
          parts = [];
          const url = URL.createObjectURL(blob);
          $("#recv-info").innerHTML = `收到 <b>${esc(meta?.name || "文件")}</b> · ${fmtSize(blob.size)} · <a href="${url}" download="${esc(meta?.name || "download")}" style="color:var(--accent)">下载</a>`;
          $("#recv-bar").style.width = "100%";
          meta = null;
          received = 0;
          return;
        }
        try {
          meta = JSON.parse(data);
          parts = [];
          received = 0;
          $("#recv-info").textContent = `正在接收 ${meta.name}（${fmtSize(meta.size)}）…`;
          $("#recv-bar").style.width = "0%";
        } catch {
          log("收到无法解析的文本消息");
        }
        return;
      }

      parts.push(data);
      received += data.byteLength;
      const pct = meta?.size ? Math.min(100, (received / meta.size) * 100) : 0;
      $("#recv-bar").style.width = `${pct}%`;
      $("#recv-info").textContent = `接收中 ${pct.toFixed(0)}% · ${fmtSize(received)} / ${fmtSize(meta?.size || 0)}`;
    });

    channel.addEventListener("close", () => {
      setLinkState("通道已关闭");
      $("#file").disabled = true;
    });

    channel.addEventListener("open", () => {
      $("#file").disabled = false;
    });

    return channel;
  }

  /** 发送：先发一段元信息，再按 16KB 切块，最后 done */
  async function sendFile(file) {
    const channel = sendFile.channel;
    if (!channel || channel.readyState !== "open") return;

    channel.send(JSON.stringify({ name: file.name, size: file.size, type: file.type }));
    let sent = 0;
    const started = performance.now();
    $("#send-info").textContent = `发送 ${file.name}…`;

    for (let offset = 0; offset < file.size; offset += CHUNK) {
      if (channel.bufferedAmount > HIGH_WATER) {
        await new Promise((resolve) => {
          const check = () => (channel.bufferedAmount <= HIGH_WATER ? resolve() : setTimeout(check, 40));
          check();
        });
      }
      const slice = await file.slice(offset, offset + CHUNK).arrayBuffer();
      channel.send(slice);
      sent += slice.byteLength;

      const pct = (sent / file.size) * 100;
      $("#send-bar").style.width = `${pct}%`;
      const secs = (performance.now() - started) / 1000;
      $("#send-info").textContent = `发送中 ${pct.toFixed(0)}% · ${fmtSize(sent)} / ${fmtSize(file.size)} · ${(sent / 1024 / 1024 / Math.max(secs, 0.001)).toFixed(1)} MB/s`;
    }

    channel.send("done");
    $("#send-info").textContent = `已发送 ${file.name}（${fmtSize(file.size)}）`;
  }

  /* ---------- 发起方 ---------- */

  on($("#make-offer"), "click", async () => {
    $("#offer-state").textContent = "生成中…";
    const pc = newPeer({ label: "发起方", onChannel: (ch) => bindChannel(ch) });
    sendFile.channel = pc.createDataChannel("file", { ordered: true });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitIce(pc);
    $("#local-sdp").value = packSdp(pc.localDescription);
    $("#offer-state").textContent = "已生成，等对方应答";
    renderSendTarget();
  });

  on($("#use-answer"), "click", async () => {
    try {
      const pc = [...pcs].find((p) => p.signalingState === "have-local-offer");
      if (!pc) throw new Error("先生成本端信令");
      const desc = unpackSdp($("#remote-sdp").value);
      await pc.setRemoteDescription(desc);
      $("#offer-state").textContent = "已配对";
      renderSendTarget();
    } catch (err) {
      $("#offer-state").textContent = `失败：${err.message}`;
    }
  });

  /* ---------- 接收方 ---------- */

  on($("#make-answer"), "click", async () => {
    try {
      $("#answer-state").textContent = "生成中…";
      const pc = newPeer({
        label: "接收方",
        onChannel: (ch) => {
          bindChannel(ch);
        },
      });
      const desc = unpackSdp($("#incoming").value);
      await pc.setRemoteDescription(desc);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await waitIce(pc);
      $("#remote-sdp").value = packSdp(pc.localDescription);
      $("#answer-state").textContent = "已生成应答，发给对方";
      renderSendTarget();
    } catch (err) {
      $("#answer-state").textContent = `失败：${err.message}`;
    }
  });

  /* ---------- 选文件 ---------- */

  function renderSendTarget() {
    $("#file").disabled = ![...pcs].some((pc) => pc.connectionState === "connected" || pc.iceConnectionState === "connected");
  }

  on($("#file"), "change", (e) => {
    const file = e.target.files?.[0];
    if (file) sendFile(file);
  });

  /* ---------- 本机回环自检 ---------- */

  on($("#selftest"), "click", async () => {
    const out = $("#recv-info");
    out.textContent = "自检中：建立环回连接并传输 1 MB 随机数据…";
    $("#link-log").textContent = "—";

    try {
      const a = new RTCPeerConnection();
      const b = new RTCPeerConnection();
      pcs.add(a);
      pcs.add(b);

      let received = 0;
      let expected = 0;
      const result = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("10 秒内没传完")), 10000);
        b.addEventListener("datachannel", (ev) => {
          const ch = ev.channel;
          ch.binaryType = "arraybuffer";
          ch.addEventListener("message", (e) => {
            if (typeof e.data === "string") {
              if (e.data === "done") {
                clearTimeout(timer);
                resolve(received);
              }
              return;
            }
            received += e.data.byteLength;
          });
        });
      });

      const ch = a.createDataChannel("probe", { ordered: true });
      a.onicecandidate = (e) => e.candidate && b.addIceCandidate(e.candidate);
      b.onicecandidate = (e) => e.candidate && a.addIceCandidate(e.candidate);

      const offer = await a.createOffer();
      await a.setLocalDescription(offer);
      await b.setRemoteDescription(offer);
      const answer = await b.createAnswer();
      await b.setLocalDescription(answer);
      await a.setRemoteDescription(answer);

      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("通道 8 秒内未打开")), 8000);
        ch.addEventListener("open", () => {
          clearTimeout(timer);
          resolve();
        });
      });

      const payload = crypto.getRandomValues(new Uint8Array(CHUNK));
      const total = 64; // 64 × 16KB = 1 MB
      expected = payload.byteLength * total;
      for (let i = 0; i < total; i += 1) ch.send(payload);
      ch.send("done");

      const got = await result;
      const pass = got === expected;
      out.innerHTML = pass
        ? `<b style="color:var(--mint)">自检通过</b>：环回传输 ${fmtSize(got)}，分块与通道逻辑正常`
        : `<b style="color:var(--rose)">自检失败</b>：期望 ${expected} 字节，收到 ${got}`;
      a.close();
      b.close();
    } catch (err) {
      out.innerHTML = `<b style="color:var(--rose)">自检失败</b>：${esc(err.message)}`;
    }
  });

  cleanup = () => {
    listeners.forEach(([el, ev, fn]) => el.removeEventListener(ev, fn));
    pcs.forEach((pc) => pc.close());
    pcs.clear();
  };
}

export function unmount() {
  if (cleanup) cleanup();
  cleanup = null;
}
