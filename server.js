import express from "express";
import bodyParser from "body-parser";
import axios from "axios";

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// LOG
console.log("🚀 Alya server başlatılıyor... API KEY Var mı?", !!OPENAI_API_KEY);

// -------- TTS (Ses oluşturma) --------
async function generateSpeech(text) {
  console.log("🟦 TTS isteği gönderiliyor:", text);

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

    const audioBase64 = Buffer.from(response.data).toString("base64");

    console.log("🟩 TTS başarıyla üretildi. Uzunluk:", audioBase64.length);

    return audioBase64;
  } catch (err) {
    console.error("❌ TTS HATASI:", err.response?.data || err.message || err);
    return null;
  }
}

// -------- TEST --------
app.get("/", (req, res) => {
  res.send("Alya OpenAI Voice Sistemi Aktif ✔");
});

// -------- TWILIO CALL WEBHOOK --------
app.post("/call", async (req, res) => {
  console.log("📞 Twilio çağrısı geldi:", req.body);

  const userSentence = req.body.SpeechResult || "Merhaba, nasıl yardımcı olabilirim?";

  console.log("🟦 Kullanıcı cümlesi:", userSentence);

  // --- OpenAI Chat ---
  let aiText = "Maalesef konuşma üretilemedi.";

  try {
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
HER cevabın kısa olacak: 8-12 kelime.
Uzun açıklamalar yapma.
Doğrudan konuya gir.
Randevu almaya odaklan.
            `,
          },
          {
            role: "user",
            content: userSentence,
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    aiText = aiResponse.data.choices[0].message.content;

    console.log("🟩 OpenAI Chat yanıtı:", aiText);
  } catch (err) {
    console.error("❌ Chat API HATASI:", err.response?.data || err);
  }

  // --- TTS oluştur ---
  const speechBase64 = await generateSpeech(aiText);

  if (!speechBase64) {
    console.log("❌ Ses üretilemedi → Twilio'ya hata dönüyoruz.");

    const errorXML = `
      <Response>
        <Say>Sunucu hatası oluştu.</Say>
      </Response>
    `;

    res.type("text/xml");
    return res.send(errorXML);
  }

  // --- TWIML gönder ---
  console.log("🟩 Twilio'ya başarılı XML dönüyor.");

  const twimlResponse = `
    <Response>
      <Play>data:audio/mp3;base64,${speechBase64}</Play>
      <Gather input="speech" action="/call" method="POST"></Gather>
    </Response>
  `;

  res.type("text/xml");
  res.send(twimlResponse);
});

// -------- PORT --------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🔥 Alya OpenAI Voice Sistemi Aktif →", PORT);
});
