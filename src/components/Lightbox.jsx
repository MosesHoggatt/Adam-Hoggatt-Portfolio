import { useEffect, useState, useCallback, useRef } from 'react'
import awsConfig from '../aws-exports'
import './Lightbox.css'

const S3_BASE = `https://${awsConfig.Storage.S3.bucket}.s3.${awsConfig.Storage.S3.region}.amazonaws.com`
const s3Url = (path) => `${S3_BASE}/${path}`

const Lightbox = ({ project, projectIndex, totalProjects, onPrevProject, onNextProject, onClose, initialShowMinimap = false }) => {
  const images = (project?.images || []).map(s3Url)
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
                  {images.map((url, i) => (
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
