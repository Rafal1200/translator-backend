// index.js
import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import OpenAI from "openai";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// zapisywanie plików tymczasowych
const upload = multer({ dest: "uploads/" });

// konfiguracja klienta OpenAI
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// healthcheck
app.get("/", (_req, res) => {
  res.json({ ok: true, msg: "translator-backend live" });
});

// === /api/transcribe ===
// przyjmuje 1 plik audio (dowolny format obsługiwany przez OpenAI)
app.post("/api/transcribe", upload.any(), async (req, res) => {
  try {
    const f = (req.files && req.files[0]) || null;
    if (!f) return res.status(400).json({ error: "No audio file" });

    // ustal rozszerzenie na podstawie mimetype
    const mime = (f.mimetype || "").toLowerCase();
    let ext = "";
    if (mime.includes("webm")) ext = "webm";
    else if (mime.includes("wav")) ext = "wav";
    else if (mime.includes("mp4") || mime.includes("m4a") || mime.includes("mpeg") || mime.includes("mpga"))
      ext = "mp4";
    else if (mime.includes("ogg") || mime.includes("oga")) ext = "ogg";
    else if (mime.includes("mp3")) ext = "mp3";
    else {
      const m = (f.originalname || "").match(/\.(\w+)$/);
      ext = m ? m[1] : "webm";
    }

    // zmiana nazwy pliku z odpowiednim rozszerzeniem
    const renamedPath = `${f.path}.${ext}`;
    fs.renameSync(f.path, renamedPath);

    const result = await client.audio.transcriptions.create({
      file: fs.createReadStream(renamedPath),
      model: "whisper-1"
    });

    fs.unlink(renamedPath, () => {});
    res.json({ text: result.text ?? "", language: result.language ?? "" });
  } catch (err) {
    console.error("TRANSCRIBE ERROR:", err);
    res.status(500).json({
      error: "Transcription failed",
      detail: err?.message || "Unknown error"
    });
  }
});

// === /api/translate ===
app.post("/api/translate", async (req, res) => {
  try {
    const { direction, text } = req.body || {};
    if (!text || !direction) {
      return res.status(400).json({ error: "Missing text/direction" });
    }

    const system =
      direction === "PL->ES"
        ? "Translate from Polish to Spanish. Return only the translation."
        : "Translate from Spanish to Polish. Return only the translation.";

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: text }
      ],
      temperature: 0.2
    });

    const translation =
      completion.choices?.[0]?.message?.content?.trim() || "";
    res.json({ translation });
  } catch (err) {
    console.error("TRANSLATE ERROR:", err);
    res.status(500).json({ error: "Translation failed" });
  }
});

// === /api/tts ===
app.post("/api/tts", async (req, res) => {
  try {
    const { text, voice = "alloy" } = req.body || {};
    if (!text) return res.status(400).json({ error: "Missing text" });

    const speech = await client.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice,
      input: text,
      format: "mp3"
    });

    const buffer = Buffer.from(await speech.arrayBuffer());
    res.setHeader("Content-Type", "audio/mpeg");
    res.send(buffer);
  } catch (err) {
    console.error("TTS ERROR:", err);
    res.status(500).json({ error: "TTS failed" });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`API on :${port}`));
