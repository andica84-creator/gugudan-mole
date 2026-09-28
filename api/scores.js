// 구구단 두더지 랭킹 API
// GET  /api/scores?date=2026-09-28  → 그날 기록 전체 (단 조합별 순위는 화면에서 나눠요)
// POST /api/scores                   → 기록 저장 (날짜는 서버가 한국 시간으로 정함)
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
  automaticDeserialization: false,
});

const todayKST = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const keyFor = (date) => `mole:scores:${date}`;
const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method === "GET") {
      const date = isDate(req.query.date) ? req.query.date : todayKST();
      const raw = await redis.lrange(keyFor(date), 0, -1);
      const scores = raw
        .map((r) => JSON.parse(r))
        .sort((a, b) => b.score - a.score || a.ts - b.ts)
        .slice(0, 1000);
      return res.status(200).json({ date, scores });
    }

    if (req.method === "POST") {
      const b = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
      const name = String(b.name || "").trim().slice(0, 10);
      const score = Math.floor(Number(b.score));
      const time = Number(b.time);
      const dans = Array.isArray(b.dans)
        ? [...new Set(b.dans.map(Number).filter((d) => d >= 2 && d <= 9))].sort((x, y) => x - y)
        : [];
      if (!name || !Number.isFinite(score) || score < 0 || score > 5000 || ![180, 300].includes(time) || !dans.length) {
        return res.status(400).json({ error: "잘못된 기록이에요." });
      }
      const date = todayKST();
      const rec = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name, score, time, dans,
        correct: Math.max(0, Math.floor(Number(b.correct) || 0)),
        wrong: Math.max(0, Math.floor(Number(b.wrong) || 0)),
        date, ts: Date.now(),
      };
      await redis.rpush(keyFor(date), JSON.stringify(rec));
      return res.status(200).json(rec);
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "지원하지 않는 요청이에요." });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "서버 오류" });
  }
}
