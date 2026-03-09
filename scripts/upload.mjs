/**
 * upload.mjs
 *
 * Uploads all scraped seed data to S3 in the correct structure for the portfolio site.
 *
 * Usage:
 *   node upload.mjs <bucket-name> <region>
 *
 * Uses the AWS credentials in your environment (AWS_PROFILE, AWS_ACCESS_KEY_ID, etc.)
 * Mirrors the S3 structure the portfolio expects:
 *   projects/<slug>.json
 *   projects/<slug>/images/<filename>
 */

import fs from 'fs'
import path from 'path'
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import sharp from 'sharp'

const [,, BUCKET, REGION = 'us-east-1'] = process.argv

if (!BUCKET) {
  console.error('Usage: node upload.mjs <bucket-name> [region]')
  process.exit(1)
}

const s3 = new S3Client({ region: REGION })
const SEED_DIR = new URL('./seed-data', import.meta.url).pathname

const MIME = {
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png':  'image/png',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.json': 'application/json',
}

async function keyExists(key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }))
    return true
  } catch {
    return false
  }
}

const THUMB_WIDTH = 200
const THUMB_QUALITY = 65
const SUPPORTED_IMG_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp'])

async function uploadThumb(localPath, s3Key) {
  const thumbKey = s3Key.replace('/images/', '/thumbnails/')
  if (await keyExists(thumbKey)) {
    console.log(`  ⏭  thumbnail exists: ${thumbKey}`)
    return
  }
  const ext = path.extname(localPath).toLowerCase()
  if (!SUPPORTED_IMG_EXTS.has(ext)) return

  try {
    let pipeline = sharp(localPath).resize({ width: THUMB_WIDTH, withoutEnlargement: true })
    let buf, contentType
    if (ext === '.png') {
      buf = await pipeline.png({ quality: THUMB_QUALITY }).toBuffer()
      contentType = 'image/png'
    } else if (ext === '.webp') {
      buf = await pipeline.webp({ quality: THUMB_QUALITY }).toBuffer()
      contentType = 'image/webp'
    } else {
      buf = await pipeline.jpeg({ quality: THUMB_QUALITY }).toBuffer()
      contentType = 'image/jpeg'
    }
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET, Key: thumbKey, Body: buf, ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    }))
    console.log(`  ✓ thumbnail: ${thumbKey}`)
  } catch (err) {
    console.warn(`  ⚠ thumbnail failed: ${thumbKey}`, err.message)
  }
}

async function uploadFile(localPath, s3Key) {
  if (await keyExists(s3Key)) {
    console.log(`  ⏭  already exists: ${s3Key}`)
    return
  }

  const ext = path.extname(localPath).toLowerCase()
  const contentType = MIME[ext] || 'application/octet-stream'
  const body = fs.createReadStream(localPath)

  const upload = new Upload({
    client: s3,
    params: {
      Bucket: BUCKET,
      Key: s3Key,
      Body: body,
      ContentType: contentType,
    },
  })

  await upload.done()
  console.log(`  ✓ uploaded: ${s3Key}`)
}

;(async () => {
  if (!fs.existsSync(SEED_DIR)) {
    console.error('No seed-data directory found. Run  node scrape.mjs  first.')
    process.exit(1)
  }

  const slugDirs = fs.readdirSync(SEED_DIR).filter(f =>
    fs.statSync(path.join(SEED_DIR, f)).isDirectory()
  )

  console.log(`Uploading ${slugDirs.length} projects to s3://${BUCKET}  (${REGION})\n`)

  for (const slug of slugDirs) {
    const projectDir = path.join(SEED_DIR, slug)
    const jsonFile   = path.join(projectDir, 'project.json')

    if (!fs.existsSync(jsonFile)) {
      console.warn(`⚠  No project.json for ${slug}, skipping`)
      continue
    }

    console.log(`\n→ ${slug}`)

    // Upload project JSON to projects/<slug>.json
    // Strip the internal _scraped flag before uploading
    const data = JSON.parse(fs.readFileSync(jsonFile, 'utf8'))
    delete data._scraped
    const cleanJson = JSON.stringify(data, null, 2)

    const jsonKey = `projects/${slug}.json`
    if (await keyExists(jsonKey)) {
      console.log(`  ⏭  already exists: ${jsonKey}`)
    } else {
      await s3.send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: jsonKey,
        Body: cleanJson,
        ContentType: 'application/json',
      }))
      console.log(`  ✓ uploaded: ${jsonKey}`)
    }

    // Upload all images
    const imagesDir = path.join(projectDir, 'images')
    if (fs.existsSync(imagesDir)) {
      const imageFiles = fs.readdirSync(imagesDir)
      for (const filename of imageFiles) {
        const localPath = path.join(imagesDir, filename)
        const s3Key     = `projects/${slug}/images/${filename}`
        await uploadFile(localPath, s3Key)
        await uploadThumb(localPath, s3Key)
      }
    }
  }

  console.log('\n✅  Upload complete.')
  console.log(`    Update aws-exports.js with bucket="${BUCKET}" region="${REGION}" and refresh the site.`)
})()
