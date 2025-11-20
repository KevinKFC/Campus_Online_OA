import express from "express";
import compression from "compression";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 4000;

// 允许本地任何端口（5173、3000等）访问，开发更省心
app.use(express.json());
// 启用压缩（gzip / brotli 由 Node/客户端协商）
app.use(compression());
// --- CORS FINAL SETUP (drop-in) ---

// 是否需要携带 Cookie/会话（需要就设为 true）
const USE_CREDENTIALS = false;

const corsOptions = USE_CREDENTIALS
  ? {
      // 携带凭证时，不能用 "*"；这里动态回显请求方 Origin，等价于放行所有来源
      origin: (origin, cb) => cb(null, true),
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
      exposedHeaders: ["Content-Disposition"],
    }
  : {
      // 不携带凭证时，直接允许任何来源
      origin: "*",
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
      exposedHeaders: ["Content-Disposition"],
    };

// 应用到所有路由
app.use(cors(corsOptions));
// 处理预检请求
app.options("*", cors(corsOptions));
// --- END CORS SETUP ---

// 关键：指向前端静态图片目录
const IMAGES_DIR = path.resolve(__dirname, "../client/public/images");

// 将图片作为静态资源提供，带上长期缓存头（生产环境应使用 CDN）
app.use('/images', express.static(IMAGES_DIR, { maxAge: '30d', etag: true }));

const DATA_DIR = path.join(__dirname, "data");
const RESULTS_DIR = path.join(__dirname, "results");
const COUNTS_PATH = path.join(DATA_DIR, "image_counts.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });

// 工具
const readJSON = (p) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf-8")) : null);
const writeJSON = (p, obj) => fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf-8");

function listAllImages() {
  if (!fs.existsSync(IMAGES_DIR)) return [];
  const files = fs.readdirSync(IMAGES_DIR);
  const allow = new Set([".jpg", ".jpeg", ".png", ".webp"]);
  return files.filter(f => allow.has(path.extname(f).toLowerCase()))
              .sort((a,b)=>a.localeCompare(b));
}

function ensureCounts(dimensions, files) {
  let counts = readJSON(COUNTS_PATH) || {};
  for (const dim of dimensions) {
    counts[dim] = counts[dim] || {};
    for (const f of files) {
      if (typeof counts[dim][f] !== "number") counts[dim][f] = 0;
    }
    // 清理已被删除的文件
    for (const f of Object.keys(counts[dim])) {
      if (!files.includes(f)) delete counts[dim][f];
    }
  }
  writeJSON(COUNTS_PATH, counts);
  return counts;
}

function planPairsForDimension(files, countsObj, k) {
  if (files.length < 2) return [];
  const localCount = new Map(files.map(f => [f, countsObj[f] ?? 0]));
  const usedInBatch = new Set();
  const pairs = [];

  const sorted = () => Array.from(localCount.entries())
    .sort((a,b)=> (a[1]===b[1] ? Math.random()-0.5 : a[1]-b[1]))
    .map(([n])=>n);

  for (let i=0;i<k;i++){
    let cands = sorted().filter(n=>!usedInBatch.has(n));
    if (cands.length<2) cands = sorted(); // 不够就允许重复
    if (cands.length<2) break;
    const left = cands[0];
    const right = cands.find(n=>n!==left);
    if (!right) break;

    pairs.push({ left, right });
    localCount.set(left,  (localCount.get(left)  ??0)+1);
    localCount.set(right, (localCount.get(right) ??0)+1);
    usedInBatch.add(left); usedInBatch.add(right);
  }
  return pairs;
}

// —— 健康检查 & 调试接口 —— //
app.get("/health", (req,res)=>{
  const exists = fs.existsSync(IMAGES_DIR);
  const files = exists ? listAllImages() : [];
  res.json({
    ok: true,
    server: "ok",
    imagesDir: IMAGES_DIR,
    exists,
    totalImages: files.length,
    sample: files.slice(0,10),
  });
});

app.get("/list-images", (req,res)=>{
  try{
    const exists = fs.existsSync(IMAGES_DIR);
    if(!exists) return res.status(400).json({ ok:false, error:`图片目录不存在: ${IMAGES_DIR}`});
    const files = listAllImages();
    return res.json({ ok:true, total: files.length, files });
  }catch(e){
    console.error(e);
    return res.status(500).json({ ok:false, error: "list-images失败" });
  }
});

// —— 动态规划 pairs —— //
app.post("/plan-pairs", (req,res)=>{
  try{
    const { dimensions = [], pairsPerDimension = 5 } = req.body || {};
    if (!Array.isArray(dimensions) || dimensions.length===0) {
      return res.status(400).json({ ok:false, error:"缺少 dimensions 参数" });
    }
    const exists = fs.existsSync(IMAGES_DIR);
    if(!exists) {
      return res.status(400).json({ ok:false, error:`图片目录不存在: ${IMAGES_DIR}` });
    }
    const files = listAllImages();
    if(files.length < 2) {
      return res.status(400).json({ ok:false, error:`图片不足（当前 ${files.length} 张）。请将图片放到 client/public/images/ 且扩展名为 jpg/jpeg/png/webp` });
    }

    const counts = ensureCounts(dimensions, files);
    const plan = {};
    for (const dim of dimensions) {
      plan[dim] = planPairsForDimension(files, counts[dim], pairsPerDimension);
    }
    return res.json({ ok:true, plan, totalImages: files.length });
  }catch(e){
    console.error(e);
    return res.status(500).json({ ok:false, error:"plan 失败，请查看 server 控制台日志" });
  }
});

// —— 背景数据和投票数据导出 —— //
// 生成背景数据 CSV（每个被试者填写的背景信息）
function writeBackgroundCSV(meta, folderPath) {
  const metaHeaders = Object.keys(meta);
  const metaValues = metaHeaders.map(k => `"${meta[k] ?? ""}"`);
  
  const backgroundCSV = [
    metaHeaders.join(","),
    metaValues.join(","),
    "",
  ].join("\n");

  fs.writeFileSync(path.join(folderPath, "background.csv"), backgroundCSV, "utf-8");
}

// 生成投票数据 CSV（图片配对比较结果）
function writeVotesCSV(comparisons, folderPath) {
  const header = "id,choice,left,right";
  const rows = [];
  
  let idx = 1;
  const timestamp = Date.now(); // 时间戳（精确到毫秒）

  for (const r of comparisons || []) {
    const id = `vote_${idx++}_${timestamp}`;
    const choice = r.choice || "";
    const leftBase = path.parse(r.leftImage || "").name;  // 去后缀
    const rightBase = path.parse(r.rightImage || "").name; // 去后缀
    rows.push([id, choice, leftBase, rightBase].map(v => `"${v}"`).join(","));
  }

  const votesCSV = [header, ...rows, ""].join("\n");
  fs.writeFileSync(path.join(folderPath, "votes.csv"), votesCSV, "utf-8");
}

// —— 提交并更新计数 —— //
app.post("/submit", (req,res)=>{
  try{
    const body = req.body;
    const ts = new Date().toISOString().replace(/[:.]/g,"-");
    
    // 创建每个被试者的独立文件夹
    const participantDir = path.join(RESULTS_DIR, `participant_${ts}`);
    fs.mkdirSync(participantDir, { recursive: true });

    // 写入背景数据 CSV（background.csv）
    writeBackgroundCSV(body.meta, participantDir);

    // 写入投票数据 CSV（votes.csv）
    writeVotesCSV(body.comparisons, participantDir);

    // 更新曝光计数（按维度，左右各 +1；计数仍以“包含后缀的文件名”为键）
    const dimsInPayload = Array.from(new Set((body.comparisons || []).map(r => r.dimension)));
    const files = listAllImages();
    const counts = ensureCounts(dimsInPayload, files);
    for (const r of (body.comparisons || [])) {
      counts[r.dimension][r.leftImage] = (counts[r.dimension][r.leftImage] ?? 0) + 1;
      counts[r.dimension][r.rightImage] = (counts[r.dimension][r.rightImage] ?? 0) + 1;
    }
    writeJSON(COUNTS_PATH, counts);

    return res.json({ ok:true, folder: path.basename(participantDir) });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "保存失败，请查看 server 日志" });
  }
});

app.listen(PORT, ()=>{
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log(`IMAGES_DIR = ${IMAGES_DIR}`);
});
