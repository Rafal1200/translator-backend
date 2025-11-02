// index.js
import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import OpenAI from "openai";

const app = express();
app.use(cors());

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

    const result = await client.audio.transcriptions.create({
      file: fs.createReadStream(f.path),
      model: "whisper-1"
    });

    // sprzątanie pliku tymczasowego
    fs.unlink(f.path, () => {});
    res.json({ text: result.text ?? "", language: result.language ?? "" });
  } catch (err) {
    console.error("TRANSCRIBE ERROR:", err);
    res.status(500).json({ error: "Transcription failed" });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`API on :${port}`));
