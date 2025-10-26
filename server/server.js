// server/server.js
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 4000;

// 放宽 CORS，方便本地开发
app.use(cors({ origin: true, credentials: true, methods: ["GET", "POST", "OPTIONS"] }));
app.use(express.json());

// 指向前端图片目录（确保存在并有 >=2 张图片）
const IMAGES_DIR = path.resolve(__dirname, "../client/public/images");

// 数据与结果路径
const DATA_DIR = path.join(__dirname, "data");
const RESULTS_DIR = path.join(__dirname, "results");
const COUNTS_PATH = path.join(DATA_DIR, "image_counts.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });

// ------------ 工具函数 ------------
const readJSON = (p) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf-8")) : null);
const writeJSON = (p, obj) => fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf-8");

function listAllImages() {
  if (!fs.existsSync(IMAGES_DIR)) return [];
  const files = fs.readdirSync(IMAGES_DIR);
  const allow = new Set([".jpg", ".jpeg", ".png", ".webp"]);
  return files
    .filter((f) => allow.has(path.extname(f).toLowerCase()))
    .sort((a, b) => a.localeCompare(b));
}

function ensureCounts(dimensions, files) {
  let counts = readJSON(COUNTS_PATH) || {};
  for (const dim of dimensions) {
    counts[dim] = counts[dim] || {};
    for (const f of files) {
      if (typeof counts[dim][f] !== "number") counts[dim][f] = 0;
    }
    // 清理不存在的文件
    for (const f of Object.keys(counts[dim])) {
      if (!files.includes(f)) delete counts[dim][f];
    }
  }
  writeJSON(COUNTS_PATH, counts);
  return counts;
}

function planPairsForDimension(files, countsObj, k) {
  if (files.length < 2) return [];
  const localCount = new Map(files.map((f) => [f, countsObj[f] ?? 0]));
  const usedInBatch = new Set();
  const pairs = [];

  const sorted = () =>
    Array.from(localCount.entries())
      .sort((a, b) => (a[1] === b[1] ? Math.random() - 0.5 : a[1] - b[1]))
      .map(([n]) => n);

  for (let i = 0; i < k; i++) {
    let cands = sorted().filter((n) => !usedInBatch.has(n));
    if (cands.length < 2) cands = sorted(); // 允许复用
    if (cands.length < 2) break;

    const left = cands[0];
    const right = cands.find((n) => n !== left);
    if (!right) break;

    pairs.push({ left, right });
    localCount.set(left, (localCount.get(left) ?? 0) + 1);
    localCount.set(right, (localCount.get(right) ?? 0) + 1);
    usedInBatch.add(left);
    usedInBatch.add(right);
  }
  return pairs;
}

// ------------ 调试接口 ------------
app.get("/api/health", (req, res) => {
  const exists = fs.existsSync(IMAGES_DIR);
  const files = exists ? listAllImages() : [];
  res.json({
    ok: true,
    server: "ok",
    imagesDir: IMAGES_DIR,
    exists,
    totalImages: files.length,
    sample: files.slice(0, 10),
  });
});

app.get("/api/list-images", (req, res) => {
  try {
    const exists = fs.existsSync(IMAGES_DIR);
    if (!exists) return res.status(400).json({ ok: false, error: `图片目录不存在: ${IMAGES_DIR}` });
    const files = listAllImages();
    return res.json({ ok: true, total: files.length, files });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "list-images失败" });
  }
});

// ------------ 动态规划 pairs ------------
app.post("/api/plan-pairs", (req, res) => {
  try {
    const { dimensions = [], pairsPerDimension = 5 } = req.body || {};
    if (!Array.isArray(dimensions) || dimensions.length === 0) {
      return res.status(400).json({ ok: false, error: "缺少 dimensions 参数" });
    }
    const exists = fs.existsSync(IMAGES_DIR);
    if (!exists) {
      return res.status(400).json({ ok: false, error: `图片目录不存在: ${IMAGES_DIR}` });
    }
    const files = listAllImages();
    if (files.length < 2) {
      return res.status(400).json({
        ok: false,
        error: `图片不足（当前 ${files.length} 张）。请将图片放到 client/public/images/ 且扩展名为 jpg/jpeg/png/webp`,
      });
    }

    const counts = ensureCounts(dimensions, files);
    const plan = {};
    for (const dim of dimensions) {
      plan[dim] = planPairsForDimension(files, counts[dim], pairsPerDimension);
    }
    return res.json({ ok: true, plan, totalImages: files.length });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "plan 失败，请查看 server 控制台日志" });
  }
});

// ------------ CSV 写入工具（按你的新规范）------------
function writeBackgroundCSV(meta, folderPath) {
  const headers = Object.keys(meta);
  const values = headers.map((k) => `${meta[k] ?? ""}`.replaceAll('"', '""')); // 简单转义

  const csv = [
    headers.join(","),        // 第一行：字段名
    values.map((v) => `"${v}"`).join(","), // 第二行：对应值
    "",
  ].join("\n");

  fs.writeFileSync(path.join(folderPath, "background.csv"), csv, "utf-8");
}

function writeVotesCSV(comparisons, folderPath) {
  const header = "id,choice,left,right";
  const rows = [];

  // 纯数字时间戳（毫秒）
  const tsNum = Date.now();

  let idx = 1;
  for (const r of comparisons || []) {
    // id 形如：vote_1_1730001234567
    const id = `vote_${idx++}_${tsNum}`;
    const choice = r.choice || ""; // left/right 或空
    const leftBase = path.parse(r.leftImage || "").name;   // 去后缀
    const rightBase = path.parse(r.rightImage || "").name; // 去后缀
    rows.push([id, choice, leftBase, rightBase].map((v) => `"${v}"`).join(","));
  }

  const csv = [header, ...rows, ""].join("\n");
  fs.writeFileSync(path.join(folderPath, "votes.csv"), csv, "utf-8");
}


// ------------ 提交 & 更新曝光计数 ------------
app.post("/submit", (req, res) => {
  try {
    const body = req.body;
    const { meta, comparisons } = body;

    // 1) 为每位被试创建独立文件夹
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const participantDir = path.join(RESULTS_DIR, `participant_${ts}`);
    fs.mkdirSync(participantDir, { recursive: true });

    // 2) 写 background.csv（基本信息）
    writeBackgroundCSV(meta || {}, participantDir);

    // 3) 写 votes.csv（两两比较）
    writeVotesCSV(comparisons || [], participantDir);

    // 4) 更新曝光计数（按维度，左右各 +1；计数仍以“包含后缀的文件名”为键）
    const dimsInPayload = Array.from(new Set((comparisons || []).map((r) => r.dimension)));
    const files = listAllImages();
    const counts = ensureCounts(dimsInPayload, files);
    for (const r of comparisons || []) {
      const { dimension, leftImage, rightImage } = r;
      if (!counts[dimension]) counts[dimension] = {};
      counts[dimension][leftImage] = (counts[dimension][leftImage] ?? 0) + 1;
      counts[dimension][rightImage] = (counts[dimension][rightImage] ?? 0) + 1;
    }
    writeJSON(COUNTS_PATH, counts);

    return res.json({ ok: true, folder: path.basename(participantDir) });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "保存失败，请看 server 日志" });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log(`IMAGES_DIR = ${IMAGES_DIR}`);
});
