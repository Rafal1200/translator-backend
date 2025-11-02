import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";

import OpenAI from "openai";

const app = express();
app.use(cors());
const upload = multer({ dest: "uploads/" });

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ZDROWIE/TEST
app.get("/", (_req, res) => {
  res.json({ ok: true, msg: "translator-backend live" });
});

// TRANSKRYPCJA: multipart/form-data z polem "audio"
app.post("/api/transcribe", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No audio file" });

    const fileStream = fs.createReadStream(req.file.path);
    // Uwaga: model może się zmienić w czasie. Najczęściej używany był "whisper-1".
    const result = await client.audio.transcriptions.create({
      file: fileStream,
      model: "whisper-1"
    });

    // Sprzątanie pliku tymczasowego
    fs.unlink(req.file.path, () => {});
    res.json({ text: result.text ?? "" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Transcription failed" });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`API on :${port}`));
