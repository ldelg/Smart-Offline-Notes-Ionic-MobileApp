import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const targetDir = path.resolve(__dirname, '..', 'src', 'assets', 'models', 'whisper-small');

const files = [
  'config.json', 'generation_config.json', 'preprocessor_config.json',
  'tokenizer.json', 'tokenizer_config.json', 'added_tokens.json',
  'merges.txt', 'normalizer.json', 'quant_config.json', 'quantize_config.json',
  'special_tokens_map.json', 'vocab.json',
];

// ONNX files - download from onnx/ folder but save directly in whisper-small/
// Try simple names first - transformers.js might expect these
const onnxFiles = [
  'encoder_model.onnx',
  'decoder_model.onnx'
];

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        fs.unlinkSync(dest);
        return download(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        return reject(new Error(`Failed: ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', (err) => { file.close(); fs.unlinkSync(dest); reject(err); });
  });
}

async function main() {
  fs.mkdirSync(targetDir, { recursive: true });
  
  // Download regular files
  for (const file of files) {
    const dest = path.join(targetDir, file);
    if (fs.existsSync(dest)) {
      console.log(`✓ ${file} (exists)`);
      continue;
    }
    const url = `https://huggingface.co/Xenova/whisper-small/resolve/main/${file}`;
    process.stdout.write(`Downloading ${file}... `);
    try {
      await download(url, dest);
      console.log('✓');
    } catch (err) {
      console.log(`✗ ${err.message}`);
      process.exit(1);
    }
  }
  
  // Download ONNX files from onnx/ folder but save directly in whisper-small/
  for (const file of onnxFiles) {
    const dest = path.join(targetDir, file);
    if (fs.existsSync(dest)) {
      console.log(`✓ ${file} (exists)`);
      continue;
    }
    const url = `https://huggingface.co/Xenova/whisper-small/resolve/main/onnx/${file}`;
    process.stdout.write(`Downloading ${file}... `);
    try {
      await download(url, dest);
      console.log('✓');
    } catch (err) {
      console.log(`✗ ${err.message}`);
      process.exit(1);
    }
  }
  
  console.log('\nDone!');
}

main();

