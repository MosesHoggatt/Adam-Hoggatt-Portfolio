/**
 * fix-and-resync.mjs
 *
 * 1. Uploads missed starter images (aquarium, knee-deep, berserk generic BO3 art,
 *    and BO6 / Warzone maps that were never scraped).
 * 2. Creates stub project.json files for the 5 unarchived maps:
 *    warhead, vorkuta, skyline, vault, hijacked-gulag.
 * 3. Scans every projects/<slug>/images/ prefix in S3 and writes the real
 *    image-key list into each project.json, then re-uploads all JSONs.
 *
 * Usage (from scripts/ directory):
 *   node fix-and-resync.mjs <bucket> [region]
 */

import fs from 'fs'
import path from 'path'
import { S3Client, PutObjectCommand, HeadObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'

const [,, BUCKET, REGION = 'us-east-1'] = process.argv
if (!BUCKET) { console.error('Usage: node fix-and-resync.mjs <bucket> [region]'); process.exit(1) }

const s3 = new S3Client({ region: REGION })
const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname)
const ROOT        = path.resolve(SCRIPT_DIR, '..')
const SEED_DIR    = path.join(SCRIPT_DIR, 'seed-data')
const STARTER_DIR = path.join(ROOT, 'src', 'assets', 'starter-images')

const MIME = { '.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.gif':'image/gif','.webp':'image/webp','.json':'application/json' }

// ─── helpers ──────────────────────────────────────────────────────────────────
async function exists(key) {
  try { await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key })); return true } catch { return false }
}

async function uploadLocal(localPath, key) {
  if (await exists(key)) { console.log(`  ⏭ ${key}`); return }
  const ext = path.extname(localPath).toLowerCase()
  const upload = new Upload({ client: s3, params: {
    Bucket: BUCKET, Key: key, Body: fs.createReadStream(localPath),
    ContentType: MIME[ext] || 'application/octet-stream'
  }})
  await upload.done()
  console.log(`  ✓ uploaded: ${key}`)
}

async function uploadJson(key, obj) {
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET, Key: key, Body: JSON.stringify(obj, null, 2), ContentType: 'application/json'
  }))
  console.log(`  ✓ updated JSON: ${key}`)
}

async function listS3Images(slug) {
  const prefix = `projects/${slug}/images/`
  const keys = []
  let token
  do {
    const res = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix, ContinuationToken: token }))
    for (const obj of res.Contents || []) keys.push(obj.Key)
    token = res.NextContinuationToken
  } while (token)
  return keys
}

// ─── 1. Upload missed / unmatched starter images ─────────────────────────────
// Manual slug map for files the auto-matcher can't guess
const MANUAL = {
  'Aqaurium.jpg':                          'aquarium',     // typo in filename
  'kneedeep_00.jpg':                       'knee-deep',    // no hyphen in filename
  'der_shat.png':                          'der-schatten', // already existed but let it try again
  'Call_of_Duty_Black_Ops_III_Artwork_13.jpg': 'berserk',  // generic BO3 art → berserk (no other image)
  'Warzone Gulag.png':                     'hijacked-gulag',
  'COD-BO6-MAPS-CORE-SKYLINE-005.webp':    'skyline',
  'COD-BO6-MAPS-CORE-VAULT-002.webp':      'vault',
  'COD-BO6-MAPS-CORE-VORKUTA-003.webp':    'vorkuta',
  'COD-BO6-MAPS-CORE-WARHEAD-003-400x284.webp': 'warhead',
}

// ─── 2. Stub projects for unarchived maps ────────────────────────────────────
const STUBS = {
  'warhead': {
    title: 'Warhead', slug: 'warhead', date: '2024-10-25',
    categories: ['Call of Duty: Black Ops 6'],
    description: 'Warhead is a multiplayer map in Call of Duty: Black Ops 6.',
    responsibilities: [],
  },
  'vorkuta': {
    title: 'Vorkuta', slug: 'vorkuta', date: '2024-10-25',
    categories: ['Call of Duty: Black Ops 6'],
    description: 'Vorkuta is a multiplayer map in Call of Duty: Black Ops 6.',
    responsibilities: [],
  },
  'skyline': {
    title: 'Skyline', slug: 'skyline', date: '2024-10-25',
    categories: ['Call of Duty: Black Ops 6'],
    description: 'Skyline is a multiplayer map in Call of Duty: Black Ops 6.',
    responsibilities: [],
  },
  'vault': {
    title: 'Vault', slug: 'vault', date: '2024-10-25',
    categories: ['Call of Duty: Black Ops 6'],
    description: 'Vault is a multiplayer map in Call of Duty: Black Ops 6.',
    responsibilities: [],
  },
  'hijacked-gulag': {
    title: 'Hijacked Gulag', slug: 'hijacked-gulag', date: '2020-03-10',
    categories: ['Call of Duty: Warzone'],
    description: 'The Hijacked Gulag is a Warzone gulag map set aboard the Hijacked vessel.',
    responsibilities: [],
  },
}

// ─── main ─────────────────────────────────────────────────────────────────────
;(async () => {
  // Step 1: Upload missed images
  console.log('\n── Step 1: Upload missed starter images ──')
  for (const [fname, slug] of Object.entries(MANUAL)) {
    const local = path.join(STARTER_DIR, fname)
    if (!fs.existsSync(local)) { console.warn(`  ⚠ file not found: ${fname}`); continue }
    const key = `projects/${slug}/images/${fname}`
    console.log(`\n→ ${fname} -> ${slug}`)
    await uploadLocal(local, key)
  }

  // Step 2: Ensure stub project.json exist in seed-data and S3 for unarchived maps
  console.log('\n── Step 2: Create stub project JSONs ──')
  for (const [slug, stub] of Object.entries(STUBS)) {
    const dir = path.join(SEED_DIR, slug)
    fs.mkdirSync(path.join(dir, 'images'), { recursive: true })
    // write locally (so step 3 picks it up)
    fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ ...stub, images: [], createdAt: new Date().toISOString(), _scraped: true }, null, 2))
    console.log(`  ✓ stub written: seed-data/${slug}/project.json`)
  }

  // Step 3: For every slug in seed-data, scan S3 images and rebuild the images array
  console.log('\n── Step 3: Rebuild images arrays from S3 and re-upload JSONs ──')
  const slugs = fs.readdirSync(SEED_DIR).filter(f => fs.statSync(path.join(SEED_DIR,f)).isDirectory())

  for (const slug of slugs) {
    const jsonFile = path.join(SEED_DIR, slug, 'project.json')
    if (!fs.existsSync(jsonFile)) { console.warn(`  ⚠ no JSON for ${slug}`); continue }

    const s3Images = await listS3Images(slug)
    // Filter out WordPress thumbnail resizes (e.g. -400x284.jpg / .png) but keep native .webp
    const THUMBNAIL_RE = /-\d+x\d+\.(jpe?g|png)$/i
    const filtered = s3Images.filter(k => !THUMBNAIL_RE.test(k))

    const data = JSON.parse(fs.readFileSync(jsonFile, 'utf8'))
    data.images = filtered
    delete data._scraped
    delete data._archivedImageUrls

    // Write back locally
    fs.writeFileSync(jsonFile, JSON.stringify(data, null, 2))

    // Re-upload to S3
    const jsonKey = `projects/${slug}.json`
    await uploadJson(jsonKey, data)
    console.log(`     → ${slug}: ${filtered.length} images`)
  }

  console.log('\n✅  All project JSONs updated with real image lists.')
})()
