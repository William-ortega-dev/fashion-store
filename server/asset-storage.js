import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const isNetlify = () => process.env.NETLIFY === 'true' || process.env.NETLIFY_DEV === 'true' || Boolean(process.env.NETLIFY_BLOBS_CONTEXT);
const localAssetRoot = path.resolve(process.env.ASSET_PATH || './data/assets');

export function inspectImage(buffer, contentType) {
  const signatures = {
    'image/jpeg': buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff && buffer.at(-2) === 0xff && buffer.at(-1) === 0xd9,
    'image/png': buffer.length >= 33 && buffer.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))
      && buffer.toString('ascii', 12, 16) === 'IHDR' && buffer.readUInt32BE(16) > 0 && buffer.readUInt32BE(20) > 0
      && buffer.toString('ascii', buffer.length - 8, buffer.length - 4) === 'IEND',
    'image/webp': buffer.length >= 30 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.readUInt32LE(4) === buffer.length - 8
      && buffer.toString('ascii', 8, 12) === 'WEBP' && ['VP8 ', 'VP8L', 'VP8X'].includes(buffer.toString('ascii', 12, 16)),
  };
  return Boolean(signatures[contentType]);
}

export function createAssetId() { return randomUUID(); }

export async function saveAsset(tenantId, assetId, contentType, buffer) {
  const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[contentType];
  if (!extension) throw new Error('Formato de imagen no admitido.');
  const key = `${tenantId}/${assetId}.${extension}`;
  if (isNetlify()) {
    const { getStore } = await import('@netlify/blobs');
    await getStore('fashion-store-assets').set(key, buffer, { metadata: { contentType } });
  } else {
    const destination = path.resolve(localAssetRoot, key);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, buffer, { flag: 'wx' });
  }
  return key;
}

export async function readAsset(key) {
  if (isNetlify()) {
    const { getStore } = await import('@netlify/blobs');
    const result = await getStore('fashion-store-assets').getWithMetadata(key, { type: 'arrayBuffer' });
    if (!result) return null;
    return { body: Buffer.from(result.data), contentType: String(result.metadata.contentType || 'application/octet-stream') };
  }
  const source = path.resolve(localAssetRoot, key);
  if (!source.startsWith(localAssetRoot + path.sep)) return null;
  try {
    const body = await fs.readFile(source);
    const contentType = ({ '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' })[path.extname(source)] || 'application/octet-stream';
    return { body, contentType };
  } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

export async function deleteAsset(key) {
  if (isNetlify()) {
    const { getStore } = await import('@netlify/blobs');
    await getStore('fashion-store-assets').delete(key);
    return;
  }
  const destination = path.resolve(localAssetRoot, key);
  if (!destination.startsWith(localAssetRoot + path.sep)) return;
  try { await fs.unlink(destination); } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
