const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');
const fs = require('fs').promises;
const { performance } = require('perf_hooks');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

const app = express();
const port = process.env.PORT || 3000;

// Middleware para seguridad y optimización
app.use(helmet());
app.use(compression());
app.use(morgan('combined'));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100 // límite de 100 solicitudes por ventana por IP
});
app.use(limiter);

// Función para extraer información del video
async function extractVideoInfo(url) {
  const response = await axios.get(url);
  const html = response.data;
  const $ = cheerio.load(html);

  const videoSource = $('source[type="video/mp4"]').attr('src');
  const videoPoster = $('#video-poster').attr('src');
  const posterWidth = $('#video-poster').attr('width');
  const posterHeight = $('#video-poster').attr('height');
  const ogTitle = $('meta[property="og:title"]').attr('content');
  const ogDescription = $('meta[property="og:description"]').attr('content');
  const nViews = $('#n-views').text();
  const nLikes = $('#n-likes-video').text();
  const nDislikes = $('#n-dislikes-video').text();
  const uploadDate = $('meta[itemprop="uploadDate"]').attr('content');
  const duration = $('meta[itemprop="duration"]').attr('content');

  return {
    video: {
      source: videoSource || 'No video source found',
      poster: {
        url: videoPoster || 'No poster found',
        width: posterWidth || 'Unknown width',
        height: posterHeight || 'Unknown height'
      }
    },
    metadata: {
      title: ogTitle || 'No title found',
      description: ogDescription || 'No description found',
      views: nViews || 'Unknown views',
      likes: nLikes || 'Unknown likes',
      dislikes: nDislikes || 'Unknown dislikes',
      uploadDate: uploadDate || 'Unknown upload date',
      duration: duration || 'Unknown duration'
    }
  };
}

// Ruta /info para extraer la información del video
app.get('/info', async (req, res) => {
  const url = req.query.url;
  if (!url) {
    return res.status(400).json({ error: 'No se proporcionó la URL.' });
  }

  const startTime = performance.now();

  try {
    const result = await extractVideoInfo(url);
    const endTime = performance.now();
    const apiTime = endTime - startTime;

    res.json({
      ...result,
      apiPerformance: {
        timeInMs: apiTime.toFixed(2),
        timeInSeconds: (apiTime / 1000).toFixed(2)
      }
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al extraer la información de la URL proporcionada.' });
  }
});

// Ruta /downloader para descargar el video MP4
app.get('/downloader', async (req, res) => {
  const url = req.query.url;
  if (!url) {
    return res.status(400).json({ error: 'No se proporcionó la URL.' });
  }

  try {
    const videoInfo = await extractVideoInfo(url);
    const videoSource = videoInfo.video.source;

    if (!videoSource) {
      return res.status(404).json({ error: 'No se encontró la URL del video.' });
    }

    // Configurar headers para la descarga
    res.setHeader('Content-Disposition', 'attachment; filename="video.mp4"');
    res.setHeader('Content-Type', 'video/mp4');

    // Transmitir el video directamente al cliente
    const videoStream = await axios({
      method: 'get',
      url: videoSource,
      responseType: 'stream'
    });

    videoStream.data.pipe(res);

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al descargar el video de la URL proporcionada.' });
  }
});

// Manejador de errores global
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('¡Algo salió mal!');
});

// Iniciar el servidor
app.listen(port, () => {
  console.log(`Servidor ejecutándose en http://localhost:${port}`);
});
