/**
 * fix-cache-headers.mjs
 *
 * Backfills `Cache-Control: public, max-age=31536000, immutable` on all
 * existing full-size images in S3 (projects/*/images/*).
 * Thumbnails already have this header; only full images need updating.
 *
 * Uses copy-in-place (same src/dst) with MetadataDirective: REPLACE.
 *
 * Usage (from scripts/ directory):
 *   node fix-cache-headers.mjs <bucket> [region]
 */

import {
  S3Client,
  ListObjectsV2Command,
  CopyObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3'

const [,, BUCKET, REGION = 'us-east-1'] = process.argv
if (!BUCKET) {
  console.error('Usage: node fix-cache-headers.mjs <bucket> [region]')
  process.exit(1)
}

const s3 = new S3Client({ region: REGION })

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif'])
const MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif',
}
const TARGET_CC = 'public, max-age=31536000, immutable'

async function listAllKeys(prefix) {
  const keys = []
  let token
  do {
    const res = await s3.send(new ListObjectsV2Command({
      Bucket: BUCKET, Prefix: prefix, ContinuationToken: token,
    }))
    for (const obj of res.Contents || []) keys.push(obj.Key)
    token = res.NextContinuationToken
  } while (token)
  return keys
}

async function getContentType(key) {
  const ext = key.slice(key.lastIndexOf('.')).toLowerCase()
  return MIME[ext] || 'image/jpeg'
}

;(async () => {
  console.log(`Scanning s3://${BUCKET}/projects/*/images/ …\n`)

  const allKeys = await listAllKeys('projects/')

  const imageKeys = allKeys.filter(k => {
    const ext = k.slice(k.lastIndexOf('.')).toLowerCase()
    // only full images, not thumbnails
    return k.includes('/images/') && IMAGE_EXTS.has(ext)
  })

  console.log(`Found ${imageKeys.length} full-size images to update.\n`)

  let updated = 0
  let skipped = 0

  for (const key of imageKeys) {
    // Check current header
    const head = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }))
    if (head.CacheControl === TARGET_CC) {
      skipped++
      continue
    }

    const contentType = head.ContentType || await getContentType(key)

    // Copy in-place with new metadata
    await s3.send(new CopyObjectCommand({
      Bucket: BUCKET,
      CopySource: `${BUCKET}/${key}`,
      Key: key,
      MetadataDirective: 'REPLACE',
      ContentType: contentType,
      CacheControl: TARGET_CC,
    }))

    console.log(`  ✓ ${key}`)
    updated++
  }

  console.log(`\nDone. Updated: ${updated}  Already correct: ${skipped}`)
})()
