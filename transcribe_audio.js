const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const audiosDir = path.join(__dirname, 'assets/audios');
const outDir = path.join(__dirname, 'db/transcriptions');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

function transcribeAll() {
  const files = fs.readdirSync(audiosDir).filter(f => f.endsWith('.ogg') || f.endsWith('.opus') || f.endsWith('.mp3'));
  
  let count = 1;
  for (let file of files) {
    const filePath = path.join(audiosDir, file);
    // Whisper generates multiple files by default (txt, vtt, etc.), let's ask for txt
    // We name the specific output using --output_dir
    const txtFile = path.join(outDir, `${file.split('.')[0]}.txt`);
    const finalFile = path.join(outDir, `transcript_audio${count}.txt`);
    
    if (fs.existsSync(finalFile) || fs.existsSync(txtFile)) {
      console.log(`Skipping ${file}, already transcribed.`);
      count++;
      continue;
    }
    
    console.log(`[${count}/${files.length}] Transcribing ${file} with Whisper locally...`);
    
    try {
      // --model deep_scale or base or turbo? "turbo" or "base" is good.
      // we'll let whisper choose the default (usually base) or specify tiny/base for speed on 140 files
      execSync(`whisper "${filePath}" --language fr --output_format txt --output_dir "${outDir}" --model base`, { stdio: 'inherit' });
      
      // Rename it to the target name
      if (fs.existsSync(txtFile)) {
        fs.renameSync(txtFile, finalFile);
        console.log(`Successfully renamed to ${finalFile}`);
      }
    } catch (e) {
      console.error(`Error transcribing ${file}:`, e.message);
    }
    
    count++;
  }
  console.log("All transcriptions finished.");
}

transcribeAll();
