/**
 * generate-thumbnails.mjs
 *
 * Downloads every image from S3 for all projects, generates compressed
 * thumbnails, and uploads them alongside the originals.
 *
 * Thumbnail convention:
 *   Original:  projects/<slug>/images/<file>
 *   Thumbnail: projects/<slug>/thumbnails/<file>
 *
 * Usage:
 *   node generate-thumbnails.mjs <bucket-name> [region]
 */

import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import sharp from 'sharp'
import path from 'path'

const [,, BUCKET, REGION = 'us-east-1', FLAG] = process.argv
if (!BUCKET) {
  console.error('Usage: node generate-thumbnails.mjs <bucket-name> [region] [--force]')
  process.exit(1)
}
const FORCE = FLAG === '--force'

const s3 = new S3Client({ region: REGION })

const THUMB_WIDTH = 200
const THUMB_QUALITY = 65

const CARD_WIDTH = 800
const CARD_QUALITY = 82

const SUPPORTED_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif'])

async function keyExists(key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }))
    return true
  } catch {
    return false
  }
}

async function listAllKeys(prefix) {
  const keys = []
  let continuationToken
  do {
    const res = await s3.send(new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    }))
    for (const obj of res.Contents || []) {
      keys.push(obj.Key)
    }
    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (continuationToken)
  return keys
}

async function downloadToBuffer(key) {
  const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }))
  const chunks = []
  for await (const chunk of res.Body) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

async function generateAndUploadThumb(imageKey) {
  // Convert projects/<slug>/images/<file> → projects/<slug>/thumbnails/<file>
  const thumbKey = imageKey.replace('/images/', '/thumbnails/')

  if (!FORCE && await keyExists(thumbKey)) {
    console.log(`  ⏭  thumbnail exists: ${thumbKey}`)
    return
  }

  const ext = path.extname(imageKey).toLowerCase()
  if (!SUPPORTED_EXTS.has(ext)) {
    console.log(`  ⏭  unsupported format: ${imageKey}`)
    return
  }

  const buf = await downloadToBuffer(imageKey)

  let pipeline = sharp(buf).resize({ width: THUMB_WIDTH, withoutEnlargement: true })

  let contentType = 'image/jpeg'
  let outputBuf
  if (ext === '.png') {
    outputBuf = await pipeline.png({ quality: THUMB_QUALITY }).toBuffer()
    contentType = 'image/png'
  } else if (ext === '.webp') {
    outputBuf = await pipeline.webp({ quality: THUMB_QUALITY }).toBuffer()
    contentType = 'image/webp'
  } else if (ext === '.gif') {
    outputBuf = await pipeline.gif().toBuffer()
    contentType = 'image/gif'
  } else {
    outputBuf = await pipeline.jpeg({ quality: THUMB_QUALITY }).toBuffer()
    contentType = 'image/jpeg'
  }

  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: thumbKey,
    Body: outputBuf,
    ContentType: contentType,
    CacheControl: 'public, max-age=31536000, immutable',
  }))

  const ratio = ((outputBuf.length / buf.length) * 100).toFixed(0)
  console.log(`  ✓ ${thumbKey} (${ratio}% of original)`)
}

async function generateAndUploadCard(imageKey) {
  // Convert projects/<slug>/images/<file> → projects/<slug>/card/<file>
  const cardKey = imageKey.replace('/images/', '/card/')

  if (!FORCE && await keyExists(cardKey)) {
    console.log(`  ⏭  card exists: ${cardKey}`)
    return
  }

  const ext = path.extname(imageKey).toLowerCase()
  if (!SUPPORTED_EXTS.has(ext)) return

  const buf = await downloadToBuffer(imageKey)
  let pipeline = sharp(buf).resize({ width: CARD_WIDTH, withoutEnlargement: true })

  let contentType = 'image/jpeg'
  let outputBuf
  if (ext === '.png') {
    outputBuf = await pipeline.png({ quality: CARD_QUALITY }).toBuffer()
    contentType = 'image/png'
  } else if (ext === '.webp') {
    outputBuf = await pipeline.webp({ quality: CARD_QUALITY }).toBuffer()
    contentType = 'image/webp'
  } else if (ext === '.gif') {
    outputBuf = await pipeline.gif().toBuffer()
    contentType = 'image/gif'
  } else {
    outputBuf = await pipeline.jpeg({ quality: CARD_QUALITY }).toBuffer()
    contentType = 'image/jpeg'
  }

  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: cardKey,
    Body: outputBuf,
    ContentType: contentType,
    CacheControl: 'public, max-age=31536000, immutable',
  }))

  const ratio = ((outputBuf.length / buf.length) * 100).toFixed(0)
  console.log(`  ✓ ${cardKey} (${ratio}% of original)`)
}

;(async () => {
  console.log(`Generating thumbnails for s3://${BUCKET} (${REGION})\n`)

  // List all image objects under projects/*/images/
  const allKeys = await listAllKeys('projects/')
  const imageKeys = allKeys.filter(k => k.includes('/images/') && SUPPORTED_EXTS.has(path.extname(k).toLowerCase()))

  console.log(`Found ${imageKeys.length} images to process\n`)

  let created = 0
  let skipped = 0
  for (const key of imageKeys) {
    try {
      const thumbKey = key.replace('/images/', '/thumbnails/')
      const cardKey  = key.replace('/images/', '/card/')
      const thumbExists = !FORCE && await keyExists(thumbKey)
      const cardExists  = !FORCE && await keyExists(cardKey)

      if (thumbExists) { skipped++; console.log(`  ⏭  ${thumbKey}`) }
      else { await generateAndUploadThumb(key); created++ }

      if (cardExists) { console.log(`  ⏭  ${cardKey}`) }
      else { await generateAndUploadCard(key); created++ }
    } catch (err) {
      console.error(`  ✗ Failed: ${key}`, err.message)
    }
  }

  console.log(`\n✅  Done. Created: ${created}, Skipped: ${skipped}`)
})()
