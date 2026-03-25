const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const API_KEY = "AIzaSyDXTfhyOhcjXUB56ubE1S7Lags9vMz80qs";
const genAI = new GoogleGenerativeAI(API_KEY);

function fileToGenerativePart(path, mimeType) {
  return {
    inlineData: {
      data: Buffer.from(fs.readFileSync(path)).toString("base64"),
      mimeType
    },
  };
}

async function analyzeImages() {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  
  const files = fs.readdirSync('./assets/images/livres').filter(f => f.endsWith('.jpg') || f.endsWith('.png'));
  const prompt = "Please tell me the EXACT French book title written on the cover of this book. Only output the title, nothing else. If it says Likoutey Moharane part 1, 2, 3, etc., please specify. If none, say 'UNKNOWN'.";

  let mappings = {};

  for (let file of files.slice(0, 15)) {
    const filePath = path.join('./assets/images/livres', file);
    try {
      const imagePart = fileToGenerativePart(filePath, "image/jpeg");
      const result = await model.generateContent([prompt, imagePart]);
      const response = await result.response;
      console.log(file + ": " + response.text().trim());
    } catch (e) {
      console.log(file + ": ERROR " + e.message);
    }
  }
}

analyzeImages();
