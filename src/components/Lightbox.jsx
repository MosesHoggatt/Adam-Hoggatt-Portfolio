import { useEffect, useState, useCallback, useRef } from 'react'
import awsConfig from '../aws-exports'
import './Lightbox.css'

const S3_BASE = `https://${awsConfig.Storage.S3.bucket}.s3.${awsConfig.Storage.S3.region}.amazonaws.com`
const s3Url = (path) => `${S3_BASE}/${path}`
const thumbUrl = (path) => s3Url(path.replace('/images/', '/thumbnails/'))

// ── Global image loader ───────────────────────────────────────────────────────
// Single pool shared across every project. Max 6 concurrent downloads.
// Already-downloaded URLs are remembered so they're never re-fetched.
const MAX_SLOTS = 10
const loaded  = new Set()   // completed URLs (in browser cache)
let   active  = []          // Image objects currently downloading
let   pending = []          // URLs waiting for a free slot

function drain() {
  while (active.length < MAX_SLOTS && pending.length > 0) {
    const url = pending.shift()
    if (loaded.has(url)) { drain(); return }
    const img = new Image()
    active.push(img)
    const finish = (ok) => () => {
      if (ok) loaded.add(url)
      active = active.filter(a => a !== img)
      img.onload = img.onerror = null
      drain()
    }
    img.onload  = finish(true)
    img.onerror = finish(false)
    img.src = url
  }
}

// Bump `urls` to the front of the queue.
// Cancels active loads NOT in the new list to free slots immediately.
// Already-loaded URLs are skipped entirely.
function priorityLoad(urls) {
  const urlSet     = new Set(urls)
  const activeUrls = new Set(active.map(i => i.src))

  // Cancel active loads that aren't wanted by this request
  const keep = []
  active.forEach(img => {
    if (urlSet.has(img.src)) {
      keep.push(img)
    } else {
      img.onload = img.onerror = null
      img.src = ''
    }
  })
  active = keep

  // Prepend fresh urls (skip already loaded or already downloading)
  const fresh = urls.filter(u => !loaded.has(u) && !activeUrls.has(u))
  pending = [...fresh, ...pending.filter(u => !urlSet.has(u))]
  drain()
}

function cancelAll() {
  pending = []
  active.forEach(img => { img.onload = img.onerror = null; img.src = '' })
  active = []
}
// ─────────────────────────────────────────────────────────────────────────────

const Lightbox = ({ project, allProjects, projectIndex, totalProjects, onPrevProject, onNextProject, onClose, initialShowMinimap = false }) => {
  const imagePaths = project?.images || []
  const images = imagePaths.map(s3Url)
  const thumbnails = imagePaths.map(thumbUrl)
  const minimapUrl = project?.minimap ? s3Url(project.minimap) : null
  const [activeIndex, setActiveIndex] = useState(0)
  const [showingMinimap, setShowingMinimap] = useState(initialShowMinimap)
  const thumbsRef = useRef(null)
  const prevProjectRef = useRef(project)

  /* Reset index on project navigation (prev/next), but NOT on initial mount */
  useEffect(() => {
    if (prevProjectRef.current !== project) {
      prevProjectRef.current = project
      setActiveIndex(0)
      setShowingMinimap(false)
    }
  }, [project])

  /* Lock body scroll while open */
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  /* On project open/change: reprioritize the global pool for this project.
     Current image[0] first, then minimap, then outward from index 0.
     Active loads NOT in this list are cancelled immediately to free slots. */
  useEffect(() => {
    const n = images.length
    if (n === 0) return
    const ordered = [images[0]]
    if (minimapUrl) ordered.push(minimapUrl)
    for (let offset = 1; offset < n; offset++) {
      ordered.push(images[offset % n])
      const back = (n - offset) % n
      if (back !== offset % n) ordered.push(images[back])
    }
    // Buffer 3 adjacent projects in each direction
    const BUFFER = 3
    for (let d = 1; d <= BUFFER; d++) {
      const prev = allProjects?.[projectIndex - d]
      const next = allProjects?.[projectIndex + d]
      if (prev?.images?.[0]) ordered.push(s3Url(prev.images[0]))
      if (next?.images?.[0]) ordered.push(s3Url(next.images[0]))
    }
    priorityLoad(ordered)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project])

  /* On thumbnail click / arrow nav: bump active image + neighbours to front. */
  useEffect(() => {
    const n = images.length
    if (n === 0) return
    priorityLoad([
      images[activeIndex],
      images[(activeIndex + 1) % n],
      images[(activeIndex - 1 + n) % n],
    ])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, project])

  /* Cancel everything when the lightbox is closed. */
  useEffect(() => () => cancelAll(), [])

  /* Scroll active thumb into view whenever index changes */
  useEffect(() => {
    if (!thumbsRef.current) return
    const active = thumbsRef.current.querySelector('.lb-thumb-active')
    if (active) active.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
  }, [activeIndex])

  /* Keyboard navigation — arrows for images, [ ] for maps */
  const handleKey = useCallback((e) => {
    if (e.key === 'Escape')     onClose()
    if (e.key === 'ArrowRight') { setShowingMinimap(false); setActiveIndex(i => (i + 1) % images.length) }
    if (e.key === 'ArrowLeft')  { setShowingMinimap(false); setActiveIndex(i => (i - 1 + images.length) % images.length) }
    if (e.key === '[' && projectIndex > 0)                      onPrevProject()
    if (e.key === ']' && projectIndex < totalProjects - 1)      onNextProject()
  }, [onClose, images.length, projectIndex, totalProjects, onPrevProject, onNextProject])

  useEffect(() => {
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [handleKey])

  if (!project) return null

  const activeUrl = showingMinimap ? minimapUrl : (images[activeIndex] || null)

  return (
    <div className="lb-backdrop" onClick={onClose}>
      <div className="lb-panel" onClick={e => e.stopPropagation()}>

        {/* Close */}
        <button className="lb-close" onClick={onClose} aria-label="Close">✕</button>

        {/* Main content */}
        <div className="lb-main">

          {/* Left: big image + thumbs below */}
          <div className="lb-image-frame">
            <div className="lb-image-col">
              <div className="lb-image-area">
                {!showingMinimap && images.length > 1 && (
                  <button
                    className="lb-nav lb-prev"
                    onClick={() => setActiveIndex(i => (i - 1 + images.length) % images.length)}
                    aria-label="Previous"
                  >‹</button>
                )}

                <div className="lb-image-and-counter">
                  {activeUrl
                    ? <img src={activeUrl} alt={project.title} />
                    : <div className="lb-no-image">No image available</div>}
                  {!showingMinimap && images.length > 0 && (
                    <p className="lb-counter">{activeIndex + 1} / {images.length}</p>
                  )}
                </div>

                {!showingMinimap && images.length > 1 && (
                  <button
                    className="lb-nav lb-next"
                    onClick={() => setActiveIndex(i => (i + 1) % images.length)}
                    aria-label="Next"
                  >›</button>
                )}
              </div>

              {/* Thumbnail strip — below image area */}
              {images.length > 1 && (
                <div className="lb-thumbs" ref={thumbsRef}>
                  {thumbnails.map((url, i) => (
                    <button
                      key={i}
                      className={`lb-thumb${!showingMinimap && i === activeIndex ? ' lb-thumb-active' : ''}`}
                      onClick={() => { setShowingMinimap(false); setActiveIndex(i) }}
                    >
                      <img src={url} alt={`View ${i + 1}`} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: info */}
          <aside className="lb-sidebar">
            <h2 className="lb-title">{project.title}</h2>

            <div className="lb-tags">
              {(project.categories || []).map(c => (
                <span key={c} className="tag">{c.replace('Call of Duty: ', '')}</span>
              ))}
            </div>

            {minimapUrl && (
              <div className="lb-minimap">
                <p className="lb-minimap-label">Minimap</p>
                <button
                  className={`lb-minimap-btn${showingMinimap ? ' lb-minimap-active' : ''}`}
                  onClick={() => setShowingMinimap(v => !v)}
                  title="View minimap"
                >
                  <img src={minimapUrl} alt="Minimap" />
                </button>
              </div>
            )}

            {project.description && (
              <p className="lb-desc">{project.description}</p>
            )}
          </aside>
        </div>{/* end lb-main */}

        {/* ── Bottom footer: prev/next map + title ── */}
        <div className="lb-footer">
          <button
            className="lb-footer-nav lb-footer-prev"
            onClick={onPrevProject}
            disabled={projectIndex === 0}
            aria-label="Previous map"
          >&#8592; Prev</button>

          <span className="lb-footer-title">{project.title}</span>

          <button
            className="lb-footer-nav lb-footer-next"
            onClick={onNextProject}
            disabled={projectIndex === totalProjects - 1}
            aria-label="Next map"
          >Next &#8594;</button>
        </div>
      </div>
    </div>
  )
}

export default Lightbox
