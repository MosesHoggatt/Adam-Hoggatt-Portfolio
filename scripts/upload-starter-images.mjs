import fs from 'fs'
import path from 'path'
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'

const [,, BUCKET, REGION = 'us-east-1'] = process.argv
if (!BUCKET) {
  console.error('Usage: node upload-starter-images.mjs <bucket-name> [region]')
  process.exit(1)
}

const s3 = new S3Client({ region: REGION })
const SEED_DIR = new URL('./seed-data', import.meta.url).pathname

// compute repository root by taking script directory then going up one level
const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname)
const ROOT = path.resolve(SCRIPT_DIR, '..')
const STARTER_DIR = path.join(ROOT, 'src', 'assets', 'starter-images')
console.log('ROOT =', ROOT)
console.log('STARTER_DIR =', STARTER_DIR)

const MIME = {
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png':  'image/png',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
}

async function keyExists(key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }))
    return true
  } catch {
    return false
  }
}

async function uploadFile(localPath, s3Key) {
  if (await keyExists(s3Key)) {
    console.log(`  ⏭ already exists: ${s3Key}`)
    return
  }
  const ext = path.extname(localPath).toLowerCase()
  const contentType = MIME[ext] || 'application/octet-stream'
  const body = fs.createReadStream(localPath)
  const upload = new Upload({ client: s3, params: { Bucket: BUCKET, Key: s3Key, Body: body, ContentType: contentType } })
  await upload.done()
  console.log(`  ✓ uploaded: ${s3Key}`)
}

// load slugs from seed-data
const slugs = fs.readdirSync(SEED_DIR).filter(f => fs.statSync(path.join(SEED_DIR,f)).isDirectory())
console.log('Found slugs:', slugs.join(', '))

function matchSlug(filename) {
  const low = filename.toLowerCase()
  const candidates = slugs.filter(s => low.includes(s.toLowerCase()))
  if (candidates.length === 1) return candidates[0]
  if (candidates.length > 1) {
    // choose longest match
    return candidates.sort((a,b)=>b.length-a.length)[0]
  }
  return null
}

(async () => {
  const files = fs.readdirSync(STARTER_DIR).filter(f=>fs.statSync(path.join(STARTER_DIR,f)).isFile())
  console.log(`Found ${files.length} starter images`)
  for (const fname of files) {
    const slug = matchSlug(fname)
    if (!slug) {
      console.warn('No slug match for', fname)
      continue
    }
    const local = path.join(STARTER_DIR, fname)
    const key = `projects/${slug}/images/${fname}`
    console.log(`\n→ ${fname} -> slug ${slug}`)
    await uploadFile(local, key)
  }
  console.log('\nDone uploading starter images.')
})()
