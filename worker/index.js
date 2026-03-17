/**
 * SLAP SUPPLY — Background Removal Worker
 *
 * Endpoints:
 *   POST /upload              raw binary body (image file)         → { key, url }
 *   POST /remove-bg           { key: "originals/xxx.png" }         → { id }
 *   GET  /check/:id                                                → { status, key?, url? }
 *   GET  /file/:key                                                → image file from R2
 *
 * Flow:
 *   1. Browser streams raw file → /upload → stored in R2 as originals/xxx
 *   2. Browser calls /remove-bg with the R2 key
 *   3. Worker passes the public R2 URL to Replicate (no base64, no buffering)
 *   4. Browser polls /check/:id until done
 *   5. Processed result stored in R2 as artwork/xxx.png, URL returned
 *
 * Environment variables (wrangler secret put):
 *   REPLICATE_API_TOKEN  — Replicate API token
 *   ALLOWED_ORIGIN       — Shopify store URL, e.g. https://slap-supply.myshopify.com
 *
 * R2 binding (wrangler.toml):
 *   ARTWORK_BUCKET       — R2 bucket name
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const corsHeaders = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Filename, X-File-Type',
      'Access-Control-Max-Age': '86400',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
      // POST /upload — stream raw file body directly to R2 (no base64, no buffering)
      if (url.pathname === '/upload' && request.method === 'POST') {
        return await handleUpload(request, env, corsHeaders);
      }

      // POST /remove-bg — start Replicate prediction using the R2 URL
      if (url.pathname === '/remove-bg' && request.method === 'POST') {
        return await startRemoveBg(request, env, corsHeaders);
      }

      // GET /check/:predictionId — poll Replicate; store result in R2 when done
      const checkMatch = url.pathname.match(/^\/check\/([^/]+)$/);
      if (checkMatch && request.method === 'GET') {
        return await checkPrediction(request, checkMatch[1], env, corsHeaders);
      }

      // GET /file/:key — serve file from R2
      const fileMatch = url.pathname.match(/^\/file\/(.+)$/);
      if (fileMatch && request.method === 'GET') {
        return await serveFile(fileMatch[1], env, corsHeaders);
      }

      return new Response('Not found', { status: 404, headers: corsHeaders });
    } catch (err) {
      console.error('Worker error:', err);
      return json({ error: err.message }, 500, corsHeaders);
    }
  },
};

/* ─── Upload: stream raw file body straight to R2 ──────────────────────── */

async function handleUpload(request, env, corsHeaders) {
  const contentType = request.headers.get('X-File-Type') || request.headers.get('Content-Type') || 'application/octet-stream';
  const rawName     = request.headers.get('X-Filename') || 'upload';
  const filename    = decodeURIComponent(rawName);
  const ext         = filename.includes('.') ? '.' + filename.split('.').pop().toLowerCase() : '';
  const key         = `originals/${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;

  // Stream request.body directly to R2 — the Worker never buffers the full file
  await env.ARTWORK_BUCKET.put(key, request.body, {
    httpMetadata: { contentType },
  });

  const fileUrl = `${new URL(request.url).origin}/file/${key}`;
  return json({ key, url: fileUrl }, 200, corsHeaders);
}

/* ─── Start BG removal prediction ──────────────────────────────────────── */

async function startRemoveBg(request, env, corsHeaders) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, corsHeaders);
  }

  if (!body.key) {
    return json({ error: 'Missing "key" field' }, 400, corsHeaders);
  }

  // Build the public URL for the uploaded original
  const origin   = new URL(request.url).origin;
  const imageUrl = `${origin}/file/${body.key}`;

  // Pass URL to Replicate — Replicate fetches the image itself, no base64 needed
  const replicateRes = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      Authorization: `Token ${env.REPLICATE_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      version: '95fcc2a26d3899cd6c2691c900465aaeff466285a65c14638cc5f36f34befaf1',
      input: { image: imageUrl },
    }),
  });

  if (!replicateRes.ok) {
    const errText = await replicateRes.text();
    throw new Error(`Replicate start failed (${replicateRes.status}): ${errText}`);
  }

  const prediction = await replicateRes.json();
  return json({ id: prediction.id }, 200, corsHeaders);
}

/* ─── Poll prediction / store result ───────────────────────────────────── */

async function checkPrediction(request, predictionId, env, corsHeaders) {
  const r2Key = `artwork/${predictionId}.png`;

  // Already stored → return immediately
  const existing = await env.ARTWORK_BUCKET.head(r2Key);
  if (existing) {
    const fileUrl = `${new URL(request.url).origin}/file/${r2Key}`;
    return json({ status: 'succeeded', url: fileUrl, key: r2Key }, 200, corsHeaders);
  }

  // Ask Replicate
  const pollRes = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
    headers: { Authorization: `Token ${env.REPLICATE_API_TOKEN}` },
  });

  if (!pollRes.ok) {
    throw new Error(`Replicate poll failed (${pollRes.status})`);
  }

  const prediction = await pollRes.json();

  if (prediction.status === 'failed') {
    return json({ status: 'failed', error: prediction.error || 'Unknown error' }, 200, corsHeaders);
  }

  if (prediction.status !== 'succeeded') {
    return json({ status: prediction.status }, 200, corsHeaders);
  }

  // Succeeded — stream output image from Replicate directly into R2
  const outputUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
  if (!outputUrl) throw new Error('Replicate returned no output URL');

  const imgRes = await fetch(outputUrl);
  if (!imgRes.ok) throw new Error(`Failed to fetch result from Replicate (${imgRes.status})`);

  // Stream directly to R2 — no ArrayBuffer needed
  await env.ARTWORK_BUCKET.put(r2Key, imgRes.body, {
    httpMetadata: { contentType: 'image/png' },
  });

  const fileUrl = `${new URL(request.url).origin}/file/${r2Key}`;
  return json({ status: 'succeeded', url: fileUrl, key: r2Key }, 200, corsHeaders);
}

/* ─── Serve file from R2 ───────────────────────────────────────────────── */

async function serveFile(rawKey, env, corsHeaders) {
  // Support both full keys and bare filenames
  const key = (rawKey.startsWith('artwork/') || rawKey.startsWith('originals/'))
    ? rawKey
    : `artwork/${rawKey}`;

  const object = await env.ARTWORK_BUCKET.get(key);
  if (!object) {
    return new Response('File not found', { status: 404, headers: corsHeaders });
  }

  return new Response(object.body, {
    headers: {
      ...corsHeaders,
      'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Disposition': 'inline',
    },
  });
}

/* ─── Helper ────────────────────────────────────────────────────────────── */

function json(data, status, corsHeaders) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
