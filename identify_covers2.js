const fs = require('fs');
const path = require('path');

const API_KEY = "AIzaSyBR8toqx1SuPrqreNuv-DNunBPQLDY5NJ8";

async function analyzeImages() {
  const files = fs.readdirSync('./assets/images/livres').filter(f => f.endsWith('.jpg') || f.endsWith('.png'));
  
  // Only check files that aren't already mapped
  const mapped = ["IMG-20251027-WA0190.jpg", "IMG-20251110-WA0181.jpg", "IMG-20251110-WA0182.jpg", "IMG-20251110-WA0183.jpg", "IMG-20251110-WA0184.jpg", "WhatsAppImage2025-11-10at21.45.14.jpeg", "IMG-20251110-WA0188.jpg", "IMG-20251110-WA0192.jpg", "IMG-20251031-WA0003.jpg", "IMG-20251031-WA0004.jpg", "IMG-20251103-WA0120.jpg", "IMG-20251103-WA0121.jpg", "IMG-20251103-WA0119.jpg", "IMG-20251110-WA0194.jpg", "IMG-20251110-WA0190.jpg"];
  
  const unmapped = files.filter(f => !mapped.includes(f) && f.startsWith("IMG-20251110")); // just to narrow down
  
  for (let file of unmapped) {
    const filePath = path.join('./assets/images/livres', file);
    const base64Image = Buffer.from(fs.readFileSync(filePath)).toString('base64');
    
    const body = {
      contents: [{
        parts: [
          {text: "What French book title is on this cover? Only output the title and part number. E.g. 'Likoutey Moharane Tome 1'"},
          {inline_data: {mime_type: "image/jpeg", data: base64Image}}
        ]
      }]
    };
    
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro-vision:generateContent?key=${API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });
      const data = await response.json();
      console.log(file + ": " + JSON.stringify(data));
    } catch (e) {
      console.log(file + ": ERROR " + e.message);
    }
  }
}

analyzeImages();
