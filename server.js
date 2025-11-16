import express from "express";
import dotenv from "dotenv";
import Twilio from "twilio";
import OpenAI from "openai";
import fetch from "node-fetch";

dotenv.config();

const app = express();
app.use(express.json());

// ----------------------
// TWILIO AYARLARI
// ----------------------
const twilioClient = Twilio(
    process.env.TWILIO_SID,
    process.env.TWILIO_AUTH_TOKEN
);

// ----------------------
// OPENAI AYARLARI
// ----------------------
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// ----------------------
// PANEL → ARAMA BAŞLAT
// ----------------------
app.post("/call", async (req, res) => {
    const number = req.body.number;

    if (!number) {
        return res.json({ ok: false, error: "Numara alınamadı." });
    }

    try {
        const call = await twilioClient.calls.create({
            to: number,
            from: process.env.TWILIO_NUMBER,
            url: "https://alya-call-system.onrender.com/call-handler"
        });

        res.json({ ok: true, sid: call.sid });

    } catch (err) {
        res.json({ ok: false, error: err.message });
    }
});

// ----------------------
// TWILIO → SESİ YÖNET
// ----------------------
app.post("/call-handler", async (req, res) => {
    res.set("Content-Type", "text/xml");

    const twiml = `
    <Response>
        <Say voice="Polly.Burcu">Merhaba. Bu bir test çağrısıdır.</Say>
    </Response>
    `;

    res.send(twiml);
});

// ----------------------
app.listen(10000, () => {
    console.log("Alya sistemi çalışıyor → PORT 10000");
});
