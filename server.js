import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import twilio from "twilio";

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// ---------------------------------------------
// ⭐ ENV DEĞERLERİ
// ---------------------------------------------
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const TWILIO_SID = process.env.TWILIO_SID;
const TWILIO_AUTH = process.env.TWILIO_AUTH;
const TWILIO_WHATSAPP = "whatsapp:+14155238886";

const client = twilio(TWILIO_SID, TWILIO_AUTH);

// ---------------------------------------------
// ⭐ WhatsApp MESAJ FONKSİYONLARI
// ---------------------------------------------
async function sendPositiveMessage(to) {
  try {
    await client.messages.create({
      from: TWILIO_WHATSAPP,
      to: `whatsapp:${to}`,
      body:
        "Merhaba, az önceki görüşmemiz için teşekkür ederim 😊\n" +
        "Randevunuz oluşturuldu, belirttiğiniz saatte işletmenizde olacağım.\n" +
        "Güzel günler dilerim. 🌿",
    });
  } catch (err) {
    console.error("Olumlu WhatsApp mesajı hatası:", err);
  }
}

async function sendNegativeMessage(to) {
  try {
    await client.messages.create({
      from: TWILIO_WHATSAPP,
      to: `whatsapp:${to}`,
      body:
        "Merhaba, zaman ayırdığınız için teşekkür ederim 🙏\n" +
        "Her zaman yardımcı olmaktan memnuniyet duyarım.\n" +
        "İyi günler dilerim. 🌿",
    });
  } catch (err) {
    console.error("Olumsuz WhatsApp mesajı hatası:", err);
  }
}

// ---------------------------------------------
// ⭐ OpenAI Alya — Konuşma Motoru
// ---------------------------------------------
async function askAlya(userText, conversationState) {
  const payload = {
    model: "gpt-4.1",
    messages: [
      {
        role: "system",
        content: `
Sen Alya isimli profesyonel bir satış asistanısın.
Sadece şu teklif için konuşuyorsun: "ProNet alarm ve kamera sistemleri".

Tonun:
• kadınsı
• sıcak
• hızlı randevu alan
• samimi ve ikna edici

Amaçların:
1) Randevu almak
2) Randevudan önce 3 bilgi toplamak:
   - Müşterinin adı
   - Alarm/kamera sistemi var mı?
   - Karar verici kendisi mi?

Konuşma sonunda JSON döndür:
{
  "reply": "müşteriye söyleyeceğin cümle",
  "status": "continue | positive | negative",
  "customer_name": "",
  "has_alarm": "",
  "decision_maker": ""
}
        `,
      },
      { role: "user", content: userText },
      ...(conversationState.history || []),
    ],
  };

  const response = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    payload,
    { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } }
  );

  const ai = response.data.choices[0].message.content;
  return JSON.parse(ai.trim());
}

// ---------------------------------------------
// ⭐ ANA TWILIO /call ENDPOINT
// ---------------------------------------------
app.post("/call", async (req, res) => {
  const userSpeech = req.body.SpeechResult || "";
  const userPhone = req.body.From?.replace("whatsapp:", "").replace("+", "");

  if (!userPhone) console.log("Telefon algılanamadı.");

  // Kullanıcı konuşması olmadığı anda Alya'nın ilk açılışı:
  let aiResponse;
  if (!userSpeech) {
    aiResponse = {
      reply:
        "Merhaba, ben Alya. ProNet Güvenlik Hizmetlerinden dijital asistanınızım. Size daha uygun güvenlik seçenekleri hakkında hızlıca bilgi verip randevu oluşturabilirim. İsminizi öğrenebilir miyim?",
      status: "continue",
    };
  } else {
    aiResponse = await askAlya(userSpeech);
  }

  // Randevu kararı
  if (aiResponse.status === "positive") {
    sendPositiveMessage(userPhone);
  } else if (aiResponse.status === "negative") {
    sendNegativeMessage(userPhone);
  }

  // TTS üret
  const tts = await axios.post(
    "https://api.openai.com/v1/audio/speech",
    {
      model: "gpt-4o-mini-tts",
      voice: "alloy",
      input: aiResponse.reply,
      format: "wav",
    },
    {
      responseType: "arraybuffer",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );

  const base64Audio = Buffer.from(tts.data).toString("base64");

  // TWIML cevap
  const twiml = `
<Response>
  <Play>data:audio/wav;base64,${base64Audio}</Play>
  <Gather input="speech" action="/call" method="POST" speechTimeout="auto"></Gather>
</Response>
`;

  res.type("text/xml");
  res.send(twiml);
});

// ---------------------------------------------
app.get("/", (req, res) => res.send("Alya sistem canlı ✔"));
// ---------------------------------------------

app.listen(10000, () =>
  console.log("Alya OpenAI-Twilio Voice Sistemi çalışıyor → 10000")
);
