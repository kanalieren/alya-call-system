import express from "express";
import bodyParser from "body-parser";
import axios from "axios";

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// OpenAI API Key
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// ==== TEXT → SPEECH (OpenAI TTS) =====
async function generateSpeech(text) {
  try {
    const response = await axios.post(
      "https://api.openai.com/v1/audio/speech",
      {
        model: "gpt-4o-mini-tts",
        voice: "alloy",
        input: text,
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        responseType: "arraybuffer",
      }
    );

    return Buffer.from(response.data).toString("base64");

  } catch (err) {
    console.error("TTS Error:", err.response?.data || err);
    return null;
  }
}

// ==== TEST ENDPOINT =====
app.get("/", (req, res) => {
  res.send("Alya OpenAI Voice Sistemi Aktif ✔");
});

// ==== TWILIO CALL WEBHOOK =====
app.post("/call", async (req, res) => {
  try {
    const userSentence = req.body.SpeechResult || "Merhaba";

    // === 1) OpenAI Chat (v1/responses) ===
    const aiResponse = await axios.post(
      "https://api.openai.com/v1/responses",
      {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `
Sen Alya adında profesyonel bir arama asistanısın.
Türkçe konuşursun.
HER cevabın kısa olacak: maksimum 8-12 kelime.
Kısa cümleler kur. Uzun açıklamalar yapma.
Twilio'nun 64KB sınırı için ses çıktısını KÜÇÜK tut.
Doğrudan konuya gir.
Müşteriden randevu almaya odaklan.
`
          },
          {
            role: "user",
            content: userSentence
          }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    // Yeni OpenAI formatı
    const aiText = aiResponse.data.output[0].content[0].text;

    console.log("AI cevap:", aiText);

    // === 2) TTS üret ===
    const speechBase64 = await generateSpeech(aiText);

    if (!speechBase64) {
      throw new Error("TTS oluşmadı.");
    }

    // === 3) Twilio'ya geri gönderilecek XML ===
    const twiml = `
      <Response>
        <Play>data:audio/mp3;base64,${speechBase64}</Play>
        <Gather input="speech" action="/call" method="POST"></Gather>
      </Response>
    `;

    res.type("text/xml");
    return res.send(twiml);

  } catch (err) {
    console.error("CALL ERROR:", err);

    // Twilio bozulmasın diye fallback cevap
    const fallback = `
      <Response>
        <Say>Sunucu hatası oluştu.</Say>
      </Response>
    `;
    res.type("text/xml");
    return res.send(fallback);
  }
});

// ==== SUNUCU =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Alya OpenAI Voice Sistemi Aktif →", PORT);
});
