import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import twilio from "twilio";

// --------------------------------------------------
// APP SETUP
// --------------------------------------------------
const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// --------------------------------------------------
// ENV VARIABLES
// --------------------------------------------------
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const TWILIO_SID = process.env.TWILIO_SID;
const TWILIO_AUTH = process.env.TWILIO_AUTH;

const client = twilio(TWILIO_SID, TWILIO_AUTH);

// --------------------------------------------------
// OpenAI TEXT → SPEECH
// --------------------------------------------------
async function generateSpeech(text) {
  try {
    const response = await axios.post(
      "https://api.openai.com/v1/audio/speech",
      {
        model: "gpt-4o-mini-tts",
        voice: "alloy",
        input: text,
        format: "wav"
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        responseType: "arraybuffer"
      }
    );

    return Buffer.from(response.data).toString("base64");

  } catch (err) {
    console.error("TTS ERROR:", err.response?.data || err);
    return null;
  }
}

// --------------------------------------------------
// TWILIO → /call WEBHOOK
// --------------------------------------------------
app.post("/call", async (req, res) => {
  try {
    const speech = req.body.SpeechResult || "";
    console.log("User said:", speech);

    // -------------------------------------------
    // OPENAI → Alya cevabı
    // -------------------------------------------
    const aiRes = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `
Sen Alya adında sıcak, samimi bir satış asistanısın.
Görevin iş yerlerine randevu oluşturmak.
Kısa cümlelerle konuş.
`
          },
          { role: "user", content: speech }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const alyaReply = aiRes.data.choices[0].message.content;
    console.log("Alya:", alyaReply);

    // -------------------------------------------
    // OpenAI TTS
    // -------------------------------------------
    const audio = await generateSpeech(alyaReply);

    if (!audio) {
      return res.type("text/xml").send(`
        <Response>
          <Say>Üzgünüm, bir hata oluştu.</Say>
        </Response>
      `);
    }

    // -------------------------------------------
    // TWIML DÖN
    // -------------------------------------------
    const twiml = `
      <Response>
        <Play>data:audio/wav;base64,${audio}</Play>
        <Gather input="speech" action="/call" method="POST" speechTimeout="auto" />
      </Response>
    `;

    res.type("text/xml");
    res.send(twiml);

  } catch (err) {
    console.error("CALL ERROR:", err);
    res.type("text/xml").send(`<Response><Say>Sunucu hatası.</Say></Response>`);
  }
});

// --------------------------------------------------
// CUSTOMER OUTBOUND CALL
// --------------------------------------------------
app.post("/call-customer", async (req, res) => {
  try {
    const { phone } = req.body;

    const call = await client.calls.create({
      to: phone,
      from: "+905302511091",
      url: "https://alya-call-system.onrender.com/call"
    });

    res.json({ ok: true, callSid: call.sid });

  } catch (err) {
    console.error("OUTBOUND ERROR:", err);
    res.status(500).json({ error: "Arama başlatılamadı" });
  }
});

// --------------------------------------------------
// ROOT TEST
// --------------------------------------------------
app.get("/", (req, res) => {
  res.send("Alya sistemi aktif ✔");
});

// --------------------------------------------------
// PORT
// --------------------------------------------------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("Alya çalışıyor → PORT", PORT);
});
