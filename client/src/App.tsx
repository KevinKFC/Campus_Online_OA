import React, { useMemo, useState } from "react";
import "./styles.css";

const PAIRS_PER_DIMENSION = 20; // 在这里调整每个维度的题目数量

type MetaData = {
  gender: string;
  age: string;
  identity: string;
  university: string;
  yearsInSchool: string;
  discipline: string;
  personality: string;
  expense: string;
  commute: string;
};

type Pair = { left: string; right: string };

type PlanResponse = {
  ok: boolean;
  plan: Record<string, Pair[]>;
  totalImages?: number;
  error?: string;
};

type ComparisonPayloadRow = {
  dimension: string;
  pairIndex: number;
  leftImage: string;
  rightImage: string;
  choice: string;
};

type QuestionPage =
  | { type: "intro"; title: string; body: string[]; buttonText: string }
  | { type: "meta"; field: keyof MetaData; questionText: string; options: string[] }
  | { type: "pair"; dimension: string; pairIndex: number; questionText: string; pair: Pair }
  | { type: "submit"; title: string; note: string }
  | { type: "break"; title: string; subtitle: string; buttonText: string };

const DIM_TITLES: Record<string, string> = {
  safer: "哪个地方看起来更安全？",
  // beautiful: "哪个地方看起来更美丽？",
  // boring: "哪个地方看起来更无聊？",
  // lively: "哪个地方看起来更活泼？",
  relaxing: "哪个地方看起来更令人放松？",
  walkable: "哪个地方看起来更适合步行？",
  // bikeable: "哪个地方看起来更适合骑自行车？",
};

const DIM_HIGHLIGHTS: Record<string, string> = {
  safer: "安全",
  beautiful: "美丽",
  boring: "无聊",
  lively: "活泼",
  relaxing: "令人放松",
  walkable: "适合步行",
};

const ALL_DIMENSIONS = Object.keys(DIM_TITLES); // 每张图适用于所有维度

// —— 工具：校验当前页是否已作答 —— //
function isPageAnswered(
  page: QuestionPage | undefined,
  meta: MetaData,
  pairChoices: Record<string, Record<number, "left" | "right" | "">>
) {
  if (!page) return false;
  if (page.type === "meta") {
    return !!meta[page.field];
  }
  if (page.type === "pair") {
    const v = pairChoices[page.dimension]?.[page.pairIndex] || "";
    return v === "left" || v === "right";
  }
  // intro/submit 由按钮控制，不在此强制
  return true;
}

const App: React.FC = () => {
  // ===== 基本信息 =====
  const [meta, setMeta] = useState<MetaData>({
    gender: "",
    age: "",
    identity: "",
    university: "",
    yearsInSchool: "",
    discipline: "",
    personality: "",
    expense: "",
    commute: "",
  });
  const updateMeta = (field: keyof MetaData, value: string) =>
    setMeta((p) => ({ ...p, [field]: value }));

  // ===== pair 选择 =====
  const [pairChoices, setPairChoices] = useState<
    Record<string, Record<number, "left" | "right" | "">>
  >({});
  const choose = (dim: string, idx: number, val: "left" | "right") => {
    setPairChoices((p) => ({ ...p, [dim]: { ...(p[dim] || {}), [idx]: val } }));
    setStep((prevStep) => prevStep + 1); // 自动跳转到下一题
  };

  // ===== 计划的 pairs（来自后端） =====
  const [plannedPairs, setPlannedPairs] = useState<Record<string, Pair[]>>({});
  const [planning, setPlanning] = useState(false);
  const [planError, setPlanError] = useState("");

  // ===== 翻页 & 顶部提示条 =====
  const [step, setStep] = useState(0);
  const [warn, setWarn] = useState(""); // 未作答提示

  // —— 页面定义 —— //
  const introPage: QuestionPage = {
    type: "intro",
    title: "大学校园空间感知调查",
    buttonText: "我已知晓，开始答题",
    body: [
      "本调查旨在研究大学在校生对大学校园环境的主观感知情况。",
      "调查采用图片两两对比的方式，您需要结合题目从两张图片中选择您认为最符合您个人主观感受的选项。",
      "我们承诺，您提供的数据将进行严格匿名化存储，并仅用于科研分析。",
      "本次调查大约需要2-3分钟完成，感谢您的参与与支持！",
    ],
  };

  const metaPages: QuestionPage[] = [
    { type: "meta", field: "gender", questionText: "您的性别是？", options: ["男性", "女性"] },
    {
      type: "meta",
      field: "age",
      questionText: "您的年龄是？",
      options: ["20岁及以下", "21-29", "30-39", "40-49", "50岁及以上"],
    },
    { type: "meta", field: "identity", questionText: "您的身份是？", options: ["本科生", "硕士研究生", "博士研究生", "教职工", "其它"] },
    // {
    //   type: "meta",
    //   field: "university",
    //   questionText: "您目前在哪所学校？",
    //   options: ["华南理工大学", "广州大学", "广州财经大学", "广东工业大学", "其它"],
    // },
    // {
    //   type: "meta",
    //   field: "yearsInSchool",
    //   questionText: "您目前在该学校多久？",
    //   options: ["不到1年", "1-2年", "2-3年", "3-4年", "4年以上"],
    // },
    // {
    //   type: "meta",
    //   field: "discipline",
    //   questionText: "您所学的学科类别？",
    //   options: ["理学", "工学", "管理学", "经济学", "人文社科", "艺术设计", "医学", "其它"],
    // },
    {
      type: "meta",
      field: "personality",
      questionText: "您的性格是？",
      options: ["更倾向独处、安静环境（内向）", "更倾向社交、热闹环境（外向）"],
    },
    // {
    //   type: "meta",
    //   field: "expense",
    //   questionText: "您每月大致的花销（人民币）？",
    //   options: ["<1000", "1000-2000", "2001-3000", "3000-4000", ">4000"],
    // },
    // {
    //   type: "meta",
    //   field: "commute",
    //   questionText: "您在校园内主要的出行方式是？",
    //   options: ["步行", "骑行", "电动车", "校车", "共享单车", "其他"],
    // },
  ];

  // 将计划好的每个 pair 拆成一道题，并在每组题前插入过渡页
  const pairPages: QuestionPage[] = useMemo(() => {
    const out: QuestionPage[] = [];
    const dims = Object.keys(plannedPairs);
    dims.forEach((dim, dimIndex) => {
      // 添加过渡页
      out.push({
        type: "break",
        title: `Part ${dimIndex + 1}`,
        subtitle: `接下来，请判断哪个地方看起来更${DIM_HIGHLIGHTS[dim]}？`,
        buttonText: "开始",
      });

      // 添加该维度的所有题目
      plannedPairs[dim].forEach((pair, i) => {
        out.push({
          type: "pair",
          dimension: dim,
          pairIndex: i + 1,
          questionText: DIM_TITLES[dim] || "请选择更符合描述的场景",
          pair,
        });
      });
    });
    return out;
  }, [plannedPairs]);

  const finalPage: QuestionPage = { type: "submit", title: "提交问卷", note: "感谢参与！点击提交以匿名保存你的回答。" };

  // 整体页序列：intro → meta(9题) → pair(动态) → submit
  const pages: QuestionPage[] = [introPage, ...metaPages, ...pairPages, finalPage];
  const curr = pages[step];
  const isIntro = curr?.type === "intro";
  const isSubmit = curr?.type === "submit";

  // 进度条数据（intro/submit 不显示）
  const totalQuestions = metaPages.length + pairPages.length;
  const currentQuestionIdx = !isIntro && !isSubmit ? step - 1 : 0; // 去掉intro偏移
  const progressPercent =
    !isIntro && !isSubmit && totalQuestions > 0
      ? Math.round(((currentQuestionIdx + 1) / totalQuestions) * 100)
      : 0;

  // —— Intro: 获取图片计划（失败可重试） —— //
  const handleIntroProceed = async () => {
    setPlanning(true);
    setPlanError("");
    try {
      const resp = await fetch("/api/plan-pairs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dimensions: ALL_DIMENSIONS, // 每张图适用于所有维度
          pairsPerDimension: PAIRS_PER_DIMENSION,
        }),
      });
      const data: PlanResponse = await resp.json();
      if (!data.ok) {
        setPlanning(false);
        setPlanError(data.error || "获取计划失败");
        return;
      }
      setPlannedPairs(data.plan || {});
      setPlanning(false);
      setStep(1); // 进入第一道题（meta的第一题）
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      console.error(e);
      setPlanning(false);
      setPlanError("网络错误：无法获取图片计划");
    }
  };

  // —— 提交问卷 —— //
  const [submitState, setSubmitState] = useState({ sending: false, done: false, error: "" });
  const handleSubmit = async () => {
    setSubmitState({ sending: true, done: false, error: "" });

    // 组装 comparisons（逐 pair 题）
    const comparisons: ComparisonPayloadRow[] = [];
    for (const dim of Object.keys(plannedPairs)) {
      plannedPairs[dim].forEach((p, i) => {
        comparisons.push({
          dimension: dim,
          pairIndex: i + 1,
          leftImage: p.left,
          rightImage: p.right,
          choice: pairChoices[dim]?.[i + 1] || "",
        });
      });
    }

    try {
      const resp = await fetch("api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meta, comparisons }),
      });
      const data = await resp.json();
      if (data.ok) setSubmitState({ sending: false, done: true, error: "" });
      else setSubmitState({ sending: false, done: false, error: data.error || "提交失败" });
    } catch (e) {
      console.error(e);
      setSubmitState({ sending: false, done: false, error: "网络错误" });
    }
  };

  // —— 渲染各页 —— //
  const renderIntro = (p: Extract<QuestionPage, { type: "intro" }>) => (
    <div className="survey-card">
      <div className="header-block">
        <div className="brand">DesignFutureLab</div>
        <div className="survey-title neon">{p.title}</div>
        <div className="survey-sub">Built Environment To Perception</div>
      </div>
      <div className="intro-body">{p.body.map((t, i) => <p className="intro-line" key={i}>{t}</p>)}</div>

      {planError && (
        <div className="submit-msg err" style={{ marginBottom: 10 }}>
          {planError}
        </div>
      )}

      <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
        <button className="nav-btn primary" onClick={handleIntroProceed} disabled={planning}>
          {planning ? "准备中…" : p.buttonText}
        </button>
        {planError && (
          <button
            className="nav-btn ghost"
            onClick={async () => {
              setPlanError("");
              await handleIntroProceed();
            }}
          >
            重试
          </button>
        )}
      </div>
    </div>
  );

  const renderMeta = (p: Extract<QuestionPage, { type: "meta" }>) => (
    <div className="survey-card">
      <div className="question-text">{p.questionText}</div>
      <div className="options-col">
        {p.options.map((opt) => (
          <label key={opt} className={`option-chip ${meta[p.field] === opt ? "selected" : ""}`}>
            <input
              type="radio"
              name={p.field}
              value={opt}
              checked={meta[p.field] === opt}
              onChange={() => updateMeta(p.field, opt)}
            />
            <span>{opt}</span>
          </label>
        ))}
      </div>
    </div>
  );

  const renderPair = (p: Extract<QuestionPage, { type: "pair" }>) => {
    const cur = pairChoices[p.dimension]?.[p.pairIndex] || "";
    const highlight = DIM_HIGHLIGHTS[p.dimension];
    const parts = p.questionText.split(highlight);

    return (
      <div className="survey-card">
        <div className="question-text">
          {parts.length === 2 ? (
            <>
              {parts[0]}
              <strong>{highlight}</strong>
              {parts[1]}
            </>
          ) : (
            p.questionText
          )}
        </div>
        <div className="pair-two-col">
          <div
            className={`img-choice ${cur === "left" ? "chosen" : ""}`}
            onClick={() => choose(p.dimension, p.pairIndex, "left")}
          >
            <img className="pair-img" src={`/images/${p.pair.left}`} alt={`${p.dimension}-L-${p.pairIndex}`} />
            <div className="img-label-top">I</div>
          </div>
          <div className="pair-vs">VS</div>
          <div
            className={`img-choice ${cur === "right" ? "chosen" : ""}`}
            onClick={() => choose(p.dimension, p.pairIndex, "right")}
          >
            <img className="pair-img" src={`/images/${p.pair.right}`} alt={`${p.dimension}-R-${p.pairIndex}`} />
            <div className="img-label-top">II</div>
          </div>
        </div>
      </div>
    );
  };

  const renderBreak = (p: Extract<QuestionPage, { type: "break" }>) => {
    // 从完整的副标题中找到需要高亮的关键词
    const highlight = p.subtitle.replace("接下来，请判断哪个地方看起来更", "").replace("？", "");
    const parts = p.subtitle.split(highlight);

    return (
      <div className="survey-card">
        <div className="header-block" style={{ margin: "20px 0" }}>
          <div className="survey-title">{p.title}</div>
          <div className="survey-sub" style={{ fontSize: "1rem", marginTop: "12px" }}>
            {parts.length === 2 ? (
              <>
                {parts[0]}
                <strong>{highlight}</strong>
                {parts[1]}
              </>
            ) : (
              p.subtitle
            )}
          </div>
        </div>
        <button
          className="nav-btn primary"
          style={{ justifySelf: "center" }}
          onClick={() => setStep((s) => s + 1)}
        >
          {p.buttonText}
        </button>
      </div>
    );
  };

  const renderSubmit = (p: Extract<QuestionPage, { type: "submit" }>) => (
    <div className="survey-card">
      <div className="header-block">
        <div className="survey-title">{p.title}</div>
        <div className="survey-sub">{p.note}</div>
      </div>
      <button className="nav-btn primary" onClick={handleSubmit} disabled={submitState.sending || submitState.done}>
        {submitState.sending ? "提交中…" : submitState.done ? "已提交 ✔" : "提交问卷"}
      </button>
      {submitState.error && <div className="submit-msg err">提交失败：{submitState.error}</div>}
      {submitState.done && <div className="submit-msg ok">感谢您的参与！数据已提交。</div>}
    </div>
  );

  // —— 底部导航按钮（含强制作答校验） —— //
  const canPrev = step > 0;
  const isBreak = curr?.type === "break";
  const canNext = step < pages.length - 1 && !isIntro && !isSubmit && !isBreak;
  const showNav = !isIntro && !isSubmit && !isBreak;

  return (
    <div className="app-bg pro-grad">
      {/* 未作答提示条 */}
      {warn && (
        <div className="submit-msg err" style={{ width: "min(92vw, 720px)", marginBottom: 12 }}>
          {warn}
        </div>
      )}

      {/* 顶部进度条（intro/submit 隐藏） */}
      {!isIntro && !isSubmit && (
        <div className="progress-shell">
          <div className="progress-top-row">
            <div className="progress-label">进度 {progressPercent}%</div>
            <div className="progress-count">
              {currentQuestionIdx + 1}/{totalQuestions}
            </div>
          </div>
          <div className="progress-bar">
            <div className="progress-bar-inner rainbow" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      )}

      {/* 居中卡片 */}
      <div className="page-center-wrapper xl">
        {curr?.type === "intro" && renderIntro(curr)}
        {curr?.type === "meta" && renderMeta(curr)}
        {curr?.type === "pair" && renderPair(curr)}
        {curr?.type === "break" && renderBreak(curr)}
        {curr?.type === "submit" && renderSubmit(curr)}

        {showNav && (
          <div className="nav-row">
            <button
              className="nav-btn ghost"
              onClick={() => {
                if (!canPrev) return;
                setWarn("");
                setStep((s) => s - 1);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              disabled={!canPrev}
            >
              上一题
            </button>

            <button
              className="nav-btn primary"
              onClick={() => {
                const currPage = pages[step];
                if (!isPageAnswered(currPage, meta, pairChoices)) {
                  setWarn("请先完成本题再继续。");
                  setTimeout(() => setWarn(""), 2000);
                  return;
                }
                setWarn("");
                if (!canNext) return;
                setStep((s) => s + 1);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              disabled={!canNext}
            >
              下一题
            </button>
          </div>
        )}
        <footer className="footer-compact">
          <div className="foot-mini">© Campus Perception Study • Design Future Lab</div>
        </footer>
      </div>
    </div>
  );
};

export default App;
