/**
 * ClojureScript 自学站 · 章节内容
 * 每章：id / 标题 / 一句话摘要 / 段落（文本或代码）。
 * 代码块带 run: true 时会渲染「运行」按钮，点一下在右侧 Playground 里执行。
 */

export default [
  {
    id: "start",
    title: "起步：先把表达式跑起来",
    summary: "ClojureScript 的一切都是表达式，写法是把函数放前面。",
    blocks: [
      {
        type: "text",
        body: `ClojureScript 把括号写在函数名前面：<code>(+ 1 2)</code> 不是 <code>1 + 2</code>。
这叫前缀记法，好处是没有运算符优先级的问题——<code>(* (+ 1 2) 3)</code> 一眼看出先算哪一步。
所有东西都返回一个值，包括 <code>if</code>、<code>let</code>、函数调用。`,
      },
      { type: "code", body: `(+ 1 2)\n(* (+ 1 2) 3)\n(str "8o" "." "nz")` },
      {
        type: "text",
        body: `<code>ns</code> 用来声明命名空间，通常放在文件开头。浏览器里玩的时候可以省略，
但习惯上还是写上，跟正式项目一致。`,
      },
      { type: "code", body: `(ns lab.playground)\n\n(def greeting "hello cljs")\n(str greeting " from 8o.nz")` },
    ],
  },
  {
    id: "defs",
    title: "定义与函数",
    summary: "def 绑定名字，defn 造函数，let 造局部名字。",
    blocks: [
      {
        type: "text",
        body: `<code>def</code> 把一个值挂到当前命名空间上；<code>let</code> 只在它的括号范围内有效。
函数用 <code>defn</code> 定义，最后一个表达式就是返回值。`,
      },
      { type: "code", body: `(def price 42)\n(defn tax [p] (* p 0.06))\n\n(let [subtotal 100\n      total (+ subtotal (tax subtotal))]\n  {:subtotal subtotal :total total})` },
      {
        type: "text",
        body: `函数可以有多个参数个数的版本（arity），也可以带可变参数。这让同一个名字能照顾不同调用方式。`,
      },
      { type: "code", body: `(defn greet\n  ([] (greet "朋友"))\n  ([name] (str "你好，" name "！")))\n\n[(greet) (greet "渚")]` },
      {
        type: "text",
        body: `ClojureScript 的函数是值：可以返回函数，也可以接函数。下面 <code>adder</code> 返回一个「记住了 n」的函数——
这就是闭包，不需要任何额外语法。`,
      },
      { type: "code", body: `(defn adder [n] (fn [x] (+ n x)))\n\n(def add10 (adder 10))\n(add10 5)` },
    ],
  },
  {
    id: "collections",
    title: "集合：向量、映射、集合",
    summary: "四种主力结构，都支持统一的操作方式。",
    blocks: [
      {
        type: "text",
        body: `向量 <code>[1 2 3]</code> 按下标取；映射 <code>{:a 1}</code> 按键取；集合 <code>#{1 2}</code> 去重；
列表 <code>'(1 2)</code> 常用来表示代码本身。关键字 <code>:name</code> 是最常用的键类型。`,
      },
      { type: "code", body: `(def user {:name "渚" :tags [:moto :cljs]})\n\n[(:name user)\n (get user :tags)\n (count (:tags user))]` },
      {
        type: "text",
        body: `同一个函数能作用在多种集合上，这是 Clojure 系列最舒服的地方：
<code>first</code>、<code>rest</code>、<code>conj</code>、<code>count</code> 几乎对所有集合都成立。`,
      },
      { type: "code", body: `[(first [10 20 30])\n (rest [10 20 30])\n (conj [10 20] 30)\n (conj #{1 2} 2)\n (count {:a 1 :b 2})]` },
    ],
  },
  {
    id: "seqs",
    title: "序列函数：map / filter / reduce",
    summary: "把「怎么循环」换成「做什么变换」。",
    blocks: [
      {
        type: "text",
        body: `日常写业务，八成时间都在和序列函数打交道。<code>map</code> 变换每个元素，
<code>filter</code> 挑出符合条件的，<code>reduce</code> 把整个序列折叠成一个值。`,
      },
      { type: "code", body: `(def nums [1 2 3 4 5 6])\n\n(->> nums\n     (filter even?)\n     (map #(* % %))\n     (reduce +))` },
      {
        type: "text",
        body: `<code>->></code> 是线程宏，把上一步的结果塞到下一步的最后一个参数位置。
它把嵌套的括号拉平成一行一行的管道，读起来像在描述数据流向。`,
      },
      { type: "code", body: `(def orders [{:id 1 :total 30} {:id 2 :total 120} {:id 3 :total 80}])\n\n(->> orders\n     (filter #(>= (:total %) 50))\n     (map :total)\n     (reduce +))` },
      {
        type: "text",
        body: `序列是惰性的：<code>map</code> 和 <code>filter</code> 不会立刻算完，只在真正取值时才计算。
所以 <code>(take 5 (range))</code> 不会把自己卡死。`,
      },
      { type: "code", body: `(take 5 (map #(* % %) (range)))\n\n(take 3 (repeat "8o"))` },
    ],
  },
  {
    id: "immutable",
    title: "不可变更新",
    summary: "改数据是造新值，旧值还在，所以能放心共享。",
    blocks: [
      {
        type: "text",
        body: `<code>assoc</code> 不修改原映射，而是返回一个新映射；原值纹丝不动。
这让「谁把数据改坏了」这类问题从源头消失，也让撤销、缓存、时间旅行都变得便宜。`,
      },
      { type: "code", body: `(def base {:name "渚" :level 1})\n(def upgraded (assoc base :level 2))\n\n{:base base :upgraded upgraded}` },
      {
        type: "text",
        body: `嵌套更新用 <code>update</code> 或 <code>update-in</code>，把「取出、计算、写回」合成一步。`,
      },
      { type: "code", body: `(def state {:user {:score 10 :name "渚"}})\n\n(-> state\n    (update-in [:user :score] + 5)\n    (assoc-in [:user :name] "NAGISA"))` },
    ],
  },
  {
    id: "state",
    title: "状态：atom 与 swap!",
    summary: "不可变数据 + 一个受控的引用，就是 Clojure 的状态模型。",
    blocks: [
      {
        type: "text",
        body: `<code>atom</code> 是一个可变的「盒子」，但盒子里的值永远是不可变的。
你只能通过 <code>swap!</code> 提交一个纯函数来换值，<code>@</code> 用来取值。`,
      },
      { type: "code", body: `(def counter (atom 0))\n\n(swap! counter inc)\n(swap! counter + 10)\n\n@counter` },
      {
        type: "text",
        body: `因为更新函数是纯函数，<code>swap!</code> 可以安全地重试：
如果期间别的线程改过，就基于最新值再算一次。这就是无锁并发的基础。`,
      },
      { type: "code", body: `(def cart (atom []))\n\n(swap! cart conj {:sku "A" :qty 1})\n(swap! cart conj {:sku "B" :qty 2})\n\n(->> @cart (map :qty) (reduce +))` },
    ],
  },
  {
    id: "interop",
    title: "和 JavaScript 打交道",
    summary: "浏览器 API 就是 JS，用 . 与 js/ 直接够得着。",
    blocks: [
      {
        type: "text",
        body: `调用全局对象用 <code>js/</code> 前缀，属性用 <code>.-</code>，方法用 <code>.方法名</code>。
数据在两边转换：<code>clj-&gt;js</code> 与 <code>js-&gt;clj</code>。`,
      },
      { type: "code", body: `(js/Date.now)\n\n(def now (js/Date.))\n(.getFullYear now)` },
      {
        type: "text",
        body: `输出到控制台用 <code>js/console.log</code>，或者直接用 <code>println</code>（在浏览器里会走 console）。
这个站点的 Playground 会把打印抓下来显示在结果区。`,
      },
      { type: "code", body: `(println "来自 ClojureScript 的问候")\n\n(clj->js {:name "渚" :tags ["moto" "cljs"]})` },
    ],
  },
  {
    id: "workflow",
    title: "收尾：把它用起来",
    summary: "从浏览器练习到本地工程，最小可用的路径。",
    blocks: [
      {
        type: "text",
        body: `浏览器里练手够了以后，正式项目建议：<code>deps.edn</code> 加 <code>cljs.main</code> 起 REPL，
或用 shadow-cljs 做热更新。日常节奏是——在 REPL 里写函数、立刻求值、满意了再粘回文件。`,
      },
      {
        type: "text",
        body: `给自己留三道练习：<br />
1）写一个 <code>fizzbuzz</code>，用 <code>cond</code> 与 <code>map</code> 实现；<br />
2）把一组订单按金额分档统计，用 <code>group-by</code> 与 <code>reduce</code>；<br />
3）用 atom 做一个待办列表，支持添加与完成。`,
      },
      { type: "code", body: `(defn fizzbuzz [n]\n  (cond\n    (zero? (mod n 15)) "FizzBuzz"\n    (zero? (mod n 3)) "Fizz"\n    (zero? (mod n 5)) "Buzz"\n    :else n))\n\n(map fizzbuzz (range 1 16))` },
      {
        type: "code",
        body: `(def orders [{:id 1 :amount 80} {:id 2 :amount 260} {:id 3 :amount 45} {:id 4 :amount 300}])\n\n(defn bucket [n]\n  (cond (< n 100) :small (< n 250) :medium :else :large))\n\n(->> orders\n     (group-by #(bucket (:amount %)))\n     (map (fn [[k v]] [k (count v) (reduce + (map :amount v))]))\n     (into {}))` },
    ],
  },
];
