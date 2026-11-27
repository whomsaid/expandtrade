import zlib from 'node:zlib';

const COMPRESSIBLE_CONTENT_TYPE = /^(text\/|application\/(json|javascript|ecmascript|xml|xhtml\+xml|rss\+xml|atom\+xml|wasm|manifest\+json)|image\/svg\+xml)/i;

export function httpCompressionMiddleware(req, res, next) {
  if (req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  if (req.headers.range) return next();
  if (req.path.startsWith('/uploads') || req.path.includes('/stream')) return next();

  const acceptEncoding = String(req.headers['accept-encoding'] || '');
  const encoding = acceptEncoding.includes('br')
    ? 'br'
    : acceptEncoding.includes('gzip')
      ? 'gzip'
      : acceptEncoding.includes('deflate')
        ? 'deflate'
        : null;

  if (!encoding) return next();

  const origWriteHead = res.writeHead.bind(res);
  const origWrite = res.write.bind(res);
  const origEnd = res.end.bind(res);

  let decided = false;
  let compressor = null;
  let buffered = [];
  let bufferedBytes = 0;
  let pendingWriteHeadArgs = null;

  const ensureVary = () => {
    if (res.headersSent) return;
    const existingVary = res.getHeader('Vary');
    if (!existingVary) {
      res.setHeader('Vary', 'Accept-Encoding');
    } else if (!String(existingVary).toLowerCase().includes('accept-encoding')) {
      res.setHeader('Vary', `${existingVary}, Accept-Encoding`);
    }
  };

  const commitHead = () => {
    res.writeHead = origWriteHead;
    if (res.headersSent) {
      pendingWriteHeadArgs = null;
      return;
    }
    if (pendingWriteHeadArgs) {
      const { statusCode, statusMessage } = pendingWriteHeadArgs;
      pendingWriteHeadArgs = null;
      if (typeof statusMessage === 'string') {
        origWriteHead(statusCode, statusMessage);
      } else {
        origWriteHead(statusCode);
      }
    }
  };

  const shouldCompress = () => {
    if (res.headersSent) return false;
    if (res.statusCode === 204 || res.statusCode === 304) return false;
    if (res.getHeader('Content-Encoding')) return false;
    const ctype = String(res.getHeader('Content-Type') || '');
    if (!ctype || !COMPRESSIBLE_CONTENT_TYPE.test(ctype)) return false;
    return true;
  };

  const initCompressor = () => {
    if (decided) return;
    decided = true;
    ensureVary();

    if (!shouldCompress()) {
      res.write = origWrite;
      res.end = origEnd;
      commitHead();
      for (const chunk of buffered) {
        origWrite(chunk);
      }
      buffered = [];
      return;
    }

    if (!res.headersSent) {
      res.removeHeader('Content-Length');
      res.setHeader('Content-Encoding', encoding);
    }
    commitHead();

    if (encoding === 'br') {
      compressor = zlib.createBrotliCompress({
        params: {
          [zlib.constants.BROTLI_PARAM_QUALITY]: 4,
        },
      });
    } else if (encoding === 'gzip') {
      compressor = zlib.createGzip({ level: 6 });
    } else {
      compressor = zlib.createDeflate({ level: 6 });
    }

    compressor.on('data', (chunk) => {
      origWrite(chunk);
    });
    compressor.on('end', () => {
      origEnd();
    });
    compressor.on('error', () => {
      origEnd();
    });

    for (const chunk of buffered) {
      compressor.write(chunk);
    }
    buffered = [];
  };

  res.writeHead = (statusCode, statusMessage, headers) => {
    res.statusCode = statusCode;
    let hdrs = headers;
    let msg = undefined;
    if (typeof statusMessage === 'object' && statusMessage !== null) {
      hdrs = statusMessage;
    } else if (typeof statusMessage === 'string') {
      msg = statusMessage;
      res.statusMessage = statusMessage;
    }
    if (hdrs && !res.headersSent) {
      for (const [k, v] of Object.entries(hdrs)) {
        res.setHeader(k, v);
      }
    }
    const ctype = String(res.getHeader('Content-Type') || '');
    if (ctype.includes('text/event-stream')) {
      decided = true;
      res.writeHead = origWriteHead;
      res.write = origWrite;
      res.end = origEnd;
      return typeof msg === 'string' ? origWriteHead(res.statusCode, msg) : origWriteHead(res.statusCode);
    }
    pendingWriteHeadArgs = { statusCode: res.statusCode, statusMessage: msg };
    return res;
  };

  res.write = (chunk, enc, cb) => {
    if (typeof enc === 'function') {
      cb = enc;
      enc = undefined;
    }
    if (chunk === undefined || chunk === null) {
      if (typeof cb === 'function') cb();
      return true;
    }
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), typeof enc === 'string' ? enc : 'utf8');
    if (!decided) {
      buffered.push(buf);
      bufferedBytes += buf.length;
      if (bufferedBytes >= 1024) {
        initCompressor();
      }
      if (typeof cb === 'function') cb();
      return true;
    }
    if (compressor) {
      return compressor.write(buf, cb);
    }
    return origWrite(buf, cb);
  };

  res.end = (chunk, enc, cb) => {
    if (typeof chunk === 'function') {
      cb = chunk;
      chunk = undefined;
      enc = undefined;
    } else if (typeof enc === 'function') {
      cb = enc;
      enc = undefined;
    }
    if (chunk !== undefined && chunk !== null) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), typeof enc === 'string' ? enc : 'utf8');
      if (!decided) {
        buffered.push(buf);
        bufferedBytes += buf.length;
      } else if (compressor) {
        compressor.write(buf);
      } else {
        origWrite(buf);
      }
    }

    if (!decided) {
      // Skip compression for tiny responses under 512 bytes or 204/304
      if (bufferedBytes < 512 || res.statusCode === 204 || res.statusCode === 304) {
        decided = true;
        res.write = origWrite;
        res.end = origEnd;
        ensureVary();
        commitHead();
        const payload = buffered.length === 1 ? buffered[0] : buffered.length > 1 ? Buffer.concat(buffered) : undefined;
        buffered = [];
        return payload !== undefined ? origEnd(payload, cb) : origEnd(cb);
      }
      initCompressor();
    }

    if (compressor) {
      if (typeof cb === 'function') {
        compressor.once('end', cb);
      }
      compressor.end();
      return res;
    }
    return origEnd(cb);
  };

  next();
}
