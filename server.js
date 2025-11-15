import express from "express";
import bodyParser from "body-parser";
import axios from "axios";

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// -----------------------------------------------------
// TTS FONKSİYONU (MP3 FORMATINDA)
// -----------------------------------------------------
async function generateSpeech(text) {
  try {
    const response = await axios.post(
      "https://api.openai.com/v1/audio/speech",
      {
        model: "gpt-4o-mini-tts",
        voice: "alloy",
        input: text,
        format: "mp3"   // ← ← ÖNEMLİ: MP3 FORMAT
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

  } catch (error) {
    console.error("TTS Hatası:", error.response?.data || error);
    return null;
  }
}

// -----------------------------------------------------
// TEST ENDPOINT
// -----------------------------------------------------
app.get("/", (req, res) => {
  res.send("Alya OpenAI Voice Sistemi Aktif ✔");
});

// -----------------------------------------------------
// TWILIO /call WEBHOOK
// -----------------------------------------------------
app.post("/call", async (req, res) => {

  // Twilio timeout olmaması için:
  res.setTimeout(4500);

  const userSentence = req.body.SpeechResult || "Merhaba";

  console.log("\n[Alya] Kullanıcı konuşması:", userSentence);

  // GPT'den yanıt al
  const aiResponse = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
Sen Alya adında profesyonel bir arama asistanısın.
Türkçe konuşursun.
Cevapların kısa olacak: 6 - 10 kelime.
Direkt konuya gir. Randevu almaya odaklan.
Twilio'nun 64KB sınırına dikkat et.
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
      }
    }
  );

  const aiText = aiResponse.data.choices[0].message.content;
  console.log("[Alya GPT Yanıtı]:", aiText);

  // TTS oluştur
  const speechBase64 = await generateSpeech(aiText);

  if (!speechBase64) {
    return res.send(`
      <Response>
        <Say>Teknik bir hata oluştu.</Say>
      </Response>
    `);
  }

  console.log("[Alya] TTS Üretildi.");

  // -----------------------------------------------------
  // Twilio'ya GÖNDERİLEN XML (MP3 + gecikmeli Gather)
  // -----------------------------------------------------
  const twiml = `
    <Response>
      <Play>data:audio/mp3;base64,${speechBase64}</Play>
      <Pause length="1"/>
      <Gather 
        input="speech" 
        action="/call" 
        method="POST" 
        speechTimeout="auto">
      </Gather>
    </Response>
  `;

  res.type("text/xml");
  return res.send(twiml);
});

// -----------------------------------------------------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("Alya OpenAI Voice Sistemi Aktif →", PORT);
});
