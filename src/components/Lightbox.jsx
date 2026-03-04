import { useEffect, useState, useCallback } from 'react'
import { getUrl } from 'aws-amplify/storage'
import './Lightbox.css'

const Lightbox = ({ project, onClose }) => {
  const [resolvedUrls, setResolvedUrls]   = useState([])
  const [activeIndex, setActiveIndex]     = useState(0)
  const [loadingUrls, setLoadingUrls]     = useState(true)

  /* Resolve all image S3 paths to signed URLs */
  useEffect(() => {
    if (!project) return
    setLoadingUrls(true)
    setActiveIndex(0)

    const resolve = async () => {
      const urls = await Promise.all(
        (project.images || []).map(async (path) => {
          try {
            const { url } = await getUrl({ path })
            return url.toString()
          } catch {
            return null
          }
        })
      )
      setResolvedUrls(urls.filter(Boolean))
      setLoadingUrls(false)
    }

    resolve()
  }, [project])

  /* Lock body scroll while open */
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  /* Keyboard navigation */
  const handleKey = useCallback((e) => {
    if (e.key === 'Escape')     onClose()
    if (e.key === 'ArrowRight') setActiveIndex(i => Math.min(i + 1, resolvedUrls.length - 1))
    if (e.key === 'ArrowLeft')  setActiveIndex(i => Math.max(i - 1, 0))
  }, [onClose, resolvedUrls.length])

  useEffect(() => {
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [handleKey])

  if (!project) return null

  const activeUrl = resolvedUrls[activeIndex] || null

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
              {resolvedUrls.length > 1 && (
                <button
                  className="lb-nav lb-prev"
                  onClick={() => setActiveIndex(i => Math.max(i - 1, 0))}
                  disabled={activeIndex === 0}
                  aria-label="Previous"
                >‹</button>
              )}

              <div className="lb-image-frame">
                {loadingUrls && <div className="lb-spinner">Loading…</div>}
                {!loadingUrls && activeUrl &&
                  <img src={activeUrl} alt={project.title} />}
                {!loadingUrls && !activeUrl &&
                  <div className="lb-no-image">No image available</div>}
              </div>

              {resolvedUrls.length > 1 && (
                <button
                  className="lb-nav lb-next"
                  onClick={() => setActiveIndex(i => Math.min(i + 1, resolvedUrls.length - 1))}
                  disabled={activeIndex === resolvedUrls.length - 1}
                  aria-label="Next"
                >›</button>
              )}
            </div>

            {/* Thumbnail strip — below main image */}
            {resolvedUrls.length > 1 && (
              <div className="lb-thumbs">
                {resolvedUrls.map((url, i) => (
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

          {/* Right: info (no thumbs here) */}
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

            {resolvedUrls.length > 0 && (
              <p className="lb-counter">{activeIndex + 1} / {resolvedUrls.length}</p>
            )}
          </aside>
        </div>
      </div>
    </div>
  )
}

export default Lightbox
