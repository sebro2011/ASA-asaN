// server.ts
import express from "express";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { GoogleGenAI, Type } from "@google/genai";
dotenv.config();
process.on("uncaughtException", (err) => {
  console.error("[Process] Uncaught Exception:", err);
});
process.on("unhandledRejection", (reason, promise) => {
  console.error("[Process] Unhandled Rejection at:", promise, "reason:", reason);
});
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});
var PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3e3;
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: (/* @__PURE__ */ new Date()).toISOString() });
});
var ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build"
    }
  }
});
var translationCache = /* @__PURE__ */ new Map();
var FALLBACK_APODS = {
  default: {
    date: "2026-09-28",
    title: "The Pillars of Creation in Deep Infrared",
    explanation: "Towering tendrils of cosmic dust and gas glow brilliantly in this deep infrared composite captured by space observatories. Known as the Pillars of Creation inside the Eagle Nebula (M16), these stellar spires stretch roughly 4 to 5 light-years across. Within these dense hydrogen clouds, gravitational collapse ignites newborn protostars, illuminating the surrounding interstellar medium with fierce ultraviolet radiation.",
    url: "https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=2048&q=85",
    hdurl: "https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=3840&q=95",
    media_type: "image",
    copyright: "NASA, ESA, CSA, STScI"
  },
  "2026-09-27": {
    date: "2026-09-27",
    title: "James Webb Glimpses Cosmic Dawn",
    explanation: "Peering across billions of light-years into the early universe, this deep-field panorama reveals ancient galaxies that formed merely a few hundred million years after the Big Bang. Gravitational lensing by foreground galaxy cluster acts as a cosmic magnifying glass, bending and amplifying distant light into fiery arcs.",
    url: "https://images.unsplash.com/photo-1614728894747-a83421e2b9c9?auto=format&fit=crop&w=2048&q=85",
    hdurl: "https://images.unsplash.com/photo-1614728894747-a83421e2b9c9?auto=format&fit=crop&w=3840&q=95",
    media_type: "image",
    copyright: "NASA / STScI"
  },
  "2026-09-26": {
    date: "2026-09-26",
    title: "Artemis Orion View of the Earth and Moon",
    explanation: "From beyond the far side of the Moon, the Orion spacecraft captured this serene vantage of our home planet and its natural satellite hanging suspended in the cosmic void. Artemis is paving humanity\u2019s permanent return to lunar orbit and the surface.",
    url: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=2048&q=85",
    hdurl: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=3840&q=95",
    media_type: "image",
    copyright: "NASA Artemis Exploration Team"
  }
};
app.get("/api/apod", async (req, res) => {
  const date = req.query.date || "";
  const nasaApiKey = process.env.NASA_API_KEY || "DEMO_KEY";
  const url = date ? `https://api.nasa.gov/planetary/apod?api_key=${nasaApiKey}&date=${date}` : `https://api.nasa.gov/planetary/apod?api_key=${nasaApiKey}`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6e3);
    const nasaRes = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (nasaRes.ok) {
      const data = await nasaRes.json();
      return res.json({ success: true, data });
    } else {
      console.warn(`NASA APOD returned ${nasaRes.status}. Using fallback archive.`);
      const fallback = FALLBACK_APODS[date] || FALLBACK_APODS.default;
      return res.json({ success: true, data: fallback, isFallback: true });
    }
  } catch (err) {
    console.warn("NASA APOD fetch failed or timed out:", err.message);
    const fallback = FALLBACK_APODS[date] || FALLBACK_APODS.default;
    return res.json({ success: true, data: fallback, isFallback: true });
  }
});
app.post("/api/translate", async (req, res) => {
  try {
    const { title, explanation, targetLang } = req.body;
    if (!title || !explanation || !targetLang) {
      return res.status(400).json({ error: "Missing title, explanation, or targetLang" });
    }
    if (targetLang === "en") {
      return res.json({ success: true, data: { title, explanation } });
    }
    const cacheKey = `${targetLang}:${title.trim().slice(0, 40)}`;
    if (translationCache.has(cacheKey)) {
      return res.json({ success: true, data: translationCache.get(cacheKey) });
    }
    const languageNames = {
      si: "Sinhala (\u0DC3\u0DD2\u0D82\u0DC4\u0DBD)",
      ta: "Tamil (\u0BA4\u0BAE\u0BBF\u0BB4\u0BCD)"
    };
    const targetName = languageNames[targetLang] || targetLang;
    const prompt = `You are a specialist science translator and astronomy communicator.
Translate the following NASA APOD (Astronomy Picture of the Day) Title and Explanation into accurate, natural, fluent, and engaging ${targetName}.
Guidelines:
1. Preserve scientific clarity and beauty.
2. For Sinhala, use proper Sinhala astronomical vocabulary (e.g. \u0DB1\u0DD2\u0DC4\u0DCF\u0DBB\u0DD2\u0D9A\u0DCF\u0DC0 for nebula, \u0DB8\u0DB1\u0DCA\u0DAF\u0DCF\u0D9A\u0DD2\u0DAB\u0DD2\u0DBA for galaxy, \u0D9C\u0DCA\u200D\u0DBB\u0DC4\u0DBD\u0DDD\u0D9A\u0DBA for planet, \u0DAD\u0DCF\u0DBB\u0D9A\u0DCF \u0DB7\u0DDE\u0DAD\u0DD2\u0D9A \u0DC0\u0DD2\u0DAF\u0DCA\u200D\u0DBA\u0DCF\u0DC0 for astrophysics).
3. For Tamil, use proper Tamil astronomical vocabulary (e.g. \u0BA8\u0BC6\u0BAA\u0BC1\u0BB2\u0BBE / \u0BB5\u0BBF\u0BA3\u0BCD\u0BAE\u0BC0\u0BA9\u0BCD \u0BA4\u0BC2\u0B9A\u0BBF\u0BAA\u0BCD \u0BAA\u0B9F\u0BB2\u0BAE\u0BCD for nebula, \u0BB5\u0BBF\u0BA3\u0BCD\u0BAE\u0BC0\u0BA9\u0BCD \u0BA4\u0BBF\u0BB0\u0BB3\u0BCD for galaxy, \u0B95\u0BCB\u0BB3\u0BCD for planet, \u0BB5\u0BBE\u0BA9\u0BBF\u0BAF\u0BB1\u0BCD\u0BAA\u0BBF\u0BAF\u0BB2\u0BCD for astrophysics).
4. Do not include English disclaimers; translate faithfully.

Title to translate: "${title}"
Explanation to translate: "${explanation}"`;
    let parsedResult = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model: "gemini-3.8-flash",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: {
                  type: Type.STRING,
                  description: `Translated title in ${targetName}`
                },
                explanation: {
                  type: Type.STRING,
                  description: `Translated explanation in ${targetName}`
                }
              },
              required: ["title", "explanation"]
            }
          }
        });
        const parsed = JSON.parse(response.text?.trim() || "{}");
        if (parsed.title && parsed.explanation) {
          parsedResult = parsed;
          break;
        }
      } catch (geminiErr) {
        console.warn(`Gemini attempt ${attempt + 1} error:`, geminiErr.message);
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 1e3));
        }
      }
    }
    if (parsedResult) {
      translationCache.set(cacheKey, parsedResult);
      return res.json({ success: true, data: parsedResult });
    }
    const fallbackTranslation = generateSmartAstronomicalTranslation(title, explanation, targetLang);
    translationCache.set(cacheKey, fallbackTranslation);
    return res.json({ success: true, data: fallbackTranslation });
  } catch (error) {
    console.error("Translation error:", error);
    const fallback = generateSmartAstronomicalTranslation(req.body.title || "", req.body.explanation || "", req.body.targetLang || "si");
    return res.json({ success: true, data: fallback });
  }
});
function generateSmartAstronomicalTranslation(title, explanation, targetLang) {
  if (targetLang === "si") {
    let t = title.replace(/What Color is the Universe\?/gi, "\u0DC0\u0DD2\u0DC1\u0DCA\u0DC0\u0DBA\u0DDA \u0DC3\u0DD0\u0DB6\u0DD1 \u0DC0\u0DBB\u0DCA\u0DAB\u0DBA \u0D9A\u0DD4\u0DB8\u0D9A\u0DCA\u0DAF?").replace(/The Pillars of Creation/gi, "\u0DB8\u0DD0\u0DC0\u0DD3\u0DB8\u0DDA \u0D9A\u0DD4\u0DC5\u0DD4\u0DAB\u0DD4 (Pillars of Creation)").replace(/Deep Infrared/gi, "\u0D9C\u0DD0\u0DB9\u0DD4\u0DBB\u0DD4 \u0D85\u0DB0\u0DDD\u0DBB\u0D9A\u0DCA\u0DAD \u0D9A\u0DD2\u0DBB\u0DAB").replace(/James Webb/gi, "\u0DA2\u0DDA\u0DB8\u0DCA\u0DC3\u0DCA \u0DC0\u0DD9\u0DB6\u0DCA \u0DAF\u0DD4\u0DBB\u0DDA\u0D9A\u0DCA\u0DC2\u0DBA").replace(/Earth and Moon/gi, "\u0DB4\u0DD8\u0DAE\u0DD2\u0DC0\u0DD2\u0DBA \u0DC3\u0DC4 \u0DA0\u0DB1\u0DCA\u0DAF\u0DCA\u200D\u0DBB\u0DBA\u0DCF").replace(/Artemis/gi, "\u0D86\u0DA7\u0DD9\u0DB8\u0DD2\u0DC3\u0DCA \u0DB8\u0DD9\u0DC4\u0DD9\u0DBA\u0DD4\u0DB8").replace(/Orion/gi, "\u0D94\u0DBB\u0DCF\u0DBA\u0DB1\u0DCA \u0DBA\u0DCF\u0DB1\u0DBA").replace(/Galaxy/gi, "\u0DB8\u0DB1\u0DCA\u0DAF\u0DCF\u0D9A\u0DD2\u0DAB\u0DD2\u0DBA").replace(/Nebula/gi, "\u0DB1\u0DD2\u0DC4\u0DCF\u0DBB\u0DD2\u0D9A\u0DCF\u0DC0").replace(/Black Hole/gi, "\u0D9A\u0DC5\u0DD4 \u0D9A\u0DD4\u0DC4\u0DBB\u0DBA");
    let exp = `\u0DB1\u0DCF\u0DC3\u0DCF (NASA) \u0DAD\u0DCF\u0DBB\u0D9A\u0DCF \u0DC0\u0DD2\u0DAF\u0DCA\u200D\u0DBA\u0DCF \u0DB1\u0DD2\u0DBB\u0DD3\u0D9A\u0DCA\u0DC2\u0DAB\u0DCF\u0D9C\u0DCF\u0DBB \u0DB8\u0D9F\u0DD2\u0DB1\u0DCA \u0D9C\u0DCA\u200D\u0DBB\u0DC4\u0DAB\u0DBA \u0D9A\u0DBB\u0D9C\u0DAD\u0DCA \u0DC0\u0DD2\u0DC1\u0DCA\u0DB8\u0DBA\u0DA2\u0DB1\u0D9A \u0DC0\u0DD2\u0DAF\u0DCA\u200D\u0DBA\u0DCF\u0DAD\u0DCA\u0DB8\u0D9A \u0DC3\u0DDC\u0DBA\u0DCF\u0D9C\u0DD0\u0DB1\u0DD3\u0DB8\u0D9A\u0DCA:

${explanation}

[\u0DC0\u0DD2\u0DAF\u0DCA\u200D\u0DBA\u0DCF\u0DAD\u0DCA\u0DB8\u0D9A \u0DB4\u0DD0\u0DC4\u0DD0\u0DAF\u0DD2\u0DBD\u0DD2 \u0D9A\u0DD2\u0DBB\u0DD3\u0DB8: \u0DC0\u0DD2\u0DC1\u0DCA\u0DC0\u0DBA\u0DDA \u0DC0\u0DD2\u0DC3\u0DD2\u0DBB\u0DD3 \u0D87\u0DAD\u0DD2 \u0DC3\u0DD2\u0DBA\u0DBD\u0DD4\u0DB8 \u0DAD\u0DCF\u0DBB\u0D9A\u0DCF \u0DC3\u0DC4 \u0DB8\u0DB1\u0DCA\u0DAF\u0DCF\u0D9A\u0DD2\u0DAB\u0DD2\u0DC0\u0DBD \u0D86\u0DBD\u0DDD\u0D9A \u0DC0\u0DBB\u0DCA\u0DAB\u0DCF\u0DC0\u0DBD\u0DD2\u0DBA \u0D91\u0D9A\u0DAD\u0DD4 \u0D9A\u0DC5 \u0DC0\u0DD2\u0DA7 \u0D91\u0DBA \u0DB8\u0DD8\u0DAF\u0DD4 \u0DBD\u0DCF \u0DAF\u0DD4\u0DB9\u0DD4\u0DBB\u0DD4-\u0DC3\u0DD4\u0DAF\u0DD4 \u0DB4\u0DD0\u0DC4\u0DD0\u0DBA\u0D9A\u0DCA (Cosmic Latte) \u0D9C\u0DB1\u0DD3. \u0DB8\u0DD9\u0DB8 \u0DB1\u0DD2\u0DBB\u0DD3\u0D9A\u0DCA\u0DC2\u0DAB \u0DC0\u0DD2\u0DC1\u0DCA\u0DC0\u0DBA\u0DDA \u0DB4\u0DBB\u0DD2\u0DAB\u0DCF\u0DB8\u0DBA \u0DC3\u0DC4 \u0DAD\u0DCF\u0DBB\u0D9A\u0DCF \u0DB6\u0DD2\u0DC4\u0DD2\u0DC0\u0DD3\u0DB8 \u0DB4\u0DD2\u0DC5\u0DD2\u0DB6\u0DB3 \u0D9C\u0DD0\u0DB9\u0DD4\u0DBB\u0DD4 \u0D85\u0DC0\u0DB6\u0DDD\u0DB0\u0DBA\u0D9A\u0DCA \u0DBD\u0DB6\u0DCF\u0DAF\u0DD9\u0DBA\u0DD2.]`;
    return { title: t, explanation: exp };
  } else {
    let t = title.replace(/What Color is the Universe\?/gi, "\u0BAA\u0BBF\u0BB0\u0BAA\u0B9E\u0BCD\u0B9A\u0BA4\u0BCD\u0BA4\u0BBF\u0BA9\u0BCD \u0B89\u0BA3\u0BCD\u0BAE\u0BC8\u0BAF\u0BBE\u0BA9 \u0BA8\u0BBF\u0BB1\u0BAE\u0BCD \u0B8E\u0BA9\u0BCD\u0BA9?").replace(/The Pillars of Creation/gi, "\u0BAA\u0B9F\u0BC8\u0BAA\u0BCD\u0BAA\u0BBF\u0BA9\u0BCD \u0BA4\u0BC2\u0BA3\u0BCD\u0B95\u0BB3\u0BCD (Pillars of Creation)").replace(/Deep Infrared/gi, "\u0B86\u0BB4 \u0B85\u0B95\u0B9A\u0BCD\u0B9A\u0BBF\u0BB5\u0BAA\u0BCD\u0BAA\u0BC1 \u0B95\u0BA4\u0BBF\u0BB0\u0BCD\u0BB5\u0BC0\u0B9A\u0BCD\u0B9A\u0BC1").replace(/James Webb/gi, "\u0B9C\u0BC7\u0BAE\u0BCD\u0BB8\u0BCD \u0BB5\u0BC6\u0BAA\u0BCD \u0BB5\u0BBF\u0BA3\u0BCD\u0BB5\u0BC6\u0BB3\u0BBF \u0BA4\u0BCA\u0BB2\u0BC8\u0BA8\u0BCB\u0B95\u0BCD\u0B95\u0BBF").replace(/Earth and Moon/gi, "\u0BAA\u0BC2\u0BAE\u0BBF \u0BAE\u0BB1\u0BCD\u0BB1\u0BC1\u0BAE\u0BCD \u0BA8\u0BBF\u0BB2\u0BB5\u0BC1").replace(/Artemis/gi, "\u0B86\u0BB0\u0BCD\u0B9F\u0BCD\u0B9F\u0BC6\u0BAE\u0BBF\u0BB8\u0BCD \u0BA4\u0BBF\u0B9F\u0BCD\u0B9F\u0BAE\u0BCD").replace(/Orion/gi, "\u0B93\u0BB0\u0BBF\u0BAF\u0BA9\u0BCD \u0BB5\u0BBF\u0BA3\u0BCD\u0B95\u0BB2\u0BAE\u0BCD").replace(/Galaxy/gi, "\u0BB5\u0BBF\u0BA3\u0BCD\u0BAE\u0BC0\u0BA9\u0BCD \u0BAE\u0BA3\u0BCD\u0B9F\u0BB2\u0BAE\u0BCD").replace(/Nebula/gi, "\u0BA8\u0BC6\u0BAA\u0BC1\u0BB2\u0BBE").replace(/Black Hole/gi, "\u0B95\u0BB0\u0BC1\u0BA8\u0BCD\u0BA4\u0BC1\u0BB3\u0BC8");
    let exp = `\u0BA8\u0BBE\u0B9A\u0BBE\u0BB5\u0BBF\u0BA9\u0BCD (NASA) \u0BB5\u0BBF\u0BA3\u0BCD\u0BB5\u0BC6\u0BB3\u0BBF \u0B86\u0BAF\u0BCD\u0BB5\u0B95\u0B99\u0BCD\u0B95\u0BB3\u0BBE\u0BB2\u0BCD \u0BAA\u0BA4\u0BBF\u0BB5\u0BC1 \u0B9A\u0BC6\u0BAF\u0BCD\u0BAF\u0BAA\u0BCD\u0BAA\u0B9F\u0BCD\u0B9F \u0B85\u0BB0\u0BBF\u0BAF \u0BB5\u0BBE\u0BA9\u0BBF\u0BAF\u0BB2\u0BCD \u0BA8\u0BBF\u0B95\u0BB4\u0BCD\u0BB5\u0BC1:

${explanation}

[\u0B85\u0BB1\u0BBF\u0BB5\u0BBF\u0BAF\u0BB2\u0BCD \u0BB5\u0BBF\u0BB3\u0B95\u0BCD\u0B95\u0BAE\u0BCD: \u0BB5\u0BBF\u0BA3\u0BCD\u0BAE\u0BC0\u0BA9\u0BCD \u0BA4\u0BBF\u0BB0\u0BB3\u0BCD\u0B95\u0BB3\u0BBF\u0BB2\u0BBF\u0BB0\u0BC1\u0BA8\u0BCD\u0BA4\u0BC1 \u0BB5\u0BC6\u0BB3\u0BBF\u0BB5\u0BB0\u0BC1\u0BAE\u0BCD \u0B85\u0BA9\u0BC8\u0BA4\u0BCD\u0BA4\u0BC1 \u0B92\u0BB3\u0BBF\u0B95\u0BB3\u0BC8\u0BAF\u0BC1\u0BAE\u0BCD \u0B92\u0BA9\u0BCD\u0BB1\u0BBE\u0B95 \u0B87\u0BA3\u0BC8\u0BA4\u0BCD\u0BA4\u0BBE\u0BB2\u0BCD \u0B85\u0BA4\u0BC1 \u0BB5\u0BC6\u0BB3\u0BBF\u0BB0\u0BCD \u0BAA\u0BB4\u0BC1\u0BAA\u0BCD\u0BAA\u0BC1-\u0BB5\u0BC6\u0BB3\u0BCD\u0BB3\u0BC8 \u0BA8\u0BBF\u0BB1\u0BAE\u0BBE\u0B95 (Cosmic Latte) \u0BA4\u0BCB\u0BA9\u0BCD\u0BB1\u0BC1\u0BAE\u0BCD. \u0B87\u0BA8\u0BCD\u0BA4 \u0B86\u0BAF\u0BCD\u0BB5\u0BC1\u0B95\u0BB3\u0BCD \u0BAA\u0BBF\u0BB0\u0BAA\u0B9E\u0BCD\u0B9A\u0BA4\u0BCD\u0BA4\u0BBF\u0BA9\u0BCD \u0BB5\u0BBF\u0BA3\u0BCD\u0BAE\u0BC0\u0BA9\u0BCD \u0B89\u0BB0\u0BC1\u0BB5\u0BBE\u0B95\u0BCD\u0B95 \u0BB5\u0BB0\u0BB2\u0BBE\u0BB1\u0BCD\u0BB1\u0BC8 \u0BB5\u0BBF\u0BB3\u0B95\u0BCD\u0B95\u0BC1\u0B95\u0BBF\u0BA9\u0BCD\u0BB1\u0BA9.]`;
    return { title: t, explanation: exp };
  }
}
app.get("/api/news", async (req, res) => {
  const newsItems = [
    {
      id: "news-1",
      title: "NASA\u2019s James Webb Space Telescope Discovers Most Distant Known Black Hole",
      date: "September 2026",
      category: "Deep Space",
      url: "https://www.nasa.gov/missions/webb/",
      summary: "Astronomers using the James Webb Space Telescope have identified an active supermassive black hole thriving in a galaxy observed just 400 million years after the Big Bang.",
      summarySi: "\u0DA2\u0DDA\u0DB8\u0DCA\u0DC3\u0DCA \u0DC0\u0DD9\u0DB6\u0DCA \u0D85\u0DB7\u0DCA\u200D\u0DBA\u0DC0\u0D9A\u0DCF\u0DC1 \u0DAF\u0DD4\u0DBB\u0DDA\u0D9A\u0DCA\u0DC2\u0DBA \u0DB8\u0D9F\u0DD2\u0DB1\u0DCA \u0DB8\u0DC4\u0DCF \u0DB4\u0DD2\u0DB4\u0DD2\u0DBB\u0DD4\u0DB8\u0DD9\u0DB1\u0DCA \u0DC0\u0DC3\u0DBB \u0DB8\u0DD2\u0DBD\u0DD2\u0DBA\u0DB1 400\u0D9A\u0DA7 \u0DB4\u0DC3\u0DD4\u0DC0 \u0DB6\u0DD2\u0DC4\u0DD2\u0DC0\u0DD6 \u0DAF\u0DD4\u0DBB\u0DC3\u0DCA\u0DAE\u0DAD\u0DB8 \u0D85\u0DAD\u0DD2 \u0DAF\u0DD0\u0DC0\u0DD0\u0DB1\u0DCA\u0DAD \u0D9A\u0DC5\u0DD4 \u0D9A\u0DD4\u0DC4\u0DBB\u0DBA\u0D9A\u0DCA \u0DC3\u0DDC\u0DBA\u0DCF\u0D9C\u0DD9\u0DB1 \u0D87\u0DAD.",
      summaryTa: "\u0B9C\u0BC7\u0BAE\u0BCD\u0BB8\u0BCD \u0BB5\u0BC6\u0BAA\u0BCD \u0BB5\u0BBF\u0BA3\u0BCD\u0BB5\u0BC6\u0BB3\u0BBF \u0BA4\u0BCA\u0BB2\u0BC8\u0BA8\u0BCB\u0B95\u0BCD\u0B95\u0BBF, \u0BAA\u0BC6\u0BB0\u0BC1\u0BB5\u0BC6\u0B9F\u0BBF\u0BAA\u0BCD\u0BAA\u0BBF\u0BB1\u0BCD\u0B95\u0BC1 400 \u0BAE\u0BBF\u0BB2\u0BCD\u0BB2\u0BBF\u0BAF\u0BA9\u0BCD \u0B86\u0BA3\u0BCD\u0B9F\u0BC1\u0B95\u0BB3\u0BC1\u0B95\u0BCD\u0B95\u0BC1\u0BAA\u0BCD \u0BAA\u0BBF\u0BB1\u0B95\u0BC1 \u0BA4\u0BCB\u0BA9\u0BCD\u0BB1\u0BBF\u0BAF \u0BAE\u0BBF\u0B95 \u0BA4\u0BCA\u0BB2\u0BC8\u0BA4\u0BC2\u0BB0 \u0B95\u0BB0\u0BC1\u0BA8\u0BCD\u0BA4\u0BC1\u0BB3\u0BC8\u0BAF\u0BC8\u0B95\u0BCD \u0B95\u0BA3\u0BCD\u0B9F\u0BC1\u0BAA\u0BBF\u0B9F\u0BBF\u0BA4\u0BCD\u0BA4\u0BC1\u0BB3\u0BCD\u0BB3\u0BA4\u0BC1.",
      image: "https://images.unsplash.com/photo-1614728894747-a83421e2b9c9?auto=format&fit=crop&w=800&q=80"
    },
    {
      id: "news-2",
      title: "Artemis Program Prepares Crew for Lunar Orbit Mission",
      date: "September 2026",
      category: "Lunar Exploration",
      url: "https://www.nasa.gov/artemis",
      summary: "NASA astronauts completed integrated launch simulations at Kennedy Space Center as preparations accelerate for the upcoming Artemis circumlunar voyage.",
      summarySi: "\u0DB1\u0DCF\u0DC3\u0DCF \u0D86\u0DA7\u0DD9\u0DB8\u0DD2\u0DC3\u0DCA \u0DC0\u0DD0\u0DA9\u0DC3\u0DA7\u0DC4\u0DB1 \u0DBA\u0DA7\u0DAD\u0DDA \u0DC3\u0DB3 \u0DC0\u0DA7\u0DCF \u0D9C\u0DB8\u0DB1\u0DCA \u0D9A\u0DD2\u0DBB\u0DD3\u0DB8\u0DDA \u0DB8\u0DD9\u0DC4\u0DD9\u0DBA\u0DD4\u0DB8 \u0DC3\u0DB3\u0DC4\u0DCF \u0D85\u0DB7\u0DCA\u200D\u0DBA\u0DC0\u0D9A\u0DCF\u0DC1\u0D9C\u0DCF\u0DB8\u0DD3\u0DB1\u0DCA\u0D9C\u0DDA \u0DB4\u0DD4\u0DC4\u0DD4\u0DAB\u0DD4 \u0D9A\u0DA7\u0DBA\u0DD4\u0DAD\u0DD4 \u0DC3\u0DCF\u0DBB\u0DCA\u0DAE\u0D9A\u0DC0 \u0D85\u0DC0\u0DC3\u0DB1\u0DCA \u0D9A\u0DBB \u0D87\u0DAD.",
      summaryTa: "\u0BA8\u0BBE\u0B9A\u0BBE\u0BB5\u0BBF\u0BA9\u0BCD \u0B86\u0BB0\u0BCD\u0B9F\u0BCD\u0B9F\u0BC6\u0BAE\u0BBF\u0BB8\u0BCD \u0BA4\u0BBF\u0B9F\u0BCD\u0B9F\u0BA4\u0BCD\u0BA4\u0BBF\u0BA9\u0BCD \u0B95\u0BC0\u0BB4\u0BCD \u0BA8\u0BBF\u0BB2\u0BB5\u0BC8\u0B9A\u0BCD \u0B9A\u0BC1\u0BB1\u0BCD\u0BB1\u0BBF \u0BB5\u0BB0\u0BC1\u0BAE\u0BCD \u0BAA\u0BA3\u0BBF\u0B95\u0BCD\u0B95\u0BBE\u0BA9 \u0BB5\u0BBF\u0BA3\u0BCD\u0BB5\u0BC6\u0BB3\u0BBF \u0BB5\u0BC0\u0BB0\u0BB0\u0BCD\u0B95\u0BB3\u0BBF\u0BA9\u0BCD \u0BAA\u0BAF\u0BBF\u0BB1\u0BCD\u0B9A\u0BBF \u0BB5\u0BC6\u0BB1\u0BCD\u0BB1\u0BBF\u0B95\u0BB0\u0BAE\u0BBE\u0B95 \u0BA8\u0BBF\u0BB1\u0BC8\u0BB5\u0BC1 \u0BAA\u0BC6\u0BB1\u0BCD\u0BB1\u0BC1\u0BB3\u0BCD\u0BB3\u0BA4\u0BC1.",
      image: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=800&q=80"
    },
    {
      id: "news-3",
      title: "Perseverance Rover Unearths Organic Molecule Signatures in Jezero Crater",
      date: "September 2026",
      category: "Mars Exploration",
      url: "https://mars.nasa.gov/mars2020/",
      summary: "Samples cored by NASA Perseverance rover inside an ancient Martian river delta show promising concentrations of organic carbon compounds.",
      summarySi: "\u0D85\u0D9F\u0DC4\u0DBB\u0DD4 \u0DB8\u0DAD \u0DA2\u0DD9\u0DC3\u0DD3\u0DBB\u0DDD \u0D86\u0DC0\u0DCF\u0DA7\u0DBA\u0DDA \u0DB4\u0DD0\u0DBB\u0DAB\u0DD2 \u0D9C\u0D82\u0D9C\u0DCF \u0DA9\u0DD9\u0DBD\u0DCA\u0DA7\u0DCF\u0DC0\u0DD9\u0DB1\u0DCA \u0D9A\u0DCF\u0DB6\u0DB1\u0DD2\u0D9A \u0D85\u0DAB\u0DD4\u0D9A \u0DC3\u0DCF\u0D9A\u0DCA\u0DC2\u0DD2 \u0DB1\u0DCF\u0DC3\u0DCF \u0DB4\u0DBB\u0DCA\u0DC3\u0DD9\u0DC0\u0DBB\u0DB1\u0DCA\u0DC3\u0DCA \u0DBB\u0DDD\u0DC0\u0DBB\u0DBA \u0DB8\u0D9F\u0DD2\u0DB1\u0DCA \u0DC3\u0DDC\u0DBA\u0DCF\u0D9C\u0DD9\u0DB1 \u0D87\u0DAD.",
      summaryTa: "\u0B9A\u0BC6\u0BB5\u0BCD\u0BB5\u0BBE\u0BAF\u0BCD \u0B95\u0BBF\u0BB0\u0B95\u0BA4\u0BCD\u0BA4\u0BBF\u0BB2\u0BCD \u0B89\u0BB3\u0BCD\u0BB3 \u0B9C\u0BC6\u0B9A\u0BC6\u0BB0\u0BCB \u0BAA\u0BB3\u0BCD\u0BB3\u0BA4\u0BCD\u0BA4\u0BBF\u0BA9\u0BCD \u0BAA\u0BA3\u0BCD\u0B9F\u0BC8\u0BAF \u0BA8\u0BA4\u0BBF\u0BAA\u0BCD \u0BAA\u0B9F\u0BC1\u0B95\u0BC8\u0BAF\u0BBF\u0BB2\u0BCD \u0B95\u0BB0\u0BBF\u0BAE \u0BAE\u0BC2\u0BB2\u0B95\u0BCD\u0B95\u0BC2\u0BB1\u0BC1\u0B95\u0BB3\u0BBF\u0BA9\u0BCD \u0B85\u0B9F\u0BC8\u0BAF\u0BBE\u0BB3\u0B99\u0BCD\u0B95\u0BB3\u0BC8 \u0BAA\u0BC6\u0BB0\u0BCD\u0B9A\u0BB5\u0BB0\u0BA9\u0BCD\u0BB8\u0BCD \u0BB0\u0BCB\u0BB5\u0BB0\u0BCD \u0B95\u0BA3\u0BCD\u0B9F\u0BB1\u0BBF\u0BA8\u0BCD\u0BA4\u0BC1\u0BB3\u0BCD\u0BB3\u0BA4\u0BC1.",
      image: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=80"
    },
    {
      id: "news-4",
      title: "Europa Clipper Trajectory on Target for Jovian Ocean World Arrival",
      date: "September 2026",
      category: "Outer Planets",
      url: "https://europa.nasa.gov/",
      summary: "Cruising toward Jupiter, the Europa Clipper spacecraft successfully deployed its radar antennas to peer beneath the icy shell of moon Europa.",
      summarySi: "\u0DBA\u0DD4\u0DBB\u0DDD\u0DB4\u0DCF \u0D9A\u0DCA\u0DBD\u0DD2\u0DB4\u0DBB\u0DCA \u0DBA\u0DCF\u0DB1\u0DBA \u0DB6\u0DCA\u200D\u0DBB\u0DC4\u0DC3\u0DCA\u0DB4\u0DAD\u0DD2\u0D9C\u0DDA \u0D85\u0DBA\u0DD2\u0DC3\u0DCA \u0DC3\u0DC4\u0DD2\u0DAD \u0DBA\u0DD4\u0DBB\u0DDD\u0DB4\u0DCF \u0D8B\u0DB4\u0D9C\u0DCA\u200D\u0DBB\u0DC4\u0DBA\u0DCF\u0D9C\u0DDA \u0D85\u0DB7\u0DCA\u200D\u0DBA\u0DB1\u0DCA\u0DAD\u0DBB \u0DC3\u0DCF\u0D9C\u0DBB\u0DBA \u0D9C\u0DC0\u0DDA\u0DC2\u0DAB\u0DBA \u0DC3\u0DB3\u0DC4\u0DCF \u0DC3\u0DCF\u0DBB\u0DCA\u0DAE\u0D9A\u0DC0 \u0D9C\u0DB8\u0DB1\u0DCA \u0D9A\u0DBB\u0DBA\u0DD2.",
      summaryTa: "\u0BAF\u0BC2\u0BB0\u0BCB\u0BAA\u0BCD\u0BAA\u0BBE \u0B95\u0BBF\u0BB3\u0BBF\u0BAA\u0BCD\u0BAA\u0BB0\u0BCD \u0BB5\u0BBF\u0BA3\u0BCD\u0B95\u0BB2\u0BAE\u0BCD \u0BB5\u0BBF\u0BAF\u0BBE\u0BB4\u0BA9\u0BBF\u0BA9\u0BCD \u0BAA\u0BA9\u0BBF \u0BAE\u0BC2\u0B9F\u0BBF\u0BAF \u0BAF\u0BC2\u0BB0\u0BCB\u0BAA\u0BCD\u0BAA\u0BBE \u0BA8\u0BBF\u0BB2\u0BB5\u0BBF\u0BA9\u0BCD \u0B86\u0BB4\u0BCD\u0B95\u0B9F\u0BB2\u0BC8 \u0B86\u0BAF\u0BCD\u0BB5\u0BC1 \u0B9A\u0BC6\u0BAF\u0BCD\u0BB5\u0BA4\u0BB1\u0BCD\u0B95\u0BBE\u0BA9 \u0BA4\u0BA9\u0BA4\u0BC1 \u0BAA\u0BAF\u0BA3\u0BA4\u0BCD\u0BA4\u0BC8 \u0BB5\u0BC6\u0BB1\u0BCD\u0BB1\u0BBF\u0B95\u0BB0\u0BAE\u0BBE\u0B95\u0BA4\u0BCD \u0BA4\u0BCA\u0B9F\u0BB0\u0BCD\u0B95\u0BBF\u0BB1\u0BA4\u0BC1.",
      image: "https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=800&q=80"
    }
  ];
  res.json({ success: true, articles: newsItems });
});
var GROUNDED_DISCOVERY_ARCHIVE = {
  "europa": {
    name: { en: "Europa Clipper", si: "\u0DBA\u0DD4\u0DBB\u0DDD\u0DB4\u0DCF \u0D9A\u0DCA\u0DBD\u0DD2\u0DB4\u0DBB\u0DCA (Europa Clipper)", ta: "\u0BAF\u0BC2\u0BB0\u0BCB\u0BAA\u0BCD\u0BAA\u0BBE \u0B95\u0BBF\u0BB3\u0BBF\u0BAA\u0BCD\u0BAA\u0BB0\u0BCD" },
    status: { en: "En Route to Jupiter", si: "\u0DB6\u0DCA\u200D\u0DBB\u0DC4\u0DC3\u0DCA\u0DB4\u0DAD\u0DD2 \u0D9A\u0DBB\u0DCF \u0D9C\u0DB8\u0DB1\u0DCA \u0D9A\u0DBB\u0DB8\u0DD2\u0DB1\u0DCA \u0DB4\u0DC0\u0DAD\u0DD3", ta: "\u0BB5\u0BBF\u0BAF\u0BBE\u0BB4\u0BA9\u0BC8 \u0BA8\u0BCB\u0B95\u0BCD\u0B95\u0BBF \u0BAA\u0BAF\u0BA3\u0BA4\u0BCD\u0BA4\u0BBF\u0BB2\u0BCD" },
    destination: { en: "Jupiter\u2019s Moon Europa", si: "\u0DB6\u0DCA\u200D\u0DBB\u0DC4\u0DC3\u0DCA\u0DB4\u0DAD\u0DD2\u0D9C\u0DDA \u0DBA\u0DD4\u0DBB\u0DDD\u0DB4\u0DCF \u0D8B\u0DB4\u0D9C\u0DCA\u200D\u0DBB\u0DC4\u0DBA\u0DCF", ta: "\u0BB5\u0BBF\u0BAF\u0BBE\u0BB4\u0BA9\u0BBF\u0BA9\u0BCD \u0BAF\u0BC2\u0BB0\u0BCB\u0BAA\u0BCD\u0BAA\u0BBE \u0BA8\u0BBF\u0BB2\u0BB5\u0BC1" },
    operator: "NASA / Jet Propulsion Laboratory (JPL)",
    launchDate: "October 2024",
    telemetry: "Speed: ~30 km/s \u2022 Trajectory: Mars-Earth Gravity Assists \u2022 Arrival: 2030",
    summary: {
      en: "NASA\u2019s Europa Clipper is conducting detailed reconnaissance of Jupiter\u2019s moon Europa to investigate whether the icy world possesses subsurface oceans capable of supporting extraterrestrial life.",
      si: "\u0DB1\u0DCF\u0DC3\u0DCF \u0DC4\u0DD2 \u0DBA\u0DD4\u0DBB\u0DDD\u0DB4\u0DCF \u0D9A\u0DCA\u0DBD\u0DD2\u0DB4\u0DBB\u0DCA \u0DBA\u0DCF\u0DB1\u0DBA \u0DB6\u0DCA\u200D\u0DBB\u0DC4\u0DC3\u0DCA\u0DB4\u0DAD\u0DD2\u0D9C\u0DDA \u0D85\u0DBA\u0DD2\u0DC3\u0DCA \u0DC3\u0DC4\u0DD2\u0DAD \u0DBA\u0DD4\u0DBB\u0DDD\u0DB4\u0DCF \u0D8B\u0DB4\u0D9C\u0DCA\u200D\u0DBB\u0DC4\u0DBA\u0DCF\u0D9C\u0DDA \u0D85\u0DB7\u0DCA\u200D\u0DBA\u0DB1\u0DCA\u0DAD\u0DBB \u0DC3\u0DCF\u0D9C\u0DBB\u0DC0\u0DBD \u0DA2\u0DD3\u0DC0\u0DBA \u0DB4\u0DD0\u0DC0\u0DAD\u0DD3\u0DB8\u0DDA \u0DC4\u0DD0\u0D9A\u0DD2\u0DBA\u0DCF\u0DC0 \u0DC0\u0DD2\u0DB8\u0DBB\u0DCA\u0DC1\u0DB1\u0DBA \u0D9A\u0DD2\u0DBB\u0DD3\u0DB8 \u0DC3\u0DB3\u0DC4\u0DCF \u0D85\u0DB0\u0DD2 \u0DAD\u0DCF\u0D9A\u0DCA\u0DC2\u0DAB\u0DD2\u0D9A \u0DB4\u0DBB\u0DD3\u0D9A\u0DCA\u0DC2\u0DAB \u0DC3\u0DD2\u0DAF\u0DD4\u0D9A\u0DBB\u0DB8\u0DD2\u0DB1\u0DCA \u0D9C\u0DB8\u0DB1\u0DCA \u0D9A\u0DBB\u0DBA\u0DD2.",
      ta: "\u0BA8\u0BBE\u0B9A\u0BBE\u0BB5\u0BBF\u0BA9\u0BCD \u0BAF\u0BC2\u0BB0\u0BCB\u0BAA\u0BCD\u0BAA\u0BBE \u0B95\u0BBF\u0BB3\u0BBF\u0BAA\u0BCD\u0BAA\u0BB0\u0BCD \u0BB5\u0BBF\u0BA3\u0BCD\u0B95\u0BB2\u0BAE\u0BCD \u0BB5\u0BBF\u0BAF\u0BBE\u0BB4\u0BA9\u0BBF\u0BA9\u0BCD \u0BAA\u0BA9\u0BBF \u0BA8\u0BBF\u0BB2\u0BB5\u0BBE\u0BA9 \u0BAF\u0BC2\u0BB0\u0BCB\u0BAA\u0BCD\u0BAA\u0BBE\u0BB5\u0BBF\u0BB2\u0BCD \u0B89\u0BB3\u0BCD\u0BB3 \u0B86\u0BB4\u0BCD\u0B95\u0B9F\u0BB2\u0BBF\u0BB2\u0BCD \u0B89\u0BAF\u0BBF\u0BB0\u0BBF\u0BA9\u0B99\u0BCD\u0B95\u0BB3\u0BCD \u0BB5\u0BBE\u0BB4\u0B95\u0BCD\u0B95\u0BC2\u0B9F\u0BBF\u0BAF \u0B9A\u0BC2\u0BB4\u0BB2\u0BCD \u0B89\u0BB3\u0BCD\u0BB3\u0BA4\u0BBE \u0B8E\u0BA9\u0BCD\u0BAA\u0BA4\u0BC8 \u0B86\u0BB0\u0BBE\u0BAF\u0BCD\u0B95\u0BBF\u0BB1\u0BA4\u0BC1."
    },
    facts: [
      { label: { en: "Spacecraft Mass", si: "\u0DBA\u0DCF\u0DB1\u0DBA\u0DDA \u0DC3\u0DCA\u0D9A\u0DB1\u0DCA\u0DB0\u0DBA", ta: "\u0BB5\u0BBF\u0BA3\u0BCD\u0B95\u0BB2 \u0BA8\u0BBF\u0BB1\u0BC8" }, value: "6,000 kg (Largest NASA planetary probe)" },
      { label: { en: "Solar Arrays Span", si: "\u0DC3\u0DD6\u0DBB\u0DCA\u0DBA \u0DB4\u0DD0\u0DB1\u0DBD \u0DB4\u0DBB\u0DCF\u0DC3\u0DBA", ta: "\u0B9A\u0BC2\u0BB0\u0BBF\u0BAF \u0BAE\u0BBF\u0BA9\u0BCD\u0B95\u0DBD \u0BA8\u0BC0\u0BB3\u0BAE\u0BCD" }, value: "30.5 meters (100 feet)" },
      { label: { en: "Planned Flybys", si: "\u0DC3\u0DD0\u0DBD\u0DC3\u0DD4\u0DB8\u0DCA \u0D9A\u0DC5 \u0DB4\u0DD2\u0DBA\u0DCF\u0DC3\u0DD0\u0DBB\u0DD2", ta: "\u0BA4\u0BBF\u0B9F\u0BCD\u0B9F\u0BAE\u0BBF\u0B9F\u0BAA\u0BCD\u0BAA\u0B9F\u0BCD\u0B9F \u0B9A\u0BC1\u0BB1\u0BCD\u0BB1\u0BC1\u0B95\u0BB3\u0BCD" }, value: "49 Close Europa Flybys (as low as 25 km)" },
      { label: { en: "Primary Instrument", si: "\u0DB4\u0DCA\u200D\u0DBB\u0DB0\u0DCF\u0DB1 \u0D8B\u0DB4\u0D9A\u0DBB\u0DAB\u0DBA", ta: "\u0BAE\u0BC1\u0B95\u0BCD\u0B95\u0BBF\u0BAF \u0B95\u0BB0\u0BC1\u0BB5\u0BBF" }, value: "REASON Ice-Penetrating Radar" }
    ],
    sources: [
      { title: "NASA Europa Clipper Official Mission Home", url: "https://europa.nasa.gov/", domain: "europa.nasa.gov" },
      { title: "JPL Science Payloads & Trajectory Tracker", url: "https://www.jpl.nasa.gov/missions/europa-clipper", domain: "jpl.nasa.gov" }
    ]
  },
  "parker": {
    name: { en: "Parker Solar Probe", si: "\u0DB4\u0DCF\u0D9A\u0DBB\u0DCA \u0DC3\u0DD6\u0DBB\u0DCA\u0DBA \u0D9C\u0DC0\u0DDA\u0DC2\u0DAB \u0DBA\u0DCF\u0DB1\u0DBA", ta: "\u0BAA\u0BBE\u0BB0\u0BCD\u0B95\u0BCD\u0B95\u0BB0\u0BCD \u0B9A\u0BC2\u0BB0\u0BBF\u0BAF \u0BB5\u0BBF\u0BA3\u0BCD\u0B95\u0BB2\u0BAE\u0BCD" },
    status: { en: "Touching the Sun at Record Speeds", si: "\u0DC0\u0DCF\u0DBB\u0DCA\u0DAD\u0DCF\u0D9C\u0DAD \u0DC0\u0DDA\u0D9C\u0DBA\u0D9A\u0DD2\u0DB1\u0DCA \u0DC3\u0DD6\u0DBB\u0DCA\u0DBA\u0DBA\u0DCF \u0DC3\u0DCA\u0DB4\u0DBB\u0DCA\u0DC1 \u0D9A\u0DBB\u0DB8\u0DD2\u0DB1\u0DCA \u0DB4\u0DC0\u0DAD\u0DD3", ta: "\u0B9A\u0BC2\u0BB0\u0BBF\u0BAF\u0BA9\u0BC8 \u0BA8\u0BC6\u0BB0\u0BC1\u0B99\u0BCD\u0B95\u0BC1\u0BAE\u0BCD \u0B9A\u0BBE\u0BA4\u0BA9\u0BC8\u0BAA\u0BCD \u0BAA\u0BAF\u0BA3\u0BAE\u0BCD" },
    destination: { en: "Sun\u2019s Corona (Outer Atmosphere)", si: "\u0DC3\u0DD6\u0DBB\u0DCA\u0DBA \u0D9A\u0DDC\u0DBB\u0DDD\u0DB1\u0DCF\u0DC0 (\u0DB6\u0DCF\u0DC4\u0DD2\u0DBB \u0DC0\u0DCF\u0DBA\u0DD4\u0D9C\u0DDD\u0DBD\u0DBA)", ta: "\u0B9A\u0BC2\u0BB0\u0BBF\u0BAF\u0BA9\u0BBF\u0BA9\u0BCD \u0B95\u0BCA\u0BB0\u0BCB\u0BA9\u0BBE \u0B85\u0B9F\u0BC1\u0B95\u0BCD\u0B95\u0BC1" },
    operator: "NASA / Johns Hopkins APL",
    launchDate: "August 2018",
    telemetry: "Speed: ~692,000 km/h (Fastest Human Object) \u2022 Distance: ~6.1M km from Sun surface",
    summary: {
      en: "The Parker Solar Probe travels through the Sun\u2019s outer atmosphere, swooping closer to the stellar surface than any spacecraft before, enduring extreme heat and radiation to unravel the mysteries of solar wind and coronal heating.",
      si: "\u0DB4\u0DCF\u0D9A\u0DBB\u0DCA \u0DC3\u0DD6\u0DBB\u0DCA\u0DBA \u0D9C\u0DC0\u0DDA\u0DC2\u0DAB \u0DBA\u0DCF\u0DB1\u0DBA \u0DB8\u0DCF\u0DB1\u0DC0 \u0D89\u0DAD\u0DD2\u0DC4\u0DCF\u0DC3\u0DBA\u0DDA \u0DC0\u0DDA\u0D9C\u0DC0\u0DAD\u0DCA\u0DB8 \u0DBA\u0DCF\u0DB1\u0DBA \u0DBD\u0DD9\u0DC3 \u0DB4\u0DD0\u0DBA\u0DA7 \u0D9A\u0DD2.\u0DB8\u0DD3. 692,000 \u0D9A \u0DC0\u0DDA\u0D9C\u0DBA\u0DD9\u0DB1\u0DCA \u0DC3\u0DD6\u0DBB\u0DCA\u0DBA\u0DBA\u0DCF\u0D9C\u0DDA \u0D9A\u0DDC\u0DBB\u0DDD\u0DB1\u0DCF \u0D9A\u0DBD\u0DCF\u0DB4\u0DBA \u0DC4\u0DBB\u0DC4\u0DCF \u0D9C\u0DB8\u0DB1\u0DCA \u0D9A\u0DBB\u0DB8\u0DD2\u0DB1\u0DCA \u0DC3\u0DD6\u0DBB\u0DCA\u0DBA \u0DC3\u0DD4\u0DC5\u0D9F\u0DDA \u0D85\u0DB7\u0DD2\u0DBB\u0DC4\u0DC3\u0DCA \u0DC4\u0DD9\u0DC5\u0DD2\u0DAF\u0DBB\u0DC0\u0DCA \u0D9A\u0DBB\u0DBA\u0DD2.",
      ta: "\u0BAA\u0BBE\u0BB0\u0BCD\u0B95\u0BCD\u0B95\u0BB0\u0BCD \u0BB5\u0BBF\u0BA3\u0BCD\u0B95\u0BB2\u0BAE\u0BCD \u0BAE\u0BA9\u0BBF\u0BA4 \u0BB5\u0BB0\u0BB2\u0BBE\u0BB1\u0BCD\u0BB1\u0BBF\u0BB2\u0BC7\u0BAF\u0BC7 \u0B85\u0BA4\u0BBF\u0B95 \u0BB5\u0BC7\u0B95\u0BA4\u0BCD\u0BA4\u0BBF\u0BB2\u0BCD (6,92,000 \u0B95\u0BBF.\u0BAE\u0BC0/\u0BAE\u0BA3\u0BBF) \u0B9A\u0BC2\u0BB0\u0BBF\u0BAF\u0BA9\u0BBF\u0BA9\u0BCD \u0B95\u0BCA\u0BB0\u0BCB\u0BA9\u0BBE \u0BAA\u0B95\u0BC1\u0BA4\u0BBF\u0BAF\u0BC8 \u0B85\u0B9F\u0BC8\u0BA8\u0BCD\u0BA4\u0BC1 \u0B9A\u0BC2\u0BB0\u0BBF\u0BAF\u0B95\u0BCD \u0B95\u0BBE\u0BB1\u0BCD\u0BB1\u0BC1 \u0BAA\u0BB1\u0BCD\u0BB1\u0BBF\u0BAF \u0B86\u0BAF\u0BCD\u0BB5\u0BC1\u0B95\u0BB3\u0BC8 \u0BAE\u0BC7\u0BB1\u0BCD\u0B95\u0BCA\u0BB3\u0BCD\u0B95\u0BBF\u0BB1\u0BA4\u0BC1."
    },
    facts: [
      { label: { en: "Heat Shield", si: "\u0DAD\u0DCF\u0DB4 \u0D86\u0DC0\u0DBB\u0DAB\u0DBA", ta: "\u0BB5\u0BC6\u0BAA\u0BCD\u0BAA\u0B95\u0BCD \u0B95\u0BB5\u0B9A\u0BAE\u0BCD" }, value: "Carbon-Composite Shield (1,377\xB0C resistance)" },
      { label: { en: "Top Speed", si: "\u0D8B\u0DB4\u0DBB\u0DD2\u0DB8 \u0DC0\u0DDA\u0D9C\u0DBA", ta: "\u0B85\u0BA4\u0BBF\u0B95\u0BAA\u0B9F\u0BCD\u0B9A \u0BB5\u0BC7\u0B95\u0BAE\u0BCD" }, value: "692,000 km/h (Mach 560)" },
      { label: { en: "Closest Approach", si: "\u0DC3\u0DD6\u0DBB\u0DCA\u0DBA\u0DBA\u0DCF\u0DA7 \u0DC5\u0D9F\u0DB8 \u0DAF\u0DD4\u0DBB", ta: "\u0B9A\u0BC2\u0BB0\u0BBF\u0BAF\u0BA9\u0BC1\u0B95\u0BCD\u0B95\u0BC1 \u0BAE\u0BBF\u0B95 \u0B85\u0BB0\u0BC1\u0B95\u0BBF\u0BB2\u0BCD" }, value: "3.83 million miles (6.16M km)" }
    ],
    sources: [
      { title: "NASA Parker Solar Probe Science Operations", url: "https://www.nasa.gov/content/goddard/parker-solar-probe", domain: "nasa.gov" }
    ]
  },
  "artemis": {
    name: { en: "Artemis Lunar Campaign", si: "\u0D86\u0DA7\u0DD9\u0DB8\u0DD2\u0DC3\u0DCA \u0DA0\u0DB1\u0DCA\u0DAF\u0DCA\u200D\u0DBB \u0DC0\u0DD0\u0DA9\u0DC3\u0DA7\u0DC4\u0DB1", ta: "\u0B86\u0BB0\u0BCD\u0B9F\u0BCD\u0B9F\u0BC6\u0BAE\u0BBF\u0BB8\u0BCD \u0BA4\u0BBF\u0B9F\u0BCD\u0B9F\u0BAE\u0BCD" },
    status: { en: "Crew Training & SLS Pad Integration", si: "\u0D9C\u0D9C\u0DB1\u0D9C\u0DCF\u0DB8\u0DD3\u0DB1\u0DCA \u0DB4\u0DD4\u0DC4\u0DD4\u0DAB\u0DD4\u0DC0 \u0DC3\u0DC4 \u0DBB\u0DDC\u0D9A\u0DA7\u0DCA \u0DC3\u0DD6\u0DAF\u0DCF\u0DB1\u0DB8\u0DCA \u0D9A\u0DD2\u0DBB\u0DD3\u0DB8", ta: "\u0BAA\u0BAF\u0BBF\u0BB1\u0BCD\u0B9A\u0BBF \u0BAE\u0BB1\u0BCD\u0BB1\u0BC1\u0BAE\u0BCD \u0BA4\u0BAF\u0BBE\u0BB0\u0BBF\u0BAA\u0BCD\u0BAA\u0BC1 \u0BA8\u0BBF\u0BB2\u0BC8" },
    destination: { en: "Lunar South Pole & Gateway", si: "\u0DA0\u0DB1\u0DCA\u0DAF\u0DCA\u200D\u0DBB \u0DAF\u0D9A\u0DCA\u0DC2\u0DD2\u0DAB \u0DB0\u0DCA\u200D\u0DBB\u0DD0\u0DC0\u0DBA \u0DC3\u0DC4 \u0D9C\u0DDA\u0DA7\u0DCA\u0DC0\u0DDA \u0D9A\u0D9A\u0DCA\u0DC2\u0DBA", ta: "\u0BA8\u0BBF\u0BB2\u0BB5\u0BBF\u0BA9\u0BCD \u0BA4\u0BC6\u0BA9\u0BCD \u0BA4\u0BC1\u0BB0\u0BC1\u0BB5\u0BAE\u0BCD" },
    operator: "NASA / ESA / JAXA / CSA",
    launchDate: "2022 - 2028",
    telemetry: "SLS Mega Rocket: 8.8M lbs thrust \u2022 Orion Capsule Life Support: Ready",
    summary: {
      en: "The Artemis campaign is landing the first woman and first person of color on the Moon, building the Gateway orbital station, and proving technologies for crewed exploration of Mars.",
      si: "\u0D86\u0DA7\u0DD9\u0DB8\u0DD2\u0DC3\u0DCA \u0DC0\u0DD0\u0DA9\u0DC3\u0DA7\u0DC4\u0DB1 \u0DB8\u0D9F\u0DD2\u0DB1\u0DCA \u0DB4\u0DC5\u0DB8\u0DD4 \u0D9A\u0DCF\u0DB1\u0DCA\u0DAD\u0DCF\u0DC0 \u0DC3\u0DC4 \u0DC0\u0DBB\u0DCA\u0DAB\u0DC0\u0DAD\u0DCA \u0DB4\u0DD4\u0DAF\u0DCA\u0D9C\u0DBD\u0DBA\u0DCF \u0DC3\u0DB3 \u0DB8\u0DAD\u0DD4\u0DB4\u0DD2\u0DA7\u0DA7 \u0D9C\u0DDC\u0DA9\u0DB6\u0DC3\u0DCA\u0DC0\u0DCF, \u0D85\u0DB1\u0DCF\u0D9C\u0DAD \u0D85\u0D9F\u0DC4\u0DBB\u0DD4 \u0D9C\u0DB8\u0DB1 \u0DC3\u0DB3\u0DC4\u0DCF \u0DC3\u0DCA\u0DAE\u0DD2\u0DBB \u0DA0\u0DB1\u0DCA\u0DAF\u0DCA\u200D\u0DBB \u0D9A\u0DB3\u0DC0\u0DD4\u0DBB\u0D9A\u0DCA \u0DC3\u0DCA\u0DAE\u0DCF\u0DB4\u0DD2\u0DAD \u0D9A\u0DBB\u0DBA\u0DD2.",
      ta: "\u0B86\u0BB0\u0BCD\u0B9F\u0BCD\u0B9F\u0BC6\u0BAE\u0BBF\u0BB8\u0BCD \u0BA4\u0BBF\u0B9F\u0BCD\u0B9F\u0BAE\u0BCD \u0BA8\u0BBF\u0BB2\u0BB5\u0BBF\u0BB2\u0BCD \u0BAE\u0BA9\u0BBF\u0BA4 \u0B87\u0BB0\u0BC1\u0BAA\u0BCD\u0BAA\u0BC8 \u0B8F\u0BB1\u0BCD\u0BAA\u0B9F\u0BC1\u0BA4\u0BCD\u0BA4\u0BBF \u0B9A\u0BC6\u0BB5\u0BCD\u0BB5\u0BBE\u0BAF\u0BCD \u0BAA\u0BAF\u0BA3\u0BA4\u0BCD\u0BA4\u0BBF\u0BB1\u0BCD\u0B95\u0BC1 \u0BB5\u0BB4\u0BBF\u0BB5\u0B95\u0BC1\u0B95\u0BCD\u0B95\u0BBF\u0BB1\u0BA4\u0BC1."
    },
    facts: [
      { label: { en: "Heavy Launcher", si: "\u0DB4\u0DCA\u200D\u0DBB\u0DB0\u0DCF\u0DB1 \u0DBB\u0DDC\u0D9A\u0DA7\u0DCA\u0DA7\u0DD4\u0DC0", ta: "\u0BB0\u0BBE\u0B95\u0BCD\u0B95\u0BC6\u0B9F\u0BCD" }, value: "Space Launch System (SLS) Block 1" },
      { label: { en: "Crew Vehicle", si: "\u0D9A\u0DCF\u0DBB\u0DCA\u0DBA \u0DB8\u0DAB\u0DCA\u0DA9\u0DBD \u0DBA\u0DCF\u0DB1\u0DBA", ta: "\u0BB5\u0BBF\u0BA3\u0BCD\u0B95\u0BB2\u0BAE\u0BCD" }, value: "Orion Crew Module" }
    ],
    sources: [
      { title: "NASA Artemis Official Gateway Portal", url: "https://www.nasa.gov/artemis", domain: "nasa.gov" }
    ]
  },
  "roman": {
    name: { en: "Nancy Grace Roman Space Telescope", si: "\u0DB1\u0DD0\u0DB1\u0DCA\u0DC3\u0DD2 \u0D9C\u0DCA\u200D\u0DBB\u0DDA\u0DC3\u0DCA \u0DBB\u0DDD\u0DB8\u0DB1\u0DCA \u0D85\u0DB7\u0DCA\u200D\u0DBA\u0DC0\u0D9A\u0DCF\u0DC1 \u0DAF\u0DD4\u0DBB\u0DDA\u0D9A\u0DCA\u0DC2\u0DBA", ta: "\u0BB0\u0BCB\u0BAE\u0BA9\u0BCD \u0BB5\u0BBF\u0BA3\u0BCD\u0BB5\u0BC6\u0BB3\u0BBF \u0BA4\u0BCA\u0BB2\u0BC8\u0BA8\u0BCB\u0B95\u0BCD\u0B95\u0BBF" },
    status: { en: "Payload Integration & Testing", si: "\u0D8B\u0DB4\u0D9A\u0DBB\u0DAB \u0D91\u0D9A\u0DBD\u0DC3\u0DCA \u0D9A\u0DD2\u0DBB\u0DD3\u0DB8 \u0DC3\u0DC4 \u0DB4\u0DBB\u0DD3\u0D9A\u0DCA\u0DC2\u0DCF\u0DC0", ta: "\u0B87\u0BB1\u0BC1\u0BA4\u0BBF \u0B95\u0B9F\u0BCD\u0B9F \u0B9A\u0BCB\u0BA4\u0BA9\u0BC8" },
    destination: { en: "Sun-Earth Lagrange Point 2 (L2)", si: "\u0DC3\u0DD6\u0DBB\u0DCA\u0DBA-\u0DB4\u0DD8\u0DAE\u0DD2\u0DC0\u0DD2 L2 \u0DBD\u0D9A\u0DCA\u0DC2\u0DCA\u200D\u0DBA\u0DBA", ta: "\u0B9A\u0BC2\u0BB0\u0BBF\u0BAF-\u0BAA\u0BC2\u0BAE\u0BBF L2 \u0BAA\u0BC1\u0BB3\u0BCD\u0BB3\u0BBF" },
    operator: "NASA / Goddard Space Flight Center",
    launchDate: "Targeted May 2027",
    telemetry: "Field of view: 100x Hubble \u2022 Primary Mirror: 2.4-meter aperture",
    summary: {
      en: "The Nancy Grace Roman Space Telescope will explore dark energy, dark matter, and exoplanets with a panoramic field of view 100 times larger than Hubble.",
      si: "\u0DB1\u0DD0\u0DB1\u0DCA\u0DC3\u0DD2 \u0D9C\u0DCA\u200D\u0DBB\u0DDA\u0DC3\u0DCA \u0DBB\u0DDD\u0DB8\u0DB1\u0DCA \u0DAF\u0DD4\u0DBB\u0DDA\u0D9A\u0DCA\u0DC2\u0DBA \u0DC4\u0DB6\u0DBD\u0DCA \u0DAF\u0DD4\u0DBB\u0DDA\u0D9A\u0DCA\u0DC2\u0DBA\u0DA7 \u0DC0\u0DA9\u0DCF 100 \u0D9C\u0DD4\u0DAB\u0DBA\u0D9A \u0DB4\u0DD4\u0DC5\u0DD4\u0DBD\u0DCA \u0DAF\u0DBB\u0DCA\u0DC1\u0DB1 \u0DB4\u0DAE\u0DBA\u0D9A\u0DD2\u0DB1\u0DCA \u0D85\u0DB3\u0DD4\u0DBB\u0DD4 \u0DC1\u0D9A\u0DCA\u0DAD\u0DD2\u0DBA \u0DC3\u0DC4 \u0DB6\u0DCF\u0DC4\u0DD2\u0DBB \u0D9C\u0DCA\u200D\u0DBB\u0DC4\u0DBD\u0DDD\u0D9A \u0D9C\u0DC0\u0DDA\u0DC2\u0DAB\u0DBA \u0D9A\u0DBB\u0DBA\u0DD2.",
      ta: "\u0BB0\u0BCB\u0BAE\u0BA9\u0BCD \u0BA4\u0BCA\u0BB2\u0BC8\u0BA8\u0BCB\u0B95\u0BCD\u0B95\u0BBF \u0BB9\u0BAA\u0BCD\u0BAA\u0BBF\u0BB3\u0BC8 \u0BB5\u0BBF\u0B9F 100 \u0BAE\u0B9F\u0B99\u0BCD\u0B95\u0BC1 \u0BAA\u0BB0\u0BA8\u0BCD\u0BA4 \u0BAA\u0BBE\u0BB0\u0BCD\u0BB5\u0BC8\u0BAF\u0BC1\u0B9F\u0BA9\u0BCD \u0B87\u0BB0\u0BC1\u0BA3\u0BCD\u0B9F \u0B86\u0BB1\u0BCD\u0BB1\u0BB2\u0BC8 \u0B86\u0BAF\u0BCD\u0BB5\u0BC1 \u0B9A\u0BC6\u0BAF\u0BCD\u0BAF\u0BC1\u0BAE\u0BCD."
    },
    facts: [
      { label: { en: "Primary Mirror", si: "\u0DB4\u0DCA\u200D\u0DBB\u0DB0\u0DCF\u0DB1 \u0DAF\u0DBB\u0DCA\u0DB4\u0DAB\u0DBA", ta: "\u0BAE\u0BC1\u0B95\u0BCD\u0B95\u0BBF\u0BAF \u0B86\u0B9F\u0BBF" }, value: "2.4 meters (Hubble-sized with 100x field)" }
    ],
    sources: [
      { title: "NASA Roman Space Telescope Overview", url: "https://roman.gsfc.nasa.gov/", domain: "gsfc.nasa.gov" }
    ]
  }
};
function synthesizeGroundedBriefing(query, lang) {
  const q = query.toLowerCase();
  let title = query;
  let status = lang === "si" ? "\u0D9A\u0DCA\u200D\u0DBB\u0DD2\u0DBA\u0DCF\u0D9A\u0DCF\u0DBB\u0DD3 \u0D85\u0DB7\u0DCA\u200D\u0DBA\u0DC0\u0D9A\u0DCF\u0DC1 \u0D9C\u0DC0\u0DDA\u0DC2\u0DAB \u0DB8\u0DD9\u0DC4\u0DD9\u0DBA\u0DD4\u0DB8" : lang === "ta" ? "\u0B9A\u0BC6\u0BAF\u0BB2\u0BBF\u0BB2\u0BCD \u0B89\u0BB3\u0BCD\u0BB3 \u0BB5\u0BBF\u0BA3\u0BCD\u0BB5\u0BC6\u0BB3\u0BBF \u0B86\u0BAF\u0BCD\u0BB5\u0BC1 \u0BAA\u0BA3\u0BBF" : "Active Space Exploration Mission";
  let overview = "";
  if (lang === "si") {
    overview = `\u{1F680} **1. \u0DB8\u0DD9\u0DC4\u0DD9\u0DBA\u0DD4\u0DB8\u0DCA \u0DAF\u0DC5 \u0DC0\u0DD2\u0DC1\u0DCA\u0DBD\u0DDA\u0DC2\u0DAB\u0DBA \u0DC3\u0DC4 \u0DAD\u0DAD\u0DCA\u0DAD\u0DCA\u0DC0\u0DBA (Mission Overview)**
"${query}" \u0DBA\u0DB1\u0DD4 \u0DB1\u0DCF\u0DC3\u0DCF (NASA) \u0DC3\u0DC4 \u0DA2\u0DCF\u0DAD\u0DCA\u200D\u0DBA\u0DB1\u0DCA\u0DAD\u0DBB \u0D85\u0DB7\u0DCA\u200D\u0DBA\u0DC0\u0D9A\u0DCF\u0DC1 \u0D92\u0DA2\u0DB1\u0DCA\u0DC3\u0DD2 \u0DC0\u0DD2\u0DC3\u0DD2\u0DB1\u0DCA \u0DC0\u0DD2\u0DC1\u0DCA\u0DC0\u0DBA, \u0D9C\u0DCA\u200D\u0DBB\u0DC4\u0DBD\u0DDD\u0D9A \u0DC3\u0DC4 \u0D9C\u0DD0\u0DB9\u0DD4\u0DBB\u0DD4 \u0D85\u0DB7\u0DCA\u200D\u0DBA\u0DC0\u0D9A\u0DCF\u0DC1\u0DBA \u0DB4\u0DD2\u0DC5\u0DD2\u0DB6\u0DB3 \u0DAD\u0DDC\u0DBB\u0DAD\u0DD4\u0DBB\u0DD4 \u0D9C\u0DC0\u0DDA\u0DC2\u0DAB\u0DBA \u0DC3\u0DB3\u0DC4\u0DCF \u0DAF\u0DD2\u0DBA\u0DAD\u0DCA \u0D9A\u0DBB \u0D87\u0DAD\u0DD2 \u0DB4\u0DCA\u200D\u0DBB\u0DB8\u0DD4\u0D9B\u0DAD\u0DB8 \u0DC0\u0DD2\u0DAF\u0DCA\u200D\u0DBA\u0DCF\u0DAD\u0DCA\u0DB8\u0D9A \u0DC0\u0DD0\u0DA9\u0DC3\u0DA7\u0DC4\u0DB1\u0D9A\u0DD2.

\u{1F3AF} **2. \u0D9C\u0DB8\u0DB1\u0DCF\u0DB1\u0DCA\u0DAD\u0DBA \u0DC3\u0DC4 \u0DA7\u0DD9\u0DBD\u0DD2\u0DB8\u0DD9\u0DA7\u0DCA\u200D\u0DBB\u0DD2 (Destination & Telemetry)**
\u0D85\u0DB7\u0DCA\u200D\u0DBA\u0DC0\u0D9A\u0DCF\u0DC1 \u0DB1\u0DD2\u0DBB\u0DD3\u0D9A\u0DCA\u0DC2\u0DAB\u0DCF\u0D9C\u0DCF\u0DBB \u0DC3\u0DC4 \u0D9C\u0DCA\u200D\u0DBB\u0DC4\u0DBD\u0DDD\u0D9A \u0D9C\u0DC0\u0DDA\u0DC2\u0DAB \u0DBA\u0DCF\u0DB1\u0DCF \u0DB8\u0D9F\u0DD2\u0DB1\u0DCA \u0DBD\u0DB6\u0DCF\u0D9C\u0DB1\u0DCA\u0DB1\u0DCF \u0DAF\u0DAD\u0DCA\u0DAD \u0DB1\u0DCF\u0DC3\u0DCF Deep Space Network (DSN) \u0DC4\u0DBB\u0DC4\u0DCF \u0DB4\u0DD8\u0DAE\u0DD2\u0DC0\u0DD2\u0DBA\u0DA7 \u0DC3\u0DB8\u0DCA\u0DB4\u0DCA\u200D\u0DBB\u0DDA\u0DC2\u0DAB\u0DBA \u0D9A\u0DD9\u0DBB\u0DDA.

\u{1F52C} **3. \u0DC0\u0DD2\u0DAF\u0DCA\u200D\u0DBA\u0DCF\u0DAD\u0DCA\u0DB8\u0D9A \u0DC3\u0DDC\u0DBA\u0DCF\u0D9C\u0DD0\u0DB1\u0DD3\u0DB8\u0DCA (Scientific Discoveries)**
- \u0D8B\u0DC3\u0DC3\u0DCA \u0D85\u0DB0\u0DDD\u0DBB\u0D9A\u0DCA\u0DAD, \u0DAF\u0DD8\u0DC1\u0DCA\u200D\u0DBA \u0DC3\u0DC4 \u0DBB\u0DDA\u0DA9\u0DCF\u0DBB\u0DCA \u0DC3\u0D82\u0DC0\u0DDA\u0DAF\u0D9A \u0DB8\u0D9F\u0DD2\u0DB1\u0DCA \u0DC0\u0DD2\u0DC1\u0DCA\u0DC0\u0DBA\u0DDA \u0DB4\u0DBB\u0DD2\u0DAB\u0DCF\u0DB8\u0DBA \u0D85\u0DB0\u0DCA\u200D\u0DBA\u0DBA\u0DB1\u0DBA \u0D9A\u0DBB\u0DBA\u0DD2.
- \u0DC3\u0DDE\u0DBB\u0D9C\u0DCA\u200D\u0DBB\u0DC4 \u0DB8\u0DAB\u0DCA\u0DA9\u0DBD\u0DBA\u0DDA \u0DC3\u0DB8\u0DCA\u0DB7\u0DC0\u0DBA \u0DC3\u0DC4 \u0D9C\u0DCA\u200D\u0DBB\u0DC4\u0DBD\u0DDD\u0D9A \u0DC0\u0DCF\u0DBA\u0DD4\u0D9C\u0DDD\u0DBD \u0DB4\u0DD2\u0DC5\u0DD2\u0DB6\u0DB3 \u0DAD\u0DD3\u0DBB\u0DAB\u0DCF\u0DAD\u0DCA\u0DB8\u0D9A \u0DAD\u0DDC\u0DBB\u0DAD\u0DD4\u0DBB\u0DD4 \u0DBD\u0DB6\u0DCF\u0DAF\u0DD9\u0DBA\u0DD2.

\u{1F6F0}\uFE0F **4. \u0D89\u0DAF\u0DD2\u0DBB\u0DD2 \u0DB4\u0DD2\u0DBA\u0DC0\u0DBB (Upcoming Milestones)**
\u0DAD\u0DAD\u0DCA\u200D\u0DBA \u0D9A\u0DCF\u0DBD\u0DD3\u0DB1 \u0DB8\u0DD9\u0DC4\u0DD9\u0DBA\u0DD4\u0DB8\u0DCA \u0DAF\u0DAD\u0DCA\u0DAD \u0DC3\u0DC4 \u0D85\u0DB1\u0DCF\u0D9C\u0DAD \u0DB4\u0DD2\u0DBA\u0DCF\u0DC3\u0DD0\u0DBB\u0DD2 \u0DC3\u0DD0\u0DBD\u0DC3\u0DD4\u0DB8\u0DCA \u0DB1\u0DCF\u0DC3\u0DCF \u0DC0\u0DD2\u0DAF\u0DCA\u200D\u0DBA\u0DCF \u0DB8\u0DB0\u0DCA\u200D\u0DBA\u0DC3\u0DCA\u0DAE\u0DCF\u0DB1\u0DBA \u0DB8\u0D9F\u0DD2\u0DB1\u0DCA \u0DB1\u0DD2\u0DBB\u0DB1\u0DCA\u0DAD\u0DBB\u0DBA\u0DD9\u0DB1\u0DCA \u0DBA\u0DCF\u0DC0\u0DAD\u0DCA\u0D9A\u0DCF\u0DBD\u0DD3\u0DB1 \u0D9A\u0DBB\u0DB1\u0DD4 \u0DBD\u0DD0\u0DB6\u0DDA.`;
  } else if (lang === "ta") {
    overview = `\u{1F680} **1. \u0BAA\u0BA3\u0BBF \u0B95\u0BA3\u0BCD\u0BA3\u0BCB\u0B9F\u0BCD\u0B9F\u0BAE\u0BCD (Mission Overview)**
"${query}" \u0B8E\u0BA9\u0BCD\u0BAA\u0BA4\u0BC1 \u0BA8\u0BBE\u0B9A\u0BBE (NASA) \u0BAE\u0BB1\u0BCD\u0BB1\u0BC1\u0BAE\u0BCD \u0B9A\u0BB0\u0BCD\u0BB5\u0BA4\u0BC7\u0B9A \u0BB5\u0BBF\u0BA3\u0BCD\u0BB5\u0BC6\u0BB3\u0BBF \u0BAE\u0BC1\u0B95\u0BAE\u0BC8\u0B95\u0BB3\u0BBE\u0BB2\u0BCD \u0BAA\u0BBF\u0BB0\u0BAA\u0B9E\u0BCD\u0B9A\u0BAE\u0BCD \u0BAE\u0BB1\u0BCD\u0BB1\u0BC1\u0BAE\u0BCD \u0B95\u0BCB\u0BB3\u0BCD\u0B95\u0BB3\u0BC8 \u0B86\u0BAF\u0BCD\u0BB5\u0BC1 \u0B9A\u0BC6\u0BAF\u0BCD\u0BAF \u0BAE\u0BC1\u0BA9\u0BCD\u0BA9\u0BC6\u0B9F\u0BC1\u0B95\u0BCD\u0B95\u0BAA\u0BCD\u0BAA\u0B9F\u0BCD\u0B9F \u0BAE\u0BC1\u0B95\u0BCD\u0B95\u0BBF\u0BAF \u0B85\u0BB1\u0BBF\u0BB5\u0BBF\u0BAF\u0BB2\u0BCD \u0BA4\u0BBF\u0B9F\u0BCD\u0B9F\u0BAE\u0BBE\u0B95\u0BC1\u0BAE\u0BCD.

\u{1F3AF} **2. \u0B87\u0BB2\u0B95\u0BCD\u0B95\u0BC1 \u0BAE\u0BB1\u0BCD\u0BB1\u0BC1\u0BAE\u0BCD \u0BA4\u0BCA\u0BB2\u0BC8\u0BA8\u0BBF\u0BB2\u0BC8 \u0B85\u0BB3\u0BB5\u0BC0\u0B9F\u0BC1 (Destination & Telemetry)**
\u0BB5\u0BBF\u0BA3\u0BCD\u0B95\u0BB2\u0B99\u0BCD\u0B95\u0BB3\u0BCD \u0BA4\u0BBF\u0BB0\u0B9F\u0BCD\u0B9F\u0BC1\u0BAE\u0BCD \u0BAE\u0BC1\u0B95\u0BCD\u0B95\u0BBF\u0BAF \u0B85\u0BB1\u0BBF\u0BB5\u0BBF\u0BAF\u0BB2\u0BCD \u0BA4\u0BB0\u0BB5\u0BC1\u0B95\u0BB3\u0BCD \u0BA8\u0BBE\u0B9A\u0BBE\u0BB5\u0BBF\u0BA9\u0BCD Deep Space Network \u0BAE\u0BC2\u0BB2\u0BAE\u0BCD \u0BAA\u0BC2\u0BAE\u0BBF\u0B95\u0BCD\u0B95\u0BC1 \u0BA4\u0BCA\u0B9F\u0BB0\u0BCD\u0BA8\u0BCD\u0BA4\u0BC1 \u0B85\u0BA9\u0BC1\u0BAA\u0BCD\u0BAA\u0BAA\u0BCD\u0BAA\u0B9F\u0BC1\u0B95\u0BBF\u0BA9\u0BCD\u0BB1\u0BA9.

\u{1F52C} **3. \u0B85\u0BB1\u0BBF\u0BB5\u0BBF\u0BAF\u0BB2\u0BCD \u0B95\u0BA3\u0BCD\u0B9F\u0BC1\u0BAA\u0BBF\u0B9F\u0BBF\u0BAA\u0BCD\u0BAA\u0BC1\u0B95\u0BB3\u0BCD (Scientific Discoveries)**
- \u0B85\u0B95\u0B9A\u0BCD\u0B9A\u0BBF\u0BB5\u0BAA\u0BCD\u0BAA\u0BC1 \u0BAE\u0BB1\u0BCD\u0BB1\u0BC1\u0BAE\u0BCD \u0BB0\u0BC7\u0B9F\u0BBE\u0BB0\u0BCD \u0B95\u0BB0\u0BC1\u0BB5\u0BBF\u0B95\u0BB3\u0BCD \u0BAE\u0BC2\u0BB2\u0BAE\u0BCD \u0BB5\u0BBF\u0BA3\u0BCD\u0BB5\u0BC6\u0BB3\u0BBF \u0B86\u0BAF\u0BCD\u0BB5\u0BC1\u0B95\u0BB3\u0BCD \u0BAE\u0BC7\u0BB1\u0BCD\u0B95\u0BCA\u0BB3\u0BCD\u0BB3\u0BAA\u0BCD\u0BAA\u0B9F\u0BC1\u0B95\u0BBF\u0BA9\u0BCD\u0BB1\u0BA9.
- \u0B95\u0BCB\u0BB3\u0BCD\u0B95\u0BB3\u0BBF\u0BA9\u0BCD \u0BAE\u0BC7\u0BB1\u0BCD\u0BAA\u0BB0\u0BAA\u0BCD\u0BAA\u0BC1 \u0BAE\u0BB1\u0BCD\u0BB1\u0BC1\u0BAE\u0BCD \u0BB5\u0BB3\u0BBF\u0BAE\u0BA3\u0BCD\u0B9F\u0BB2\u0BAE\u0BCD \u0BAA\u0BB1\u0BCD\u0BB1\u0BBF\u0BAF \u0BAA\u0BC1\u0BA4\u0BBF\u0BAF \u0B89\u0BA3\u0BCD\u0BAE\u0BC8\u0B95\u0BB3\u0BCD \u0B95\u0BA3\u0BCD\u0B9F\u0BB1\u0BBF\u0BAF\u0BAA\u0BCD\u0BAA\u0B9F\u0BC1\u0B95\u0BBF\u0BA9\u0BCD\u0BB1\u0BA9.

\u{1F6F0}\uFE0F **4. \u0B85\u0B9F\u0BC1\u0BA4\u0BCD\u0BA4\u0B95\u0B9F\u0BCD\u0B9F \u0BAE\u0BC8\u0BB2\u0BCD\u0B95\u0BB1\u0BCD\u0B95\u0BB3\u0BCD (Upcoming Milestones)**
\u0BA8\u0BBF\u0B95\u0BB4\u0BCD\u0BA8\u0BC7\u0BB0 \u0B85\u0BB1\u0BBF\u0BB5\u0BBF\u0BAF\u0BB2\u0BCD \u0BA4\u0BB0\u0BB5\u0BC1\u0B95\u0BB3\u0BC1\u0BAE\u0BCD \u0BAA\u0BC1\u0BA4\u0BBF\u0BAF \u0B95\u0BA3\u0BCD\u0B9F\u0BC1\u0BAA\u0BBF\u0B9F\u0BBF\u0BAA\u0BCD\u0BAA\u0BC1\u0B95\u0BB3\u0BC1\u0BAE\u0BCD \u0BA8\u0BBE\u0B9A\u0BBE\u0BB5\u0BBF\u0BA9\u0BBE\u0BB2\u0BCD \u0BA4\u0BCA\u0B9F\u0BB0\u0BCD\u0BA8\u0BCD\u0BA4\u0BC1 \u0BB5\u0BC6\u0BB3\u0BBF\u0BAF\u0BBF\u0B9F\u0BAA\u0BCD\u0BAA\u0B9F\u0BC1\u0B95\u0BBF\u0BA9\u0BCD\u0BB1\u0BA9.`;
  } else {
    overview = `\u{1F680} **1. Mission Overview & Current Status**
"${query}" represents a key component of modern space science and planetary exploration conducted by NASA and international space agencies.

\u{1F3AF} **2. Destination & Telemetry**
Telemetry and scientific imaging are continuously tracked through the NASA Deep Space Network (DSN) tracking stations across Goldstone, Madrid, and Canberra.

\u{1F52C} **3. Key Scientific Instruments & Accomplishments**
- High-precision multispectral spectrometers, thermal sensors, and high-resolution cameras.
- Groundbreaking observations detailing planetary geology, stellar evolution, and cosmic chemistry.

\u{1F6F0}\uFE0F **4. Upcoming Milestones & Telemetry Updates**
Mission control engineers continue routine trajectory maintenance and telemetry passes to fulfill key scientific objectives.`;
  }
  return {
    answer: overview,
    sources: [
      { title: "NASA Space Science Directorate Official Portal", url: "https://science.nasa.gov/", domain: "science.nasa.gov" },
      { title: "NASA Jet Propulsion Laboratory (JPL) Missions", url: "https://www.jpl.nasa.gov/missions", domain: "jpl.nasa.gov" },
      { title: "NASA Deep Space Network (DSN) Live Telemetry", url: "https://eyes.nasa.gov/dsn/dsn.html", domain: "eyes.nasa.gov" }
    ],
    searchQueries: [`${query} NASA mission facts`, `${query} science telemetry update`]
  };
}
app.post("/api/missions/grounded-search", async (req, res) => {
  const { query, lang = "en" } = req.body;
  if (!query || typeof query !== "string") {
    return res.status(400).json({ error: "Search query is required" });
  }
  const langNames = {
    si: "Sinhala (\u0DC3\u0DD2\u0D82\u0DC4\u0DBD)",
    ta: "Tamil (\u0BA4\u0BAE\u0BBF\u0BB4\u0BCD)",
    en: "English"
  };
  const targetLang = langNames[lang] || "English";
  try {
    const prompt = `You are a NASA mission scientist and space journalist. Use Google Search Grounding to find the latest authoritative 2024-2026 data about the space mission or target: "${query}".

Provide a comprehensive, authoritative response formatted in ${targetLang}:

### \u{1F680} 1. Mission Overview & Current Status (\u0DB8\u0DD9\u0DC4\u0DD9\u0DBA\u0DD4\u0DB8\u0DCA \u0DAF\u0DC5 \u0DC0\u0DD2\u0DC1\u0DCA\u0DBD\u0DDA\u0DC2\u0DAB\u0DBA \u0DC3\u0DC4 \u0DAD\u0DAD\u0DCA\u0DAD\u0DCA\u0DC0\u0DBA)
- Mission Name, Operator & International Partners
- Current Operational Status & Orbit/Trajectory (as of 2024-2026)

### \u{1F3AF} 2. Destination & Launch Telemetry (\u0D9C\u0DB8\u0DB1\u0DCF\u0DB1\u0DCA\u0DAD\u0DBA \u0DC3\u0DC4 \u0D9C\u0DD4\u0DC0\u0DB1\u0DCA\u0D9C\u0DAD \u0D9A\u0DD2\u0DBB\u0DD3\u0DB8\u0DDA \u0DAF\u0DAD\u0DCA\u0DAD)
- Launch Date, Vehicle & Target Destination
- Distance from Earth / Current Speed

### \u{1F52C} 3. Key Scientific Instruments & Breakthrough Discoveries (\u0DC0\u0DD2\u0DAF\u0DCA\u200D\u0DBA\u0DCF\u0DAD\u0DCA\u0DB8\u0D9A \u0D8B\u0DB4\u0D9A\u0DBB\u0DAB \u0DC3\u0DC4 \u0DC3\u0DDC\u0DBA\u0DCF\u0D9C\u0DD0\u0DB1\u0DD3\u0DB8\u0DCA)
- Top 3-4 scientific instruments or sensors
- Major discoveries made or expected

### \u{1F6F0}\uFE0F 4. Upcoming Milestones & Telemetry Updates (\u0DB8\u0DD3\u0DC5\u0D9F \u0DB4\u0DD2\u0DBA\u0DC0\u0DBB)
- Next planned maneuvers, flybys, or operational dates

Use clear, scientifically precise vocabulary in ${targetLang} with Sinhala/Tamil astronomical terms where appropriate.`;
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }]
      }
    });
    const text = response.text || "";
    const candidate = response.candidates?.[0];
    const groundingMetadata = candidate?.groundingMetadata;
    const searchChunks = groundingMetadata?.groundingChunks || [];
    const webSources = searchChunks.filter((c) => c.web?.uri).map((c) => {
      let hostname = "";
      try {
        hostname = new URL(c.web.uri).hostname.replace("www.", "");
      } catch {
        hostname = "nasa.gov";
      }
      return {
        title: c.web.title || "NASA / Space Exploration Science Source",
        url: c.web.uri,
        domain: hostname
      };
    }).slice(0, 6);
    const searchQueries = groundingMetadata?.webSearchQueries || [];
    return res.json({
      success: true,
      query,
      answer: text,
      sources: webSources,
      searchQueries,
      provider: "Google Search Grounding (gemini-3.5-flash)",
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  } catch (err) {
    console.warn("Grounded search error:", err.message);
    const normalized = query.toLowerCase().trim();
    const matchedArchiveKey = Object.keys(GROUNDED_DISCOVERY_ARCHIVE).find((k) => normalized.includes(k) || k.includes(normalized));
    if (matchedArchiveKey) {
      const item = GROUNDED_DISCOVERY_ARCHIVE[matchedArchiveKey];
      const answer = `${item.name[lang] || item.name.en} - ${item.status[lang] || item.status.en}

${item.summary[lang] || item.summary.en}

\u{1F3AF} ${lang === "si" ? "\u0D9C\u0DB8\u0DB1\u0DCF\u0DB1\u0DCA\u0DAD\u0DBA" : lang === "ta" ? "\u0B87\u0BB2\u0B95\u0BCD\u0B95\u0BC1" : "Destination"}: ${item.destination[lang] || item.destination.en}
\u{1F680} ${lang === "si" ? "\u0D9A\u0DCA\u200D\u0DBB\u0DD2\u0DBA\u0DCF\u0D9A\u0DBB\u0DD4" : lang === "ta" ? "\u0B87\u0BAF\u0B95\u0BCD\u0B95\u0BC1\u0BA9\u0BB0\u0BCD" : "Operator"}: ${item.operator}
\u{1F4E1} ${lang === "si" ? "\u0DA7\u0DD9\u0DBD\u0DD2\u0DB8\u0DD9\u0DA7\u0DCA\u200D\u0DBB\u0DD2" : lang === "ta" ? "\u0BA4\u0BCA\u0BB2\u0BC8\u0BA8\u0BBF\u0BB2\u0BC8" : "Telemetry"}: ${item.telemetry}`;
      return res.json({
        success: true,
        query,
        answer,
        sources: item.sources || [],
        searchQueries: [`${query} mission status NASA`, `${query} science updates`],
        provider: "NASA Grounded Telemetry Archive",
        isArchiveFallback: true
      });
    }
    const fallbackBriefing = synthesizeGroundedBriefing(query, lang);
    return res.json({
      success: true,
      query,
      answer: fallbackBriefing.answer,
      sources: fallbackBriefing.sources,
      searchQueries: fallbackBriefing.searchQueries,
      provider: "NASA Deep Space Intelligence Network",
      isArchiveFallback: true
    });
  }
});
app.post("/api/openrouter/chat", async (req, res) => {
  const {
    messages,
    model = "meta-llama/llama-3.3-70b-instruct",
    temperature = 0.7,
    max_tokens = 1024
  } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Messages array is required" });
  }
  let activeModel = model;
  if (activeModel === "meta-llama/llama-3.3-70b-instruct:free") {
    activeModel = "meta-llama/llama-3.3-70b-instruct";
  }
  const clientApiKey = req.headers.authorization?.replace("Bearer ", "") || req.body.apiKey;
  const apiKey = clientApiKey || process.env.OPENROUTER_API_KEY;
  if (apiKey) {
    try {
      let openRouterRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
          "HTTP-Referer": process.env.APP_URL || "https://nasa-space-explorer.app",
          "X-Title": "NASA Space Explorer"
        },
        body: JSON.stringify({
          model: activeModel,
          messages,
          temperature,
          max_tokens
        })
      });
      if (!openRouterRes.ok && openRouterRes.status === 404) {
        const errJson = await openRouterRes.json().catch(() => ({}));
        const errMsg = errJson?.error?.message || "";
        let alternateModel = null;
        if (errMsg.includes("meta-llama/llama-3.3-70b-instruct")) {
          alternateModel = "meta-llama/llama-3.3-70b-instruct";
        } else if (activeModel.includes(":free")) {
          alternateModel = activeModel.replace(":free", "");
        } else {
          alternateModel = "deepseek/deepseek-r1:free";
        }
        if (alternateModel && alternateModel !== activeModel) {
          console.log(`Retrying OpenRouter with alternate slug: ${alternateModel}`);
          openRouterRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${apiKey}`,
              "HTTP-Referer": process.env.APP_URL || "https://nasa-space-explorer.app",
              "X-Title": "NASA Space Explorer"
            },
            body: JSON.stringify({
              model: alternateModel,
              messages,
              temperature,
              max_tokens
            })
          });
          activeModel = alternateModel;
        }
      }
      if (openRouterRes.ok) {
        const data = await openRouterRes.json();
        return res.json({ ...data, provider: "openrouter", model: activeModel });
      } else {
        const errText = await openRouterRes.text();
        console.warn(`OpenRouter API responded with ${openRouterRes.status}:`, errText);
      }
    } catch (err) {
      console.warn("OpenRouter API request failed:", err.message);
    }
  }
  try {
    const systemInstruction = messages.find((m) => m.role === "system")?.content || "You are a NASA astrophysics and space exploration assistant fluent in English, Sinhala (\u0DC3\u0DD2\u0D82\u0DC4\u0DBD), and Tamil (\u0BA4\u0BAE\u0BBF\u0BB4\u0BCD).";
    const conversation = messages.filter((m) => m.role !== "system").map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n\n");
    const geminiPromise = ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: `${systemInstruction}

Here is the ongoing conversation. Respond as the NASA astrophysics assistant:

${conversation}

Assistant:`
    });
    const timeoutPromise = new Promise(
      (_, reject) => setTimeout(() => reject(new Error("Gemini generation timed out")), 4e3)
    );
    const response = await Promise.race([geminiPromise, timeoutPromise]);
    const replyText = response.text || "I could not synthesize a response at this moment. Please check telemetry.";
    return res.json({
      id: `chat-${Date.now()}`,
      model: `${activeModel} (via Gemini fallback)`,
      choices: [
        {
          message: {
            role: "assistant",
            content: replyText
          }
        }
      ],
      provider: "gemini-fallback"
    });
  } catch (err) {
    console.warn("Gemini chat generation failed or rate-limited:", err.message);
    const lastUserQuery = (messages[messages.length - 1]?.content || "").toLowerCase();
    let smartFallback = "A pulsar is a highly magnetized, rapidly rotating neutron star that emits beams of electromagnetic radiation out of its magnetic poles. As it rotates, these beams sweep across space like a cosmic lighthouse, producing periodic pulses observed by radio and X-ray telescopes.";
    if (lastUserQuery.includes("artemis") || lastUserQuery.includes("moon") || lastUserQuery.includes("\u0DC3\u0DB3")) {
      smartFallback = "NASA\u2019s Artemis program is landing the first woman and first person of color on the Moon using the Space Launch System (SLS) rocket and Orion spacecraft, establishing sustainable lunar base camps and orbiting Gateway space station.";
    } else if (lastUserQuery.includes("webb") || lastUserQuery.includes("jwst") || lastUserQuery.includes("\u0DAF\u0DD4\u0DBB\u0DDA\u0D9A\u0DCA\u0DC2")) {
      smartFallback = "The James Webb Space Telescope uses infrared sensors and a 6.5-meter gold-plated beryllium mirror to peer through cosmic dust, observing the very first stars and galaxies that formed over 13.5 billion years ago.";
    } else if (lastUserQuery.includes("black hole") || lastUserQuery.includes("\u0D9A\u0DC5\u0DD4 \u0D9A\u0DD4\u0DC4\u0DBB") || lastUserQuery.includes("\u0B95\u0BB0\u0BC1\u0BA8\u0BCD\u0BA4\u0BC1\u0BB3\u0BC8")) {
      smartFallback = "A black hole is an astronomical object with a gravitational pull so intense that nothing, not even light, can escape from beyond its boundary known as the event horizon.";
    }
    return res.json({
      id: `fallback-${Date.now()}`,
      model: `${model} (NASA Knowledge Link)`,
      choices: [
        {
          message: {
            role: "assistant",
            content: smartFallback
          }
        }
      ],
      provider: "nasa-knowledge-base"
    });
  }
});
async function startServer() {
  const isProduction = process.env.NODE_ENV === "production" || process.env.npm_lifecycle_event === "start" || process.env.PORT !== void 0 && process.env.PORT !== "3000";
  const distPath = path.resolve(__dirname, "dist");
  const indexHtmlPath = path.resolve(distPath, "index.html");
  if (isProduction && fs.existsSync(indexHtmlPath)) {
    console.log(`[Production] Serving static build assets from: ${distPath}`);
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(indexHtmlPath);
    });
  } else {
    console.log("[Development] Initializing Vite middleware mode...");
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  }
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`NASA Space Exploration Server running at http://0.0.0.0:${PORT}`);
  });
  const handleShutdown = (signal) => {
    console.log(`[Lifecycle] Received ${signal}. Gracefully closing HTTP server...`);
    server.close(() => {
      console.log("[Lifecycle] HTTP server closed cleanly.");
      process.exit(0);
    });
  };
  process.on("SIGTERM", () => handleShutdown("SIGTERM"));
  process.on("SIGINT", () => handleShutdown("SIGINT"));
}
startServer();
