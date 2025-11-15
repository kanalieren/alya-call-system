import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import twilio from "twilio";

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const TWILIO_SID = process.env.TWILIO_SID;
const TWILIO_AUTH = process.env.TWILIO_AUTH;
const TWILIO_WHATSAPP = process.env.TWILIO_WHATSAPP; // Twilio WhatsApp numarası

const client = twilio(TWILIO_SID, TWILIO_AUTH);

// ---------------------------------------------------------
// 1) OPENAI TTS (Kadın sesi oluşturma)
// ---------------------------------------------------------
async function generateSpeech(text) {
  try {
    console.log("[Alya] TTS oluşturuluyor...");

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

    return Buffer.from(response.data, "binary").toString("base64");

  } catch (err) {
    console.error("[Alya] TTS HATASI:", err);
    return null;
  }
}

// ---------------------------------------------------------
// 2) WhatsApp mesajı gönderme fonksiyonu
// ---------------------------------------------------------
async function sendWhatsAppMessage(to) {
  try {
    console.log("📩 WhatsApp mesajı gönderiliyor:", to);

    await client.messages.create({
      from: `whatsapp:${TWILIO_WHATSAPP}`,
      to: `whatsapp:${to}`,
      body:
        "Merhaba, ben Alya 💬\n" +
        "Randevunuzu oluşturdum. Güvenlik uzmanımız belirttiğiniz saatte sizi ziyaret edecek.\n" +
        "Destek için buradayım. Güvenli günler dilerim."
    });

    console.log("📩 WhatsApp mesajı gönderildi!");
  } catch (err) {
    console.error("WhatsApp Mesaj HATASI:", err);
  }
}

// ---------------------------------------------------------
// 3) Alya Konuşma Webhook (/call)
// ---------------------------------------------------------
app.post("/call", async (req, res) => {
  try {
    const speech = req.body.SpeechResult || "Merhaba";
    console.log("[Müşteri konuştu]:", speech);

    // GPT Yanıtı
    const aiRes = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `
Sen Alya isimli kadın bir dijital satış asistanısın.
Pronet güvenlik hizmetleri adına iş yerlerini arıyorsun.
Tonun kadınsı, sıcak, profesyonel ve güven vericidir.
Her cümlen kısa, net ve akıcıdır. (8–12 kelime)

Görevlerin:
- Müşteriyi nazikçe karşılamak.
- “Merhaba, ben Alya. Pronet güvenlik hizmetlerinden arıyorum. Alieren Bey’in dijital asistanıyım.” diyerek açılmak.
- Amaç: ücretsiz keşif randevusu oluşturmak.
- Randevu aldıktan sonra 4 nitelendirme sorusunu sormak.

Nitelendirme soruları:
1) “Sizi nasıl hitap edeyim, adınızı alabilir miyim?”
2) “Şu anda kullandığınız bir alarm veya kamera sistemi var mı?”
3) “Kararı siz mi veriyorsunuz, yoksa ortak var mı?”
4) “Randevuda uzmanımız sizinle mi görüşecek?”

Müşteri randevuyu onayladığında şunu söylemeyi unutma:
"Tamamdır, randevunuzu oluşturdum."

Eğer Alya bu cümleyi söylerse sunucu WhatsApp mesajı gönderecektir.

İtiraz kırıcı kısa cümleler:
- “Tabii ki, sadece kısa bir bilgilendirme yapıyoruz.”
- “Keşif tamamen ücretsiz, karar vermeniz gerekmiyor.”
- “Anlıyorum, süreç çok kısa, size uygun zamanı ayarlayabiliriz.”
- “Birçok kişi önce ihtiyaç olmadığını düşünüyor ama uzmanımız netleştiriyor.”

Fiyat verme, yanlış bilgi verme, teknik detaya girme.
Cümlelerin daima sıcak, kısa ve net olsun.
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

    const aiText = aiRes.data.choices[0].message.content;
    console.log("[Alya]:", aiText);

    // Eğer Alya randevuyu oluşturduysa WhatsApp mesajını gönder
    if (aiText.includes("randevunuzu oluşturdum")) {
      const customerPhone = req.body.From.replace("client:", "").replace("whatsapp:", "");
      sendWhatsAppMessage(customerPhone);
    }

    // TTS üret
    const audioBase64 = await generateSpeech(aiText);
    if (!audioBase64) {
      return res.send(`<Response><Say>Sunucu hatası oluştu.</Say></Response>`);
    }

    const twimlResponse = `
      <Response>
        <Play>data:audio/wav;base64,${audioBase64}</Play>
        <Gather input="speech" action="/call" method="POST" speechTimeout="auto" />
      </Response>
    `;

    res.type("text/xml");
    res.send(twimlResponse);

  } catch (err) {
    console.error("[Alya] WEBHOOK HATASI:", err);
    res.send(`<Response><Say>Bir hata oluştu.</Say></Response>`);
  }
});

// ---------------------------------------------------------
// 4) OUTBOUND: Alya müşteriyi arıyor
// ---------------------------------------------------------
app.post("/call-customer", async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) return res.status(400).json({ error: "Telefon numarası eksik." });

    console.log("📞 OUTBOUND ARAMA BAŞLIYOR ->", phone);

    const call = await client.calls.create({
      to: phone,
      from: "+905302511091",
      url: "https://alya-call-system.onrender.com/call"
    });

    res.json({ ok: true, callSid: call.sid });

  } catch (err) {
    console.error("OUTBOUND CALL ERROR:", err);
    res.status(500).json({ error: "Arama başlatılamadı." });
  }
});

// ---------------------------------------------------------
// 5) Test endpoint
// ---------------------------------------------------------
app.get("/", (req, res) => {
  res.send("Alya çağrı sistemi aktif ✔");
});

// ---------------------------------------------------------
// 6) PORT
// ---------------------------------------------------------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("🚀 Alya OpenAI Voice Sistemi Aktif → PORT:", PORT);
});
