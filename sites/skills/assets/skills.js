/** 复制安装命令：只有这一个交互，保持页面轻 */
const btn = document.querySelector("[data-copy]");

if (btn) {
  btn.addEventListener("click", async () => {
    const text = btn.dataset.copy;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // 无剪贴板权限时降级为选中文本，让用户自己按 ⌘C
      const range = document.createRange();
      range.selectNodeContents(document.querySelector(".install__cmd"));
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    btn.textContent = "已复制";
    btn.classList.add("is-done");
    setTimeout(() => {
      btn.textContent = "复制";
      btn.classList.remove("is-done");
    }, 1600);
  });
}
