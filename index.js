// index.js
import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import OpenAI from "openai";

const app = express();
app.use(cors());
// JSON do endpointów translate/tts
app.use(express.json({ limit: "2mb" }));

// zapis plików tymczasowych
const upload = multer({ dest: "uploads/" });

// klient OpenAI z klucza w Render (Environment → OPENAI_API_KEY)
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// healthcheck (do szybkiego testu w przeglądarce)
app.get("/", (_req, res) => {
  res.json({ ok: true, msg: "translator-backend live" });
});

// === /api/transcribe ===
// Przyjmij JEDEN plik audio niezależnie od nazwy pola (file/audio) – prościej dla frontu
app.post("/api/transcribe", upload.any(), async (req, res) => {
  try {
    const f = (req.files && req.files[0]) || null;
    if (!f) return res.status(400).json({ error: "No audio file" });

    // Dodaj rozszerzenie, żeby OpenAI wiedziało, że to webm
    const renamedPath = f.path + ".webm";
    fs.renameSync(f.path, renamedPath);

    const result = await client.audio.transcriptions.create({
      file: fs.createReadStream(renamedPath),
      model: "whisper-1"
    });

    // Sprzątanie pliku tymczasowego
    fs.unlink(renamedPath, () => {});
    res.json({ text: result.text ?? "", language: result.language ?? "" });
  } catch (err) {
    console.error("TRANSCRIBE ERROR:", err);
    res.status(500).json({ error: "Transcription failed" });
  }
});

// === /api/translate ===
// body: { direction: "PL->ES" | "ES->PL", text: string }
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
// body: { text: string, voice?: string }
// Zwraca audio/mp3
app.post("/api/tts", async (req, res) => {
  try {
    const { text, voice = "alloy" } = req.body || {};
    if (!text) return res.status(400).json({ error: "Missing text" });

    const speech = await client.audio.speech.create({
      model: "gpt-4o-mini-tts", // alternatywnie: "tts-1"
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
