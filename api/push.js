// Web Push gönderici (RFC 8291 şifreleme + RFC 8292 VAPID), harici paket kullanmaz.
// Supabase tetikleyicisi (pg_net) buraya { vapid, subs, title, body, url, tag, cleanup_key } gönderir.
// VAPID anahtarları veritabanındaki gizli tabloda durur ve her istekte HTTPS ile gelir.
const crypto = require('crypto');

const SUPABASE_URL = 'https://evdjvraahljpytwagfyd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_sBSQOObiY5b-8scjeDOqSg_la-npD7J';
const ALLOWED_HOSTS = [/(^|\.)fcm\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/,
  /(^|\.)push\.apple\.com$/, /(^|\.)googleapis\.com$/];

const b64u = buf => Buffer.from(buf).toString('base64url');
const unb64u = s => Buffer.from(String(s || ''), 'base64url');
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();

function vapidPrivateKey(V) {
  const pub = unb64u(V.pub);
  return crypto.createPrivateKey({
    key: { kty: 'EC', crv: 'P-256', d: V.priv, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) },
    format: 'jwk'
  });
}

function vapidHeader(endpoint, V) {
  const aud = new URL(endpoint).origin;
  const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const body = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: V.sub || 'mailto:yildizkumlamaboya@gmail.com' }));
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${body}`), { key: vapidPrivateKey(V), dsaEncoding: 'ieee-p1363' });
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${V.pub}`;
}

// aes128gcm içerik şifreleme (tek kayıt)
function encrypt(p256dh, authSecret, payload, fixed) {
  const uaPublic = unb64u(p256dh), auth = unb64u(authSecret);
  const ecdh = crypto.createECDH('prime256v1');
  if (fixed && fixed.asPrivate) ecdh.setPrivateKey(unb64u(fixed.asPrivate)); else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const secret = ecdh.computeSecret(uaPublic);
  const salt = fixed && fixed.salt ? unb64u(fixed.salt) : crypto.randomBytes(16);
  const prkKey = hmac(auth, secret);
  const ikm = hmac(prkKey, Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01', 'binary')).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01', 'binary')).subarray(0, 12);
  const c = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const ct = Buffer.concat([c.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, ct]);
}

async function sendOne(sub, payload, V) {
  const host = new URL(sub.endpoint).hostname;
  if (!sub.endpoint.startsWith('https://') || !ALLOWED_HOSTS.some(r => r.test(host))) return 400;
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: { Authorization: vapidHeader(sub.endpoint, V), 'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream', TTL: '86400', Urgency: 'high' },
    body: encrypt(sub.p256dh, sub.auth, payload)
  });
  return res.status;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(200).json({ ok: true });
  let data = req.body;
  if (typeof data === 'string') { try { data = JSON.parse(data); } catch (e) { data = {}; } }
  data = data || {};
  const V = data.vapid || {};
  if (!/^[A-Za-z0-9_-]{80,100}$/.test(V.pub || '') || !/^[A-Za-z0-9_-]{40,50}$/.test(V.priv || ''))
    return res.status(400).json({ error: 'anahtar yok' });
  const subs = Array.isArray(data && data.subs) ? data.subs.slice(0, 200) : [];
  const payload = JSON.stringify({ title: String(data.title || 'Yıldız Emanet Stok').slice(0, 120),
    body: String(data.body || '').slice(0, 400), url: String(data.url || './'), tag: String(data.tag || '') });
  const gone = [], result = [];
  await Promise.all(subs.map(async s => {
    try {
      const st = await sendOne(s, payload, V);
      result.push(st);
      if (st === 404 || st === 410) gone.push(s.endpoint);
    } catch (e) { result.push(0); }
  }));
  if (gone.length && data.cleanup_key) {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/rpc/portal_push_gone`, {
        method: 'POST', headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_key: String(data.cleanup_key), p_endpoints: gone })
      });
    } catch (e) { /* yoksay */ }
  }
  res.status(200).json({ sent: result.filter(x => x >= 200 && x < 300).length, statuses: result, gone: gone.length });
};

module.exports.encrypt = encrypt;
