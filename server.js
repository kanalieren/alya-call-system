import express from "express";
import dotenv from "dotenv";
import { OpenAI } from "openai";
import twilio from "twilio";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
app.use(express.json());

// 🔧 Twilio Client
const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH);

// 🔧 OpenAI Client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Path ayarları
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// === PANEL HTML SERVE ===
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "panel.html"));
});

app.get("/panel.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "panel.html"));
});

// === MÜŞTERİYİ ARAMA ENDPOINT ===
app.post("/call-customer", async (req, res) => {
  try {
    const customerNumber = req.body.customerNumber?.trim();

    // ⭐ VALIDASYON TAMAMEN KALDIRILDI
    if (!customerNumber) {
      return res.status(400).json({
        ok: false,
        error: "Numara alınamadı.",
      });
    }

    console.log("📞 Arama başlıyor:", customerNumber);

    const call = await client.calls.create({
      to: customerNumber,
      from: process.env.TWILIO_PHONE,
      url: process.env.PUBLIC_URL + "/call",
    });

    return res.json({ ok: true, callSid: call.sid });
  } catch (err) {
    console.error("🚨 Arama başlatılamadı:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// === TWILIO'DAN GELEN CALL WEBHOOK ===
app.post("/call", async (req, res) => {
  try {
    console.log("🤖 Twilio call webhook tetiklendi");

    // Basit bir karşılama mesajı
    const twiml = `
      <Response>
        <Say language="tr-TR" voice="Polly-Filiz">
          Merhaba, Pronet'ten arıyoruz. Size yardımcı olabilir miyim?
        </Say>
      </Response>
    `;

    res.type("text/xml");
    return res.send(twiml);
  } catch (err) {
    console.error("🚨 Twilio Call Webhook Hatası:", err);
    res.status(500).send("<Response><Say>Hata oluştu.</Say></Response>");
  }
});

// === SERVER ===
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Sunucu çalışıyor → PORT ${PORT}`));
