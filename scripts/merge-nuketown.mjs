/**
 * merge-nuketown.mjs
 * - Merges nuketown-bo6 into nuketown in S3
 * - Uploads Metro.jpg and rebuilds metro.json
 */
import fs from 'fs'
import path from 'path'
import { S3Client, CopyObjectCommand, DeleteObjectCommand, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'

const [,, BUCKET, REGION = 'us-east-1'] = process.argv
if (!BUCKET) { console.error('Usage: node merge-nuketown.mjs <bucket> [region]'); process.exit(1) }

const s3 = new S3Client({ region: REGION })
const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname)
const ROOT = path.resolve(SCRIPT_DIR, '..')
const SEED_DIR = path.join(SCRIPT_DIR, 'seed-data')
const STARTER_DIR = path.join(ROOT, 'src', 'assets', 'starter-images')

async function listPrefix(prefix) {
  const keys = []
  let token
  do {
    const res = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix, ContinuationToken: token }))
    for (const o of res.Contents || []) keys.push(o.Key)
    token = res.NextContinuationToken
  } while (token)
  return keys
}

async function copyKey(src, dest) {
  await s3.send(new CopyObjectCommand({ Bucket: BUCKET, CopySource: `${BUCKET}/${src}`, Key: dest }))
  console.log(`  copied: ${src} -> ${dest}`)
}

async function deleteKey(key) {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
  console.log(`  deleted: ${key}`)
}

async function uploadFile(localPath, key) {
  const ext = path.extname(localPath).toLowerCase()
  const mime = { '.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp' }
  const upload = new Upload({ client: s3, params: { Bucket: BUCKET, Key: key, Body: fs.createReadStream(localPath), ContentType: mime[ext] || 'application/octet-stream' } })
  await upload.done()
  console.log(`  uploaded: ${key}`)
}

async function putJson(key, obj) {
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: JSON.stringify(obj, null, 2), ContentType: 'application/json' }))
  console.log(`  ✓ JSON: ${key}`)
}

;(async () => {
  // ── 1. Copy nuketown-bo6 images -> nuketown ─────────────────────────────────
  console.log('\n── Step 1: Copy nuketown-bo6 images -> nuketown ──')
  const bo6Keys = await listPrefix('projects/nuketown-bo6/images/')
  const THUMBNAIL = /-\d+x\d+\.(jpe?g|png)$/i
  const bo6ImageKeys = []
  for (const src of bo6Keys) {
    if (THUMBNAIL.test(src)) { await deleteKey(src); continue }
    const filename = src.split('/').pop()
    const dest = `projects/nuketown/images/${filename}`
    await copyKey(src, dest)
    bo6ImageKeys.push(dest)
    await deleteKey(src)
  }

  // ── 2. Delete nuketown-bo6.json from S3 ────────────────────────────────────
  console.log('\n── Step 2: Remove nuketown-bo6.json from S3 ──')
  await deleteKey('projects/nuketown-bo6.json')

  // ── 3. Rebuild nuketown.json with all images ────────────────────────────────
  console.log('\n── Step 3: Rebuild nuketown.json ──')
  const allNuketownKeys = await listPrefix('projects/nuketown/images/')
  const filteredKeys = allNuketownKeys.filter(k => !THUMBNAIL.test(k))

  const nuketown = JSON.parse(fs.readFileSync(path.join(SEED_DIR, 'nuketown', 'project.json'), 'utf8'))
  nuketown.images = filteredKeys
  delete nuketown._scraped; delete nuketown._archivedImageUrls
  fs.writeFileSync(path.join(SEED_DIR, 'nuketown', 'project.json'), JSON.stringify(nuketown, null, 2))
  await putJson('projects/nuketown.json', nuketown)
  console.log(`  → nuketown: ${filteredKeys.length} images total`)

  // Update seed-data: remove nuketown-bo6
  const bo6Dir = path.join(SEED_DIR, 'nuketown-bo6')
  if (fs.existsSync(bo6Dir)) fs.rmSync(bo6Dir, { recursive: true })
  console.log('  removed seed-data/nuketown-bo6')

  // ── 4. Upload Metro.jpg and update metro.json ───────────────────────────────
  console.log('\n── Step 4: Upload Metro.jpg ──')
  const metroLocal = path.join(STARTER_DIR, 'Metro.jpg')
  if (!fs.existsSync(metroLocal)) { console.warn('  ⚠ Metro.jpg not found in starter-images'); }
  else {
    await uploadFile(metroLocal, 'projects/metro/images/Metro.jpg')
    const metro = JSON.parse(fs.readFileSync(path.join(SEED_DIR, 'metro', 'project.json'), 'utf8'))
    metro.images = ['projects/metro/images/Metro.jpg']
    delete metro._scraped; delete metro._archivedImageUrls
    fs.writeFileSync(path.join(SEED_DIR, 'metro', 'project.json'), JSON.stringify(metro, null, 2))
    await putJson('projects/metro.json', metro)
  }

  console.log('\n✅  Done.')
})()
