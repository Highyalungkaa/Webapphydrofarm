const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function setup(initialBucket = null) {
  const routes = new Map();
  const calls = [];
  let bucket = initialBucket;
  const router = { use() {}, get() {}, put() {}, delete() {}, post(url, handler) { routes.set(url, handler); } };
  const storage = {
    async getBucket() {
      return bucket ? { data: bucket, error: null } : { data: null, error: { status: 404 } };
    },
    async createBucket(id, options) {
      calls.push(['create', id, options]);
      bucket = { public: options.public, file_size_limit: options.fileSizeLimit, allowed_mime_types: options.allowedMimeTypes };
      return { data: { name: id }, error: null };
    },
    async updateBucket(id, options) {
      calls.push(['update', id, options]);
      bucket = { public: options.public, file_size_limit: options.fileSizeLimit, allowed_mime_types: options.allowedMimeTypes };
      return { data: {}, error: null };
    },
    from(id) {
      return {
        async upload(filePath, buffer, options) {
          calls.push(['upload', id, filePath, options.contentType, buffer.length]);
          return { error: null };
        },
        getPublicUrl(filePath) { return { data: { publicUrl: `https://example.test/${id}/${filePath}` } }; },
      };
    },
  };
  const filename = path.resolve(__dirname, '../src/routes/admin/crops.ts');
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports, Buffer,
    require(name) {
      if (name === 'express') return { Router: () => router };
      if (name.endsWith('/supabase.js')) return { supabaseAdmin: { storage } };
      if (name.endsWith('/auth.js')) return {};
      if (name.endsWith('/audit.js')) return {};
      return require(name);
    },
  }, { filename });
  return {
    calls,
    async upload(mimeType, content) {
      const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } };
      await routes.get('/image')({ body: { mime_type: mimeType, data: Buffer.from(content).toString('base64') } }, res);
      return res;
    },
  };
}

test('SVG upload creates a missing public crop image bucket', async () => {
  const app = setup();
  const res = await app.upload('image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle r="5"/></svg>');
  assert.equal(res.statusCode, 201);
  assert.match(res.body.image_url, /\.svg$/);
  assert.equal(app.calls[0][0], 'create');
  assert.ok(app.calls[0][2].allowedMimeTypes.includes('image/svg+xml'));
  assert.equal(app.calls[1][0], 'upload');
});

test('SVG upload enables the MIME type on an existing crop image bucket', async () => {
  const app = setup({ public: true, file_size_limit: 5242880, allowed_mime_types: ['image/png'] });
  const res = await app.upload('image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg"/>');
  assert.equal(res.statusCode, 201);
  assert.equal(app.calls[0][0], 'update');
  assert.ok(app.calls[0][2].allowedMimeTypes.includes('image/svg+xml'));
});

test('active SVG content is rejected before upload', async () => {
  const app = setup();
  const res = await app.upload('image/svg+xml', '<svg><script>alert(1)</script></svg>');
  assert.equal(res.statusCode, 400);
  assert.equal(app.calls.length, 0);
});
