const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { rateLimit } = require('express-rate-limit');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = 'ytstream-download-youtube-videos.p.rapidapi.com';

app.get('/test-ffmpeg', (req, res) => {
  const { exec } = require('child_process');

app.get('/test-ffmpeg', (req, res) => {
  const { exec } = require('child_process');

  exec('ls /nix/store | grep ffmpeg', (err, stdout, stderr) => {
    if (err) {
      return res.status(500).send({
        error: 'Cannot find ffmpeg in nix store',
        details: stderr || err.message
      });
    }

    res.send({
      message: 'Search result in /nix/store',
      result: stdout
    });
  });
});

if (!RAPIDAPI_KEY) {
  console.error('ERRO: variável de ambiente RAPIDAPI_KEY não definida.');
  process.exit(1);
}

// Security headers
// O NOVO CÓDIGO CORRIGIDO
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://fonts.gstatic.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https://img.youtube.com"],
      connectSrc: ["'self'"],
      'script-src-attr': ["'unsafe-inline'"] // <-- Esta linha resolve o bloqueio
    }
  }
}));

// CORS — only allow same origin (your own domain)
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*',
  methods: ['GET'],
  allowedHeaders: ['Content-Type']
}));

// This tells Express to serve your index.html and other files from the public folder
app.use(express.static(path.join(__dirname, 'public')));

// Rate limiting — max 30 requests per IP per 10 minutes
const limiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições. Tente novamente em alguns minutos.' }
});
app.use('/api/', limiter);

// Serve frontend
app.use(express.static('public'));

// Input validation
function extractVideoId(url) {
  try {
    const u = new URL(url);
    const allowed = ['www.youtube.com', 'youtube.com', 'youtu.be', 'm.youtube.com'];
    if (!allowed.includes(u.hostname)) return null;
    if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('?')[0];
    if (u.pathname.includes('/shorts/')) return u.pathname.split('/shorts/')[1].split(/[?/]/)[0];
    return u.searchParams.get('v');
  } catch {
    return null;
  }
}

function isValidVideoId(id) {
  return id && /^[a-zA-Z0-9_-]{8,15}$/.test(id);
}

// API proxy endpoint — key never exposed to browser
app.get('/api/info', async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'URL não fornecida.' });
  }

  const videoId = extractVideoId(decodeURIComponent(url));

  if (!isValidVideoId(videoId)) {
    return res.status(400).json({ error: 'URL do YouTube inválida.' });
  }

  try {
    const response = await fetch(
      `https://${RAPIDAPI_HOST}/dl?id=${videoId}`,
      {
        headers: {
          'x-rapidapi-key': RAPIDAPI_KEY,
          'x-rapidapi-host': RAPIDAPI_HOST
        }
      }
    );

    if (!response.ok) {
      const status = response.status;
      if (status === 429) return res.status(429).json({ error: 'Limite de pedidos atingido. Tente mais tarde.' });
      if (status === 403) return res.status(500).json({ error: 'Erro de autenticação na API.' });
      return res.status(500).json({ error: 'Erro ao buscar vídeo.' });
    }

   // Dentro de app.get('/api/info', ...)
const data = await response.json();

// Criamos uma lista única com todos os formatos úteis
const allFormats = [
  ...(data.formats || []),
  ...(data.adaptiveFormats || [])
].filter(f => f.url || f.signatureCipher || f.cipher);

const safe = {
  title: data.title || '',
  author: data.author || '',
  lengthSeconds: data.lengthSeconds || 0,
  videoId,
  // Enviamos tudo numa lista só para o frontend não se confundir
  formats: allFormats.map(f => ({
    url: f.url,
    mimeType: f.mimeType,
    quality: f.quality || '',
    qualityLabel: f.qualityLabel || f.quality || '',
    hasAudio: !!(f.audioQuality || f.mimeType.includes('audio')),
    isAdaptive: !f.audioQuality && f.mimeType.includes('video')
  }))
};

res.json(safe);

  } catch (err) {
    console.error('Fetch error:', err.message);
    res.status(500).json({ error: 'Erro interno. Tente novamente.' });
  }
});

// Merge endpoint — downloads video + audio streams and merges with ffmpeg
// Query params: videoUrl, audioUrl, filename (optional)
app.get('/api/merge', async (req, res) => {
  const { videoUrl, audioUrl, filename } = req.query;

  if (!videoUrl || !audioUrl) {
    return res.status(400).json({ error: 'videoUrl e audioUrl são obrigatórios.' });
  }

  // Validate both URLs are from trusted YouTube CDN domains
  const trustedHosts = ['googlevideo.com', 'youtube.com', 'ytimg.com'];
  let parsedVideo, parsedAudio;
  try {
    parsedVideo = new URL(decodeURIComponent(videoUrl));
    parsedAudio = new URL(decodeURIComponent(audioUrl));
  } catch {
    return res.status(400).json({ error: 'URLs inválidas.' });
  }

  const isTrusted = (hostname) => trustedHosts.some(h => hostname.endsWith(h));
  if (!isTrusted(parsedVideo.hostname) || !isTrusted(parsedAudio.hostname)) {
    return res.status(400).json({ error: 'URLs de origem não permitidas.' });
  }

  const safeFilename = (filename || 'video')
    .replace(/[^a-zA-Z0-9_\-\s]/g, '')
    .trim()
    .substring(0, 100) || 'video';

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ytmerge-'));
  const outputPath = path.join(tmpDir, 'output.mp4');

  // Kill the process if it takes more than 3 minutes
  const timeout = setTimeout(() => {
    cleanup(tmpDir);
    if (!res.headersSent) res.status(504).json({ error: 'Tempo limite excedido. Tente um vídeo mais curto.' });
  }, 3 * 60 * 1000);

  try {
    await runFfmpeg(decodeURIComponent(videoUrl), decodeURIComponent(audioUrl), outputPath);

    clearTimeout(timeout);

    if (!fs.existsSync(outputPath)) {
      cleanup(tmpDir);
      return res.status(500).json({ error: 'Falha ao processar vídeo.' });
    }

    const stat = fs.statSync(outputPath);
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}.mp4"`);
    res.setHeader('Content-Length', stat.size);

    const stream = fs.createReadStream(outputPath);
    stream.pipe(res);
    stream.on('close', () => cleanup(tmpDir));
    stream.on('error', () => cleanup(tmpDir));

  } catch (err) {
    clearTimeout(timeout);
    cleanup(tmpDir);
    console.error('Merge error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'Erro ao combinar vídeo e áudio.' });
  }
});

function runFfmpeg(videoUrl, audioUrl, outputPath) {
  return new Promise((resolve, reject) => {
    // -i videoUrl  : video-only stream
    // -i audioUrl  : audio-only stream
    // -c:v copy    : no re-encode (fast)
    // -c:a aac     : encode audio to aac for mp4 compatibility
    // -shortest    : stop at the shorter stream (safety)
    const args = [
      '-y',
      '-i', videoUrl,
      '-i', audioUrl,
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-shortest',
      '-movflags', '+faststart',
      outputPath
    ];

    const ff = spawn('ffmpeg', args);

    let stderr = '';
    ff.stderr.on('data', d => { stderr += d.toString(); });

    ff.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}\n${stderr.slice(-500)}`));
    });

    ff.on('error', err => reject(new Error(`ffmpeg not found: ${err.message}`)));
  });
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

// 404 fallback
app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada.' });
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
