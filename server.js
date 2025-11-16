import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import twilio from "twilio";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.static("public")); // <-- HTML panel için önemli

// ---------------------------------------------
// TWILIO AYARLARI
// ---------------------------------------------
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// SENİN TWILIO NUMARAN
const TWILIO_NUMBER = "+14706655724";  // <-- EN KRİTİK SATIR (Twilio numaran)

// ---------------------------------------------
// PANELDEN GELEN ARAMAYI BAŞLATMA
// ---------------------------------------------
app.post("/call-customer", async (req, res) => {
  const { number } = req.body;

  if (!number || number.length < 10) {
    return res.json({ ok: false, error: "Geçersiz müşteri numarası." });
  }

  try {
    console.log("➡️ Alya aramayı başlatıyor:", number);

    const call = await client.calls.create({
      url: "https://alya-call-system.onrender.com/call",
      to: number,
      from: TWILIO_NUMBER, // <-- TWILIO NUMARAN BURADA KULLANILIYOR
    });

    res.json({ ok: true, callSid: call.sid });
  } catch (err) {
    console.error("OUTBOUND CALL ERROR:", err);
    res.status(500).json({ ok: false, error: "Arama başlatılamadı." });
  }
});

// ---------------------------------------------
// TWILIO TARAFINDAN ÇAĞRILAN ENDPOINT
// ---------------------------------------------
app.post("/call", (req, res) => {
  const twiml = `
    <Response>
      <Say voice="Polly-Deepa" language="tr-TR">
        Merhaba! Test araması başarılı. Alya arama sistemi çalışıyor.
      </Say>
    </Response>
  `;

  res.set("Content-Type", "text/xml");
  res.send(twiml);
});

// ---------------------------------------------
app.get("/", (req, res) => res.send("Alya sistemi aktif ✔"));
// ---------------------------------------------

const PORT = process.env.PORT || 11200;
app.listen(PORT, () =>
  console.log(`Alya OpenAI – Twilio sistemi çalışıyor → PORT ${PORT}`)
);

