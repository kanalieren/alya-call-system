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

// Path ayarları
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Public klasör
app.use(express.static(path.join(__dirname, "public")));

// Paneli göster
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "panel.html"));
});

// Kullanıcı arama endpoint
app.post("/call-customer", async (req, res) => {
    try {
        const { number } = req.body;

        if (!number) {
            return res.json({ ok: false, error: "Numara alınamadı." });
        }

        const call = await client.calls.create({
            url: process.env.TWILIO_VOICE_URL, // Twilio’nun call webhooku
            to: number,
            from: process.env.TWILIO_NUMBER,
        });

        res.json({ ok: true, callSID: call.sid });

    } catch (err) {
        res.json({ ok: false, error: err.message });
    }
});

// Twilio webhook -> Müşteri açınca çalacak ses
app.post("/call", (req, res) => {
    const twiml = `
        <Response>
            <Say voice="Polly.Berenice">Merhaba. Bu bir test çağrısıdır.</Say>
        </Response>
    `;
    res.set("Content-Type", "text/xml");
    res.send(twiml);
});

// Server
app.listen(PORT, () => {
    console.log("Alya sistemi çalışıyor → PORT", PORT);
});
