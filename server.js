import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import Twilio from "twilio";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

// Twilio client
const client = Twilio(
  process.env.TWILIO_SID,
  process.env.TWILIO_AUTH
);

// Render için gerekli
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Public klasör
app.use(express.static(path.join(__dirname, "public")));

// Panel route
app.get("/panel", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "panel.html"));
});

// Twilio: Gelen aramayı kontrol et
app.post("/call", (req, res) => {
  console.log("Twilio webhook geldi:", req.body);

  res.set("Content-Type", "text/xml");
  res.send(`
    <Response>
        <Say voice="alice">Alya sistemi çalışıyor.</Say>
    </Response>
  `);
});

// Panelden gelen istek → Arama başlatır
app.post("/call-customer", async (req, res) => {
  const { number } = req.body;

  console.log("Arama isteği alındı:", number);

  if (!number || number.length < 7) {
    return res.json({ ok: false, error: "Geçersiz müşteri numarası." });
  }

  try {
    const call = await client.calls.create({
      url: process.env.TWILIO_URL, // Twilio'nun çalacağı XML URL
      to: number,
      from: process.env.TWILIO_NUMBER
    });

    console.log("Arama başlatıldı:", call.sid);

    return res.json({ ok: true, sid: call.sid });

  } catch (err) {
    console.error("Arama hatası:", err);
    return res.json({ ok: false, error: "Arama başlatılamadı." });
  }
});

// Sunucu dinlemeye başlasın
app.listen(PORT, () => {
  console.log(`🚀 Alya sistemi çalışıyor → PORT ${PORT}`);
});
