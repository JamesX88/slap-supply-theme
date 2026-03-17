/**
 * SLAP SUPPLY — Background Removal Worker
 *
 * Endpoints:
 *   POST /remove-bg   { image: "data:image/...;base64,..." }  → { id: "replicate-prediction-id" }
 *   GET  /check/:id                                            → { status, key? }
 *   GET  /file/:key                                            → image/png (served from R2)
 *
 * Environment variables (set via `wrangler secret put`):
 *   REPLICATE_API_TOKEN  — Your Replicate API token
 *   ALLOWED_ORIGIN       — Your Shopify store URL, e.g. https://slap-supply.myshopify.com
 *
 * R2 binding (configured in wrangler.toml):
 *   ARTWORK_BUCKET       — R2 bucket for storing processed artwork
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const corsHeaders = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
      // POST /remove-bg — start a Replicate background removal prediction
      if (url.pathname === '/remove-bg' && request.method === 'POST') {
        return await startRemoveBg(request, env, corsHeaders);
      }

      // GET /check/:predictionId — poll prediction status; store result in R2 when done
      const checkMatch = url.pathname.match(/^\/check\/([^/]+)$/);
      if (checkMatch && request.method === 'GET') {
        return await checkPrediction(request, checkMatch[1], env, corsHeaders);
      }

      // GET /file/:key — serve artwork from R2
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

/* ─── Start prediction ─────────────────────────────────────────────────── */

async function startRemoveBg(request, env, corsHeaders) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, corsHeaders);
  }

  if (!body.image) {
    return json({ error: 'Missing "image" field (base64 data URL or HTTPS URL)' }, 400, corsHeaders);
  }

  // lucataco/remove-bg version-based endpoint
  const replicateRes = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      Authorization: `Token ${env.REPLICATE_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      version: '95fcc2a26d3899cd6c2691c900465aaeff466285a65c14638cc5f36f34befaf1',
      input: { image: body.image },
    }),
  });

  if (!replicateRes.ok) {
    const errText = await replicateRes.text();
    throw new Error(`Replicate start failed (${replicateRes.status}): ${errText}`);
  }

  const prediction = await replicateRes.json();
  return json({ id: prediction.id }, 200, corsHeaders);
}

/* ─── Poll / store ─────────────────────────────────────────────────────── */

async function checkPrediction(request, predictionId, env, corsHeaders) {
  // If we already uploaded this to R2, return immediately
  const r2Key = `artwork/${predictionId}.png`;
  const existing = await env.ARTWORK_BUCKET.head(r2Key);
  if (existing) {
    const fileUrl = `${new URL(request.url).origin}/file/${r2Key}`;
    return json({ status: 'succeeded', url: fileUrl, key: r2Key }, 200, corsHeaders);
  }

  // Ask Replicate for status
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
    // Still processing — return status so client keeps polling
    return json({ status: prediction.status }, 200, corsHeaders);
  }

  // Succeeded — fetch output image and store in R2
  const outputUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
  if (!outputUrl) {
    throw new Error('Replicate returned no output URL');
  }

  const imgRes = await fetch(outputUrl);
  if (!imgRes.ok) {
    throw new Error(`Failed to fetch processed image from Replicate (${imgRes.status})`);
  }

  const imgBuffer = await imgRes.arrayBuffer();
  await env.ARTWORK_BUCKET.put(r2Key, imgBuffer, {
    httpMetadata: { contentType: 'image/png' },
  });

  const fileUrl = `${new URL(request.url).origin}/file/${r2Key}`;
  return json({ status: 'succeeded', url: fileUrl, key: r2Key }, 200, corsHeaders);
}

/* ─── Serve file from R2 ───────────────────────────────────────────────── */

async function serveFile(rawKey, env, corsHeaders) {
  // Accept both 'artwork/xxx.png' and bare 'xxx.png'
  const key = rawKey.startsWith('artwork/') ? rawKey : `artwork/${rawKey}`;
  const object = await env.ARTWORK_BUCKET.get(key);

  if (!object) {
    return new Response('File not found', { status: 404, headers: corsHeaders });
  }

  return new Response(object.body, {
    headers: {
      ...corsHeaders,
      'Content-Type': object.httpMetadata?.contentType || 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Disposition': 'inline',
    },
  });
}

/* ─── Helper ───────────────────────────────────────────────────────────── */

function json(data, status, corsHeaders) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
