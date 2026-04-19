const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { rateLimit } = require('express-rate-limit');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = 'ytstream-download-youtube-videos.p.rapidapi.com';


if (!RAPIDAPI_KEY) {
  console.error('ERRO: variável de ambiente RAPIDAPI_KEY não definida.');
  process.exit(1);
}

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://fonts.gstatic.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https://img.youtube.com"],
      connectSrc: ["'self'"],
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

    const data = await response.json();

    if (!data || data.status === 'fail') {
      return res.status(404).json({ error: 'Vídeo não encontrado ou indisponível.' });
    }

    // Strip sensitive fields, return only what frontend needs
    const safe = {
      title: data.title || '',
      author: data.author || '',
      lengthSeconds: data.lengthSeconds || 0,
      videoId,
      formats: (data.formats || [])
        .filter(f => f.url && f.mimeType)
        .map(f => ({
          url: f.url,
          mimeType: f.mimeType,
          quality: f.quality || '',
          qualityLabel: f.qualityLabel || '',
          bitrate: f.bitrate || 0,
          audioQuality: f.audioQuality || ''
        })),
      adaptiveFormats: (data.adaptiveFormats || [])
        .filter(f => f.url && f.mimeType)
        .map(f => ({
          url: f.url,
          mimeType: f.mimeType,
          quality: f.quality || '',
          qualityLabel: f.qualityLabel || '',
          bitrate: f.bitrate || 0,
          audioQuality: f.audioQuality || ''
        }))
    };

    res.json(safe);

  } catch (err) {
    console.error('Fetch error:', err.message);
    res.status(500).json({ error: 'Erro interno. Tente novamente.' });
  }
});

// 404 fallback
app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada.' });
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
