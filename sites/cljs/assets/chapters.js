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
  {
    id: "macros",
    title: "宏：在编译期改写代码",
    summary: "宏拿到的不是值，而是还没求值的代码。",
    blocks: [
      {
        type: "text",
        body: `函数接收<strong>值</strong>，宏接收<strong>代码本身</strong>。所以宏能做的事函数做不到：
把 <code>(unless 条件 表达式)</code> 展开成 <code>(when (not 条件) 表达式)</code>、给一段代码加上打点计时、把重复的样板结构折叠起来。
代价是宏在编译期运行，读起来比函数隐晦，所以要克制。`,
      },
      {
        type: "text",
        body: `先看清楚它的写法：反引号里的 <code>~</code> 是「把这里的值塞进来」，<code>~@</code> 是「把这里的序列摊平塞进来」。
点「运行」会返回类似 <code>#'lab.playground/unless</code> 的 var，意思是宏已经定义好了。`,
      },
      {
        type: "code",
        runnable: true,
        body: `(defmacro unless [pred & body]\n  \`(when (not ~pred)\n     ~@body))`,
      },
      {
        type: "text",
        body: `定义完再点这一段——Playground 会保留之前的状态，所以宏可以直接用。
这就是 REPL 的工作方式：定义一次，之后一直可用。`,
      },
      {
        type: "code",
        runnable: true,
        body: `[(unless false (+ 1 2))\n (unless true (+ 1 2))]`,
      },
      {
        type: "text",
        body: `<code>macroexpand</code> 能看宏到底把代码变成了什么。调试宏的时候它比打印更管用。`,
      },
      {
        type: "code",
        runnable: true,
        body: `(macroexpand '(unless false (+ 1 2)))`,
      },
      {
        type: "text",
        body: `宏也能收可变数量的参数。下面这个 <code>sum-of</code> 把任意个表达式拼成一个加法——
注意它展开后仍然是一个普通的 <code>+</code> 调用，宏只是帮你写了那行代码。`,
      },
      {
        type: "code",
        runnable: true,
        body: `(defmacro sum-of [& xs]\n  \`(+ ~@xs))`,
      },
      {
        type: "code",
        runnable: true,
        body: `(sum-of 1 2 3 4)`,
      },
      {
        type: "text",
        body: `两点经验：<br />
1）宏里引入的局部名字要用自动生成的（反引号里的 <code>x#</code>），否则可能和调用方的变量撞名；<br />
2）如果一个函数能表达清楚，就别写宏——宏的错误信息通常更难读，而且不能被当作值传出去。`,
      },
    ],
  },
  {
    id: "async",
    title: "异步：单线程里的并发",
    summary: "ClojureScript 跑在 JS 事件循环上，原子状态是同步的，等待要用 Promise。",
    blocks: [
      {
        type: "text",
        body: `ClojureScript 编译成 JS，所以只有<strong>一个线程</strong>。
<code>swap!</code> 改 atom 是同步的、立刻生效；而网络请求、定时器这类等待，本质是把回调排进事件循环。
理解这一点，很多「为什么这里是空值」的困惑就消失了。`,
      },
      {
        type: "text",
        body: `下面的打印顺序值得盯一下：<code>1</code> 和 <code>2</code> 同步执行，<code>3</code> 要等这一轮跑完才轮到。`,
      },
      {
        type: "code",
        runnable: true,
        body: `(println "1 同步开始")\n(-> (js/Promise.resolve 2)\n    (.then (fn [v] (println "3 异步回调，" v))))\n(println "2 同步结束")`,
      },
      {
        type: "text",
        body: `多个异步任务并行等待用 <code>Promise.all</code>，再把结果当成普通序列处理——
拿到值以后，前面学的 <code>map</code>、<code>reduce</code> 全都能用。`,
      },
      {
        type: "code",
        runnable: true,
        body: `(defn later [v ms]\n  (js/Promise. (fn [resolve] (js/setTimeout #(resolve v) ms))))\n\n(-> (js/Promise.all #js [(later 10 10) (later 20 20) (later 30 30)])\n    (.then (fn [xs]\n             (println "全部回来了" (js->clj xs))\n             (reduce + (js->clj xs)))))`,
      },
      {
        type: "text",
        body: `真实项目里更常用 <code>core.async</code> 的 <code>go</code> 块，让异步代码看起来像同步的。
不过它是独立库，本站 Playground 没有打包，下面只是示意——真要用得在工程里加依赖。`,
      },
      {
        type: "code",
        runnable: false,
        body: `;; 需要 (:require [clojure.core.async :as a :refer [go <! >!]])\n(go\n  (let [v (<! some-channel)]\n    (println "收到" v)\n    (>! reply-channel (* v 2))))`,
      },
    ],
  },
  {
    id: "tooling",
    title: "工程化：从 Playground 到真实项目",
    summary: "浏览器里练手之后，正式项目长什么样。",
    blocks: [
      {
        type: "text",
        body: `本站用的是解释器，不产出文件。真正交付时一般走两条路：
<strong>cljs.main</strong>（官方，配置少）或 <strong>shadow-cljs</strong>（生态好，热更新强）。两者都用 <code>deps.edn</code> 管依赖。`,
      },
      {
        type: "text",
        body: `<code>deps.edn</code> 声明依赖和编译选项。这一段是配置，不在浏览器执行。`,
      },
      {
        type: "code",
        runnable: false,
        body: `{:paths ["src"]\n :deps  {org.clojure/clojurescript {:mvn/version "1.11.132"}}\n :aliases\n {:dev {:main-opts ["-m" "cljs.main" "--repl"]}}}`,
      },
      {
        type: "text",
        body: `用 shadow-cljs 的话，构建目标写在 <code>shadow-cljs.edn</code>：<code>:app</code> 适合普通应用，
<code>:browser-test</code> 跑测试，<code>:node-script</code> 出命令行工具。`,
      },
      {
        type: "code",
        runnable: false,
        body: `{:source-paths ["src"]\n :dependencies [[thheller/shadow-cljs "2.28.20"]]\n :builds {:app {:target :browser\n                :output-dir "public/js"\n                :modules {:main {:init-fn app.core/init}}}}}`,
      },
      {
        type: "text",
        body: `日常命令就三个：<code>shadow-cljs watch app</code> 起热更新、<code>compile</code> 出产物、<code>release</code> 做压缩优化。
跟 npm 生态也不冲突——CLJS 能直接 require npm 包，反过来 JS 也能调用编译出来的函数。`,
      },
      {
        type: "code",
        runnable: false,
        body: `{\n  "scripts": {\n    "dev": "shadow-cljs watch app",\n    "build": "shadow-cljs release app"\n  },\n  "devDependencies": {\n    "shadow-cljs": "2.28.20"\n  }\n}`,
      },
      {
        type: "text",
        body: `学习路径建议：先用本站把<strong>数据变换</strong>（map / filter / reduce / assoc）练到顺手，
再啃<strong>状态</strong>（atom、swap!），最后才碰宏与异步。前两层熟了，写起来其实比 JS 更省心。`,
      },
    ],
  },
  {
    id: "practice",
    title: "综合练习：把学过的东西串起来",
    summary: "一个购物车，用上 atom、序列函数、不可变更新和异步。",
    blocks: [
      {
        type: "text",
        body: `先用 atom 存状态，用纯函数算派生数据。这是 ClojureScript 里最常见的一对搭配：
<strong>atom 管「现在是什么」，纯函数管「怎么算」。</strong>`,
      },
      {
        type: "code",
        runnable: true,
        body: `(def cart (atom []))\n\n(defn add-item [sku qty price]\n  (swap! cart conj {:sku sku :qty qty :price price}))\n\n(add-item "coffee" 2 39)\n(add-item "rice" 5 12)\n(add-item "moto-oil" 1 180)\n\n(let [items @cart\n      total (->> items (map #(* (:qty %) (:price %))) (reduce +))]\n  {:count (count items) :total total})`,
      },
      {
        type: "text",
        body: `同一份数据换个角度再看一次：按商品聚合数量、按金额排序。注意这里没有改 <code>cart</code>，
全部是派生出来的新值。`,
      },
      {
        type: "code",
        runnable: true,
        body: `(->> @cart\n     (group-by :sku)\n     (map (fn [[sku items]]\n            [sku (reduce + (map :qty items))]))\n     (into {})\n     (sort-by val >))`,
      },
      {
        type: "text",
        body: `最后把「下单」写成异步流程：模拟一个请求，回来后用前面写好的纯函数算结果。
关键点是<strong>异步只负责拿数据，计算仍然是纯函数</strong>——所以每段都能单独测。`,
      },
      {
        type: "code",
        runnable: true,
        body: `(defn fake-request [items]\n  (js/Promise.\n    (fn [resolve]\n      (js/setTimeout #(resolve (clj->js items)) 30))))\n\n(-> (fake-request @cart)\n    (.then (fn [raw]\n             (let [items (js->clj raw :keywordize-keys true)\n                   total (->> items (map #(* (:qty %) (:price %))) (reduce +))]\n               (println "下单成功，合计" total)\n               total))))`,
      },
      {
        type: "text",
        body: `自测清单：把上面三段依次跑一遍，确认 <code>total</code> 是 318、聚合结果是
<code>(["rice" 5] ["coffee" 2] ["moto-oil" 1])</code>、下单合计同样是 318。
如果对不上，多半是某次 <code>add-item</code> 没执行——atom 的状态在 Playground 里是累积的。`,
      },
    ],
  },
];
