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
  const [fullLoaded, setFullLoaded] = useState({})
  // ghostSrc: last confirmed-loaded URL. Ghost <img> stays in DOM always;
  // visibility toggled via CSS class — no element insertion = no decode delay = no blink.
  const [ghostSrc, setGhostSrc] = useState(null)
  const [showSpinner, setShowSpinner] = useState(false)
  const thumbsRef = useRef(null)
  const prevProjectRef = useRef(project)
  const spinnerTimerRef = useRef(null)

  const activeUrl = showingMinimap ? minimapUrl : (images[activeIndex] || null)
  const isFull = showingMinimap || !!fullLoaded[activeIndex] || (activeUrl && isReady(activeUrl))
  // Ghost is visible when new image isn't loaded yet and we have a previous image to show
  const showGhost = !isFull && !showingMinimap && !!ghostSrc && ghostSrc !== activeUrl

  /* Reset state on project navigation */
  useEffect(() => {
    if (prevProjectRef.current !== project) {
      prevProjectRef.current = project
      setActiveIndex(0)
      setShowingMinimap(false)
      setFullLoaded({})
      setGhostSrc(null)
      setShowSpinner(false)
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

  /* Preload all images for current project + adjacent projects' heroes */
  useEffect(() => {
    const urls = [...images]
    if (minimapUrl) urls.push(minimapUrl)
    for (let d = 1; d <= 2; d++) {
      const prev = allProjects?.[projectIndex - d]
      const next = allProjects?.[projectIndex + d]
      if (prev?.images?.[0]) urls.push(s3Url(prev.images[0]))
      if (next?.images?.[0]) urls.push(s3Url(next.images[0]))
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

  /* Spinner: show after 500ms only when there is no ghost to cover the wait (first load) */
  useEffect(() => {
    clearTimeout(spinnerTimerRef.current)
    if (isFull || showingMinimap || showGhost) { setShowSpinner(false); return }
    spinnerTimerRef.current = setTimeout(() => setShowSpinner(true), 500)
    return () => clearTimeout(spinnerTimerRef.current)
  }, [isFull, showingMinimap, showGhost])

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
                  {activeUrl ? (
                    <div className="lb-img-progressive">
                      {/* Full-res: in normal flow, provides container sizing */}
                      <img
                        key={showingMinimap ? 'minimap' : `full-${activeIndex}`}
                        src={activeUrl}
                        alt={project.title}
                        className={`lb-img-full${isFull ? ' lb-img-full--visible' : ''}`}
                        onLoad={() => {
                          markReady(activeUrl)
                          if (!showingMinimap) {
                            setGhostSrc(activeUrl)  // keep ghost src in sync with last loaded image
                            setFullLoaded(p => ({ ...p, [activeIndex]: true }))
                          }
                        }}
                      />
                      {/* Ghost: ALWAYS in DOM so browser keeps the bitmap decoded.
                          Shown/hidden via CSS class only — no element insertion on switch. */}
                      {!showingMinimap && (
                        <img
                          src={ghostSrc || ''}
                          alt=""
                          className={`lb-img-ghost${showGhost ? ' lb-img-ghost--visible' : ''}`}
                        />
                      )}
                      {showSpinner && <div className="lb-spinner" aria-label="Loading" />}
                    </div>
                  ) : (
                    <div className="lb-no-image">No image available</div>
                  )}
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
