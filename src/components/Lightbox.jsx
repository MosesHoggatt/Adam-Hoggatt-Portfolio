import { useEffect, useState, useCallback } from 'react'
import awsConfig from '../aws-exports'
import './Lightbox.css'

const S3_BASE = `https://${awsConfig.Storage.S3.bucket}.s3.${awsConfig.Storage.S3.region}.amazonaws.com`
const s3Url = (path) => `${S3_BASE}/${path}`

const Lightbox = ({ project, projectIndex, totalProjects, onPrevProject, onNextProject, onClose }) => {
  const images = (project?.images || []).map(s3Url)
  const [activeIndex, setActiveIndex] = useState(0)

  /* Reset index when project changes */
  useEffect(() => { setActiveIndex(0) }, [project])

  /* Lock body scroll while open */
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  /* Keyboard navigation — arrows for images, [ ] for maps */
  const handleKey = useCallback((e) => {
    if (e.key === 'Escape')     onClose()
    if (e.key === 'ArrowRight') setActiveIndex(i => Math.min(i + 1, images.length - 1))
    if (e.key === 'ArrowLeft')  setActiveIndex(i => Math.max(i - 1, 0))
    if (e.key === '[' && projectIndex > 0)                      onPrevProject()
    if (e.key === ']' && projectIndex < totalProjects - 1)      onNextProject()
  }, [onClose, images.length, projectIndex, totalProjects, onPrevProject, onNextProject])

  useEffect(() => {
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [handleKey])

  if (!project) return null

  const activeUrl = images[activeIndex] || null

  return (
    <div className="lb-backdrop" onClick={onClose}>
      <div className="lb-panel" onClick={e => e.stopPropagation()}>

        {/* Close */}
        <button className="lb-close" onClick={onClose} aria-label="Close">✕</button>

        {/* Main content */}
        <div className="lb-main">

          {/* Left: big image + thumbs below */}
          <div className="lb-image-col">
            <div className="lb-image-area">
              {images.length > 1 && (
                <button
                  className="lb-nav lb-prev"
                  onClick={() => setActiveIndex(i => Math.max(i - 1, 0))}
                  disabled={activeIndex === 0}
                  aria-label="Previous"
                >‹</button>
              )}

              <div className="lb-image-frame">
                {activeUrl
                  ? <img src={activeUrl} alt={project.title} />
                  : <div className="lb-no-image">No image available</div>}
              </div>

              {images.length > 1 && (
                <button
                  className="lb-nav lb-next"
                  onClick={() => setActiveIndex(i => Math.min(i + 1, images.length - 1))}
                  disabled={activeIndex === images.length - 1}
                  aria-label="Next"
                >›</button>
              )}
            </div>

            {/* Image counter — centered below main image */}
            {images.length > 0 && (
              <p className="lb-counter">{activeIndex + 1} / {images.length}</p>
            )}

            {/* Thumbnail strip — below counter */}
            {images.length > 1 && (
              <div className="lb-thumbs">
                {images.map((url, i) => (
                  <button
                    key={i}
                    className={`lb-thumb${i === activeIndex ? ' lb-thumb-active' : ''}`}
                    onClick={() => setActiveIndex(i)}
                  >
                    <img src={url} alt={`View ${i + 1}`} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right: info */}
          <aside className="lb-sidebar">
            <h2 className="lb-title">{project.title}</h2>

            <div className="lb-tags">
              {(project.categories || []).map(c => (
                <span key={c} className="tag">{c.replace('Call of Duty: ', '')}</span>
              ))}
            </div>

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
