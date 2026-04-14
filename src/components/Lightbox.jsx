import { useEffect, useState, useCallback, useRef } from 'react'
import awsConfig from '../aws-exports'
import './Lightbox.css'

const S3_BASE = `https://${awsConfig.Storage.S3.bucket}.s3.${awsConfig.Storage.S3.region}.amazonaws.com`
const CDN_BASE = awsConfig.Storage.cdnBase || S3_BASE
const s3Url = (path) => `${CDN_BASE}/${path}`
const thumbUrl = (path) => s3Url(path.replace('/images/', '/thumbnails/'))

// ── Lightweight preloader ─────────────────────────────────────────────────────
// Fire-and-forget Image loads. The browser's HTTP/2 multiplexer handles
// concurrency, and immutable Cache-Control headers make repeat loads instant.
const _started = new Set()   // URLs we've already kicked off
const _ready   = new Set()   // URLs confirmed loaded (in browser cache)

function preload(urls) {
  for (const u of urls) {
    if (_started.has(u)) continue
    _started.add(u)
    const img = new Image()
    img.onload = () => _ready.add(u)
    img.src = u
  }
}

/** Check if a URL has finished loading (via preload or previous render). */
function isReady(url) { return _ready.has(url) }
function markReady(url) { _ready.add(url) }

const Lightbox = ({ project, allProjects, projectIndex, totalProjects, onPrevProject, onNextProject, onClose, initialShowMinimap = false }) => {
  const imagePaths = project?.images || []
  const images = imagePaths.map(s3Url)
  const thumbnails = imagePaths.map(thumbUrl)
  const minimapUrl = project?.minimap ? s3Url(project.minimap) : null
  const [activeIndex, setActiveIndex] = useState(0)
  const [showingMinimap, setShowingMinimap] = useState(initialShowMinimap)
  // displayedSrc: the URL currently shown. Only changes when the new image is
  // confirmed in browser memory (isReady or onload). src on the <img> element
  // is never set to an unloaded URL, so the browser never blanks the display.
  const [displayedSrc, setDisplayedSrc] = useState(null)
  const [showSpinner, setShowSpinner] = useState(false)
  const thumbsRef = useRef(null)
  const prevProjectRef = useRef(project)
  const pendingRef = useRef(null)   // URL we are currently waiting on
  const spinnerTimerRef = useRef(null)

  /* Reset state on project navigation */
  useEffect(() => {
    if (prevProjectRef.current !== project) {
      prevProjectRef.current = project
      setActiveIndex(0)
      setShowingMinimap(false)
      setDisplayedSrc(null)
      setShowSpinner(false)
      pendingRef.current = null
      clearTimeout(spinnerTimerRef.current)
    }
  }, [project])

  /* Lock body scroll while open.
     - position:fixed + top offset: required for iOS Safari momentum scroll
     - html overflow:hidden: required for Android Chrome (scrolls <html>, not <body>)
     - both together cover all mobile browsers */
  useEffect(() => {
    const scrollY = window.scrollY
    document.documentElement.style.overflow = 'hidden'
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.left = '0'
    document.body.style.right = '0'
    document.body.style.overflow = 'hidden'
    return () => {
      document.documentElement.style.overflow = ''
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.left = ''
      document.body.style.right = ''
      document.body.style.overflow = ''
      window.scrollTo(0, scrollY)
    }
  }, [])

  /* Preload all images for current project + adjacent projects' heroes + thumbnails */
  useEffect(() => {
    const urls = [...images]
    if (minimapUrl) urls.push(minimapUrl)
    for (let d = 1; d <= 2; d++) {
      const prev = allProjects?.[projectIndex - d]
      const next = allProjects?.[projectIndex + d]
      if (prev?.images?.[0]) urls.push(s3Url(prev.images[0]))
      if (next?.images?.[0]) urls.push(s3Url(next.images[0]))
      // Preload all thumbnails for the immediately adjacent projects
      if (d === 1) {
        prev?.images?.forEach(p => urls.push(thumbUrl(p)))
        next?.images?.forEach(p => urls.push(thumbUrl(p)))
      }
    }
    preload(urls)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project])

  /* Scroll active thumb into view whenever index changes */
  useEffect(() => {
    if (!thumbsRef.current) return
    const active = thumbsRef.current.querySelector('.lb-thumb-active')
    if (active) active.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
  }, [activeIndex])

  /* Load new image in background; only update displayedSrc once it's in memory.
     This guarantees the <img> src never points to an unloaded URL — no blank frames. */
  useEffect(() => {
    if (showingMinimap) return
    const url = images[activeIndex] || null
    if (!url) { setDisplayedSrc(null); return }

    pendingRef.current = url
    clearTimeout(spinnerTimerRef.current)
    setShowSpinner(false)

    if (isReady(url)) {
      setDisplayedSrc(url)
      return
    }

    spinnerTimerRef.current = setTimeout(() => {
      if (pendingRef.current === url) setShowSpinner(true)
    }, 500)

    const img = new Image()
    img.onload = () => {
      markReady(url)
      if (pendingRef.current !== url) return
      clearTimeout(spinnerTimerRef.current)
      setDisplayedSrc(url)
      setShowSpinner(false)
    }
    img.src = url
    return () => clearTimeout(spinnerTimerRef.current)
  // images is stable for a given project (same CDN_BASE + project.images strings)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, showingMinimap, project])

  /* Keyboard navigation — arrows for images, [ ] for maps */
  const handleKey = useCallback((e) => {
    if (e.key === 'Escape')     onClose()
    if (e.key === 'ArrowRight') { setShowingMinimap(false); setActiveIndex(i => (i + 1) % images.length) }
    if (e.key === 'ArrowLeft')  { setShowingMinimap(false); setActiveIndex(i => (i - 1 + images.length) % images.length) }
    if (e.key === '[') onPrevProject()
    if (e.key === ']') onNextProject()
  }, [onClose, images.length, projectIndex, totalProjects, onPrevProject, onNextProject])

  useEffect(() => {
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [handleKey])

  if (!project) return null

  // Format release date e.g. "November 13, 2012"
  const releaseDate = project.date
    ? new Date(project.date + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : null

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
                  <div className="lb-img-progressive">
                    {/* Single <img>, no key — same DOM element reused on every src swap.
                        src only set to a URL confirmed in browser memory; never blank. */}
                    {(showingMinimap ? minimapUrl : displayedSrc) && (
                      <img
                        src={showingMinimap ? minimapUrl : displayedSrc}
                        alt={project.title}
                        className="lb-img-full"
                        decoding="sync"
                      />
                    )}
                    {showSpinner && !showingMinimap && (
                      <div className="lb-spinner" aria-label="Loading" />
                    )}
                  </div>
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

            {releaseDate && (
              <div className="lb-release-date">
                <span className="lb-release-date-label">Released</span>
                <span className="lb-release-date-value">{releaseDate}</span>
              </div>
            )}

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
            aria-label="Previous map"
          >&#8592; Prev</button>

          <span className="lb-footer-title">{project.title}</span>

          <button
            className="lb-footer-nav lb-footer-next"
            onClick={onNextProject}
            aria-label="Next map"
          >Next &#8594;</button>
        </div>
      </div>
    </div>
  )
}

export default Lightbox
