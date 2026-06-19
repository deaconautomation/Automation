// Simple in-memory rate limiter. Works per warm lambda instance.
// For multi-instance deployments this is best-effort, not strict.
const windows = new Map();

/**
 * @param {string} key      — usually the client IP
 * @param {number} limit    — max requests allowed in the window
 * @param {number} windowMs — rolling window size in ms
 * @returns {boolean} true if the request is allowed
 */
function allow(key, limit = 20, windowMs = 60_000) {
  const now = Date.now();
  const entry = windows.get(key) || { count: 0, start: now };

  if (now - entry.start > windowMs) {
    entry.count = 1;
    entry.start = now;
  } else {
    entry.count += 1;
  }

  windows.set(key, entry);
  return entry.count <= limit;
}

function getIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

module.exports = { allow, getIp };
