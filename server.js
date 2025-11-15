import express from "express";
import bodyParser from "body-parser";
import axios from "axios";

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// === TEST ENDPOINT ===
app.get("/", (req, res) => {
  res.send("Alya Call System Çalışıyor ✔");
});

// === TWILIO CALL WEBHOOK ===
app.post("/call", async (req, res) => {
  const twiml = `
    <Response>
      <Say language="tr-TR">Merhaba, ben Alya. Şu anda test modundayım.</Say>
    </Response>
  `;
  res.type("text/xml");
  return res.send(twiml);
});

// === SUNUCU BAŞLAT ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Alya Call System çalışıyor → PORT:", PORT);
});
