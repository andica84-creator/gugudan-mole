// 교사용 기록 관리 API (비밀번호 필요)
// GET    /api/admin?date=YYYY-MM-DD           → 그날 모든 기록
// DELETE /api/admin?date=YYYY-MM-DD&id=...    → 기록 하나 지우기
// DELETE /api/admin?date=YYYY-MM-DD&all=1     → 그날 기록 모두 지우기
// 비밀번호는 Vercel 환경 변수 TEACHER_PASSWORD 에 넣어 둡니다.
import { Redis } from "@upstash/redis";
import { timingSafeEqual } from "node:crypto";

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
  automaticDeserialization: false,
});

const keyFor = (date) => `mole:scores:${date}`;
const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

function authorized(req) {
  const secret = process.env.TEACHER_PASSWORD || "";
  const given = String(req.headers["x-teacher-password"] || "");
  if (!secret || !given) return false;
  const a = Buffer.from(secret), b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!process.env.TEACHER_PASSWORD) {
    return res.status(500).json({ error: "TEACHER_PASSWORD 환경 변수가 없어요." });
  }
  if (!authorized(req)) return res.status(401).json({ error: "비밀번호가 맞지 않아요." });

  const date = req.query.date;
  if (!isDate(date)) return res.status(400).json({ error: "날짜가 올바르지 않아요." });
  const key = keyFor(date);

  try {
    if (req.method === "GET") {
      const raw = await redis.lrange(key, 0, -1);
      const scores = raw.map((r) => JSON.parse(r)).sort((a, b) => b.score - a.score || a.ts - b.ts);
      return res.status(200).json({ date, scores });
    }

    if (req.method === "DELETE") {
      if (req.query.all === "1") {
        const n = await redis.llen(key);
        await redis.del(key);
        return res.status(200).json({ deleted: n });
      }
      const id = String(req.query.id || "");
      const raw = await redis.lrange(key, 0, -1);
      const target = raw.find((r) => { try { return JSON.parse(r).id === id; } catch { return false; } });
      if (!target) return res.status(404).json({ error: "기록을 찾지 못했어요." });
      await redis.lrem(key, 1, target);
      return res.status(200).json({ deleted: 1 });
    }

    res.setHeader("Allow", "GET, DELETE");
    return res.status(405).json({ error: "지원하지 않는 요청이에요." });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "서버 오류" });
  }
}
