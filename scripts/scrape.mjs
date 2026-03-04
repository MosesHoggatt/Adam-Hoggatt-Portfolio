/**
 * scrape.mjs
 *
 * Fetches all project pages from the Wayback Machine, extracts titles,
 * descriptions, responsibilities, and images, downloads the images, and
 * writes everything to  scripts/seed-data/<slug>/
 *
 * Usage (from scripts/ directory):
 *   node scrape.mjs
 *
 * Outputs:
 *   seed-data/<slug>/project.json
 *   seed-data/<slug>/images/<filename>
 */

import fs from 'fs'
import path from 'path'
import { load } from 'cheerio'
import { pipeline } from 'stream/promises'

// ─── project catalogue ────────────────────────────────────────────────────────
// snapshot: the wayback timestamp that has the best capture for this project page
const PROJECTS = [
  // Black Ops 6  (released Oct 2024 — use May 2025 capture)
  { snapshot: '20250520042126', urlPath: 'nuketown',     slug: 'nuketown-bo6',  date: '2024-10-25', categories: ['Call of Duty: Black Ops 6'], title: 'Nuketown (Black Ops 6)' },
  // warhead/vorkuta/skyline/vault not captured in archive — skip
  // { slug: 'warhead' }, { slug: 'vorkuta' }, { slug: 'skyline' }, { slug: 'vault' },
  // Black Ops Cold War / Warzone
  { snapshot: '20240621033227', urlPath: '2425',         slug: 'echelon',       date: '2020-11-13', categories: ['Call of Duty: Black Ops Cold War'] },
  // hijacked-gulag not captured in archive — skip
  // { slug: 'hijacked-gulag' },
  { snapshot: '20240621',       urlPath: '2355',         slug: 'cartel',        date: '2020-11-13', categories: ['Call of Duty: Black Ops Cold War'] },
  { snapshot: '20240621033227', urlPath: '2331',         slug: 'moscow',        date: '2020-09-08', categories: ['Call of Duty: Black Ops Cold War'] },
  // Black Ops 4
  { snapshot: '20240417',       urlPath: '2199',         slug: 'der-schatten',  date: '2018-10-12', categories: ['Call of Duty: Black Ops 4'] },
  { snapshot: '20240723114653', urlPath: '2178',         slug: 'remnant',       date: '2018-10-12', categories: ['Call of Duty: Black Ops 4'] },
  { snapshot: '20240723111543', urlPath: '2164',         slug: 'lockup',        date: '2018-10-12', categories: ['Call of Duty: Black Ops 4'] },
  { snapshot: '20240417',       urlPath: '2155',         slug: 'masquerade',    date: '2018-10-12', categories: ['Call of Duty: Black Ops 4'] },
  { snapshot: '20240417',       urlPath: '2009',         slug: 'frequency',     date: '2018-10-12', categories: ['Call of Duty: Black Ops 4'] },
  { snapshot: '20240417',       urlPath: '1980',         slug: 'contraband',    date: '2018-10-12', categories: ['Call of Duty: Black Ops 4'] },
  // Black Ops 3
  { snapshot: '20240417',       urlPath: '2053',         slug: 'micro',         date: '2015-11-06', categories: ['Call of Duty: Black Ops 3'] },
  { snapshot: '20240417',       urlPath: '2042',         slug: 'citadel',       date: '2015-11-06', categories: ['Call of Duty: Black Ops 3'] },
  { snapshot: '20240417',       urlPath: '2024',         slug: 'spire',         date: '2015-11-06', categories: ['Call of Duty: Black Ops 3'] },
  { snapshot: '20240417',       urlPath: 'berserk',      slug: 'berserk',       date: '2015-11-06', categories: ['Call of Duty: Black Ops 3'] },
  { snapshot: '20240417',       urlPath: 'gauntlet',     slug: 'gauntlet',      date: '2015-11-06', categories: ['Call of Duty: Black Ops 3'] },
  { snapshot: '20240417',       urlPath: 'metro',        slug: 'metro',         date: '2015-11-06', categories: ['Call of Duty: Black Ops 3'] },
  { snapshot: '20240417',       urlPath: 'aquarium',     slug: 'aquarium',      date: '2015-11-06', categories: ['Call of Duty: Black Ops 3'] },
  { snapshot: '20240417',       urlPath: '1924',         slug: 'redwood',       date: '2015-11-06', categories: ['Call of Duty: Black Ops 3'] },
  // Black Ops 2
  { snapshot: '20240417',       urlPath: 'frost',        slug: 'frost',         date: '2012-11-13', categories: ['Call of Duty: Black Ops 2'] },
  { snapshot: '20240417',       urlPath: 'encore',       slug: 'encore',        date: '2012-11-13', categories: ['Call of Duty: Black Ops 2'] },
  { snapshot: '20240621043705', urlPath: 'raid',         slug: 'raid',          date: '2012-11-13', categories: ['Call of Duty: Black Ops 2', 'Call of Duty: Black Ops 3', 'Call of Duty: Black Ops 4', 'Call of Duty: Black Ops Cold War'] },
  { snapshot: '20240417',       urlPath: 'overflow',     slug: 'overflow',      date: '2012-11-13', categories: ['Call of Duty: Black Ops 2'] },
  { snapshot: '20240417',       urlPath: 'meltdown',     slug: 'meltdown',      date: '2012-11-13', categories: ['Call of Duty: Black Ops 2'] },
  // Black Ops 1
  { snapshot: '20240417',       urlPath: 'drive-in',     slug: 'drive-in',      date: '2010-11-09', categories: ['Call of Duty: Black Ops', 'Call of Duty: Black Ops Cold War'] },
  { snapshot: '20240417',       urlPath: 'discovery',    slug: 'discovery',     date: '2010-11-09', categories: ['Call of Duty: Black Ops'] },
  { snapshot: '20240417',       urlPath: 'cracked',      slug: 'cracked',       date: '2010-11-09', categories: ['Call of Duty: Black Ops'] },
  { snapshot: '20240723120915', urlPath: 'nuketown',     slug: 'nuketown',      date: '2010-11-09', categories: ['Call of Duty: Black Ops', 'Call of Duty: Black Ops 2', 'Call of Duty: Black Ops 3', 'Call of Duty: Black Ops 4', 'Call of Duty: Black Ops 6'] },
  { snapshot: '20240417',       urlPath: 'radiation',    slug: 'radiation',     date: '2010-11-09', categories: ['Call of Duty: Black Ops'] },
  // World at War
  { snapshot: '20240417',       urlPath: 'knee-deep',    slug: 'knee-deep',     date: '2008-11-11', categories: ['Call of Duty: World at War'] },
  { snapshot: '20240417',       urlPath: 'cliffside',    slug: 'cliffside',     date: '2008-11-11', categories: ['Call of Duty: Black Ops', 'Call of Duty: World at War'] },
  { snapshot: '20240417',       urlPath: 'upheaval',     slug: 'upheaval',      date: '2008-11-11', categories: ['Call of Duty: World at War'] },
]

// ─── helpers ──────────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function fetchWithRetry(url, retries = 4, delayMs = 3000) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; portfolio-seeder/1.0)' },
        redirect: 'follow',
      })
      if (res.status === 429) {
        console.warn(`  ⚠ rate limited — waiting 10s`)
        await sleep(10000)
        continue
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res
    } catch (err) {
      console.warn(`  ⚠ attempt ${i + 1} failed: ${err.message}`)
      if (i < retries - 1) await sleep(delayMs * (i + 1))
    }
  }
  throw new Error(`Failed after ${retries} retries: ${url}`)
}

function extractContent($) {
  const description = []
  const responsibilities = []

  // Try entry-content first (WordPress), then fall back to body
  const content = $([
    '.entry-content',
    '.et_pb_text_inner',
    '.post-content',
    'article',
  ].join(',')).first()
  const root = content.length ? content : $('body')

  let inResponsibilities = false

  root.find('p, li').each((_, el) => {
    const text = $(el).text().replace(/\s+/g, ' ').trim()
    if (!text || text.length < 10) return
    if (/^(Home|About|Level Design|Contact|Share|Designed by|Powered by|Go\[)/i.test(text)) return
    if (/^Call of Duty:/i.test(text)) return

    if (/my responsibilities/i.test(text)) {
      inResponsibilities = true
      return
    }

    if (inResponsibilities) {
      if ($(el).is('li') || text.startsWith('•')) {
        const bullet = text.replace(/^[•\-–]\s*/, '').trim()
        if (bullet) responsibilities.push(bullet)
      }
    } else if ($(el).is('p') && text.length > 40) {
      description.push(text)
    }
  })

  return {
    description: description.join('\n\n').trim(),
    responsibilities,
  }
}

// Site-level assets we never want (logos, avatars, etc.)
const SKIP_FILENAMES = /^(AH|logo|avatar|favicon|icon|header|footer|bg|background)\./i

// Extract the full wayback-prefixed image URLs directly from the HTML.
// Scopes to the main content area to avoid pulling in nav / sidebar images.
function extractArchivedImageUrls($) {
  const seen = new Set()
  const urls = []

  // Scope to the project content container; fall back to whole body
  const containers = [
    '.entry-content',
    '.et_pb_section',
    '.post-content',
    'article',
    '.et_pb_gallery',
    '#content',
    'main',
  ]
  const root = $(containers.join(',')).first()
  const scope = root.length ? root : $('body')

  scope.find('img, a').each((_, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('href') || ''
    if (!src.includes('web.archive.org')) return
    if (!src.includes('wp-content/uploads')) return
    // Skip WordPress thumbnail sizes like -400x284.jpg
    if (/\-\d+x\d+\.(jpe?g|png)/i.test(src)) return
    // Skip obvious site-level assets
    const filename = src.split(/[/?#]/).filter(Boolean).pop() || ''
    if (SKIP_FILENAMES.test(filename)) return
    if (seen.has(src)) return
    seen.add(src)
    urls.push(src)
  })

  // Cap at 20 images per project to keep downloads reasonable
  return urls.slice(0, 20)
}

async function downloadImage(archivedUrl, destFile) {
  if (fs.existsSync(destFile) && fs.statSync(destFile).size > 0) {
    console.log(`     already downloaded: ${path.basename(destFile)}`)
    return true
  }
  try {
    // Only 2 retries for images — most failures are permanent 404s
    const res = await fetchWithRetry(archivedUrl, 2, 1500)
    const dest = fs.createWriteStream(destFile)
    await pipeline(res.body, dest)
    const size = fs.statSync(destFile).size
    if (size < 100) { fs.unlinkSync(destFile); return false } // discard empty files
    return true
  } catch (err) {
    console.warn(`     ✗ could not download ${path.basename(destFile)}: ${err.message}`)
    return false
  }
}

// ─── main ─────────────────────────────────────────────────────────────────────
const SEED_DIR = new URL('./seed-data', import.meta.url).pathname

async function scrapeProject(project) {
  const { snapshot, urlPath, slug, date, categories, title: forcedTitle } = project
  const projectDir = path.join(SEED_DIR, slug)
  const imagesDir  = path.join(projectDir, 'images')
  const jsonFile   = path.join(projectDir, 'project.json')

  fs.mkdirSync(imagesDir, { recursive: true })

  if (fs.existsSync(jsonFile)) {
    const existing = JSON.parse(fs.readFileSync(jsonFile, 'utf8'))
    if (existing._scraped) {
      console.log(`⏭  ${slug} — already scraped`)
      return
    }
  }

  const pageUrl = `https://web.archive.org/web/${snapshot}/http://adam.hoggatt.me/project/${urlPath}/`
  console.log(`\n→ ${slug}`)
  console.log(`   ${pageUrl}`)

  let html
  try {
    const res = await fetchWithRetry(pageUrl)
    html = await res.text()
  } catch (err) {
    console.error(`   ✗ page fetch failed: ${err.message}`)
    return
  }

  const $ = load(html)

  const rawTitle = forcedTitle ||
    $('h1.entry-title, h2.entry-title').first().text().trim() ||
    $('h1').not('.site-title').first().text().trim() ||
    slug
  const title = rawTitle.replace(/\s+Go\s*$/, '').replace(/\s+/g, ' ').trim()

  const { description, responsibilities } = extractContent($)
  const imageUrls = extractArchivedImageUrls($)

  console.log(`   title: ${title}`)
  console.log(`   images found: ${imageUrls.length}`)
  console.log(`   description: ${description.length} chars, ${responsibilities.length} responsibilities`)

  // Store the archived URLs as references — download skipped for this run
  const projectData = {
    title,
    slug,
    date,
    categories,
    description,
    responsibilities,
    images: [],           // to be populated later when images are uploaded to S3
    _archivedImageUrls: imageUrls,
    createdAt: new Date().toISOString(),
    _scraped: true,
  }

  fs.writeFileSync(jsonFile, JSON.stringify(projectData, null, 2))
  console.log(`   ✓ saved — ${imageUrls.length} image URLs noted (downloads skipped)`)
}

;(async () => {
  console.log(`\nScraping ${PROJECTS.length} projects from Wayback Machine…`)
  console.log('(This will take several minutes — being polite to archive.org)\n')
  fs.mkdirSync(SEED_DIR, { recursive: true })

  for (const project of PROJECTS) {
    await scrapeProject(project)
    await sleep(1500)
  }

  const scraped = fs.readdirSync(SEED_DIR)
    .filter(f => fs.existsSync(path.join(SEED_DIR, f, 'project.json')))
    .length

  console.log(`\n✅  Scrape complete. ${scraped}/${PROJECTS.length} projects saved to scripts/seed-data/`)
  console.log('    Run:  node upload.mjs <bucket-name> [region]  to push to S3.')
})()


