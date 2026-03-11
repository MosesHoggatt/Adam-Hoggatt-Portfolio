import { useState, useEffect } from 'react'
import awsConfig from '../aws-exports'
import Lightbox from './Lightbox'
import heroShot from '../assets/AdamHoggattHeroShot.jpg'
import heroBanner from '../assets/AdamHoggattBanner.jpg'
import { CATEGORY_ICON_MAP, BUILTIN_CATEGORY_META } from '../categoryIcons'
import './Portfolio.css'

const S3_BASE = `https://${awsConfig.Storage.S3.bucket}.s3.${awsConfig.Storage.S3.region}.amazonaws.com`

// Convert an S3 storage path (e.g. "projects/raid/images/raid.jpg")
// to a public HTTPS URL — no signing, no Cognito needed.
const s3Url          = (path) => `${S3_BASE}/${path}`
const thumbUrl       = (path) => s3Url(path.replace('/images/', '/thumbnails/'))
const cardUrl        = (path) => s3Url(path.replace('/images/', '/card/').replace(/\.(jpe?g|png|gif)$/i, '.webp'))
// 400px WebP thumbnail sized for the card minimap slot (~150-350 CSS px, covers 2× retina)
const minimapThumbUrl = (path) => s3Url(path.replace('/images/', '/minimap-thumbnails/').replace(/\.[^.]+$/, '.webp'))

const shortName = (str) => str.replace('Call of Duty: ', '')

// simple hook for media queries; returns true/false and updates on resize
function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia(query).matches
  })
  useEffect(() => {
    const m = window.matchMedia(query)
    const handler = (e) => setMatches(e.matches)
    m.addEventListener('change', handler)
    return () => m.removeEventListener('change', handler)
  }, [query])
  return matches
}

/* Parse markdown-style links [text](url) in a string and return React elements */
const parseBioLinks = (text) => {
  if (!text) return null
  const parts = []
  const re = /\[([^\]]+)\]\(([^)]+)\)/g
  let last = 0
  let match
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index))
    parts.push(
      <a key={match.index} href={match[2]} target="_blank" rel="noopener noreferrer" className="bio-link">
        {match[1]}
      </a>
    )
    last = re.lastIndex
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

const Portfolio = () => {
  const [projects, setProjects] = useState([])
  const [allCategories, setAllCategories] = useState([])
  const [categoryMeta, setCategoryMeta] = useState({})
  const [activeFilters, setActiveFilters] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lightboxIndex, setLightboxIndex] = useState(null)
  const [lightboxInitialMinimap, setLightboxInitialMinimap] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortOrder, setSortOrder] = useState('date-desc')
  const [profile, setProfile] = useState(null)
  const [showBioModal, setShowBioModal] = useState(false)

  // detect narrow/portrait layout; when true we treat the interface as "vertical"
  const isVerticalLayout = useMediaQuery('(max-width: 600px)')

  /* Lock body scroll while bio modal is open */
  useEffect(() => {
    if (showBioModal) {
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = '' }
    }
  }, [showBioModal])

  useEffect(() => {
    fetchProjects()
    fetchProfile()
  }, [])

  const fetchProjects = async () => {
    try {
      setLoading(true)
      setError(null)

      // 1. Fetch the static index — one public GET, no Cognito/Amplify involved
      const indexRes = await fetch(s3Url('projects/index.json'), { cache: 'no-cache' })
      if (!indexRes.ok) throw new Error(`Index fetch failed: ${indexRes.status}`)
      const jsonPaths = await indexRes.json()

      if (jsonPaths.length === 0) {
        setProjects([])
        setLoading(false)
        return
      }

      // 2. Fetch and parse each manifest — all public GETs in parallel
      const loaded = await Promise.all(
        jsonPaths.map(async (path) => {
          try {
            const res = await fetch(s3Url(path))
            const data = await res.json()

            return {
              title: data.title || '',
              slug: data.slug || '',
              description: data.description || '',
              date: data.date || '',
              categories: Array.isArray(data.categories) ? data.categories : [],
              images: Array.isArray(data.images) ? data.images : [],
              minimap: data.minimap || null,
            }
          } catch (err) {
            console.warn('Failed to load project:', path, err)
            return null
          }
        })
      )

      const valid = loaded
        .filter(Boolean)
        .sort((a, b) => new Date(b.date) - new Date(a.date))

      // 4. Build category filter list
      const catSet = new Set(valid.flatMap(p => p.categories))
      setProjects(valid)

      // 5. Load category metadata and order from S3, falling back to builtins
      const meta = {}
      // Seed with builtin defaults first
      Object.assign(meta, BUILTIN_CATEGORY_META)
      try {
        const catMetaRes = await fetch(s3Url('projects/categories.json'))
        if (catMetaRes.ok) {
          const globalCats = await catMetaRes.json()
          // Respect admin-defined order from categories.json
          const catOrder = globalCats
            .map(c => (typeof c === 'string' ? c : c?.id))
            .filter(Boolean)
          const cats = [
            ...catOrder.filter(id => catSet.has(id)),
            ...[...catSet].filter(id => !catOrder.includes(id)),
          ]
          setAllCategories(cats)
          globalCats.forEach(c => {
            if (typeof c === 'string') {
              // Old string format — keep builtin icon if one exists
              if (!meta[c]) meta[c] = { gameName: c, icon: null }
            } else if (c?.id) {
              // New object format — S3 data wins
              meta[c.id] = {
                gameName: c.gameName || meta[c.id]?.gameName || c.id,
                icon: c.icon ?? meta[c.id]?.icon ?? null,
              }
            }
          })
        } else {
          setAllCategories([...catSet])
        }
      } catch {
        setAllCategories([...catSet])
      }
      setCategoryMeta(meta)
    } catch (err) {
      console.error('Error loading projects from S3:', err)
      setError('Could not load projects. Please try again later.')
    } finally {
      setLoading(false)
    }

  }

  const fetchProfile = async () => {
    try {
      const res = await fetch(s3Url('profile/profile.json'), { cache: 'no-cache' })
      if (res.ok) setProfile(await res.json())
    } catch {}
  }

  const filteredProjects = projects
    .filter(p => activeFilters.size === 0 || p.categories.some(c => activeFilters.has(c)))
    .filter(p => {
      const q = searchQuery.trim().toLowerCase()
      if (!q) return true
      return (
        p.title.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.categories.some(c => c.toLowerCase().includes(q))
      )
    })
    .slice()
    .sort((a, b) => {
      if (sortOrder === 'date-desc') return new Date(b.date) - new Date(a.date)
      if (sortOrder === 'date-asc')  return new Date(a.date) - new Date(b.date)
      if (sortOrder === 'name-asc')  return a.title.localeCompare(b.title)
      if (sortOrder === 'name-desc') return b.title.localeCompare(a.title)
      return 0
    })

  const heroBannerSrc = profile?.bannerPath ? s3Url(profile.bannerPath) : heroBanner
  const heroPhotoSrc = profile?.photoPath ? s3Url(profile.photoPath) : heroShot

  return (
    <div className="portfolio">
      {/* ── Hero ── */}
      <header className="hero" style={{ '--hero-bg': `url(${heroBannerSrc})` }}>
        <div className="hero-overlay">
          <div className="hero-inner">
            <img
              src={heroPhotoSrc}
              alt="Adam Hoggatt"
              className="hero-shot hero-shot-clickable"
              onClick={() => setShowBioModal(true)}
              title="View bio"
              fetchpriority="high"
            />
            <div className="hero-text">
              <h1 className="hero-title">Adam Hoggatt</h1>
              <p className="hero-subtitle">Level Design Portfolio</p>
              <p className="hero-role">Expert Level Designer · Treyarch · Since 2008</p>
            </div>
          </div>
        </div>
      </header>

      {/* ── Filter bar (built dynamically from loaded category data) ── */}
      {allCategories.length > 0 && (
        <div className="filter-bar">
          {/* we display ‘All’ followed by categories in reverse order */}
          {['All', ...allCategories].map(cat => {
            const isAll = cat === 'All'
            const isActive = isAll ? activeFilters.size === 0 : activeFilters.has(cat)
            const meta = !isAll ? categoryMeta[cat] : null
            const iconSrc = meta?.icon ? (CATEGORY_ICON_MAP[meta.icon] || s3Url(meta.icon)) : null
            const gameName = meta?.gameName || shortName(cat)
            return (
              <button
                key={cat}
                className={`filter-btn${isActive ? ' active' : ''}`}
                onClick={() => {
                  if (isAll) {
                    setActiveFilters(new Set())
                  } else {
                    setActiveFilters(prev => new Set(prev.has(cat) ? [] : [cat]))
                  }
                }}
                title={isAll ? '' : gameName}
                aria-label={isAll ? 'Show all' : gameName}
              >
                {isAll ? 'All' : (
                  <>
                    {iconSrc && <img src={iconSrc} alt={gameName} className="filter-icon" />}
                    <span className="filter-btn-label">{gameName}</span>
                  </>
                )}
              </button>
            )
          })}
        </div>
      )}
      {/* ── Search bar ── */}
      <div className="search-bar">
        <select
          className="sort-select"
          value={sortOrder}
          onChange={e => setSortOrder(e.target.value)}
          aria-label="Sort order"
        >
          <option value="date-desc">Most Recent</option>
          <option value="date-asc">Least Recent</option>
          <option value="name-asc">Name (A → Z)</option>
          <option value="name-desc">Name (Z → A)</option>
        </select>
        <div className="search-input-wrap">
          <input
            className="search-input"
            type="text"
            placeholder="Search levels…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="search-clear" onClick={() => setSearchQuery('')} aria-label="Clear search">×</button>
          )}
        </div>
      </div>
      {/* ── Grid ── */}
      <main className="projects-grid">
        {loading && <p className="status-msg">Loading projects…</p>}
        {error  && <p className="status-msg error-msg">{error}</p>}
        {!loading && !error && projects.length === 0 && (
          <p className="status-msg">No projects yet. Check back soon.</p>
        )}

        {filteredProjects.map((project, idx) => (
          <article
            key={project.slug}
            className="project-card"
            onClick={() => { setLightboxInitialMinimap(false); setLightboxIndex(idx) }}
            onMouseEnter={() => {
              // Preload the full-res hero so lightbox opens instantly
              if (project.images.length > 0) { const img = new Image(); img.src = s3Url(project.images[0]) }
            }}
            role="button"
            tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && (setLightboxInitialMinimap(false), setLightboxIndex(idx))}
          >
            <div className="card-image">
              {project.images.length > 0
                ? <img
                    src={cardUrl(project.images[0])}
                    alt={project.title}
                    loading={idx < 6 ? 'eager' : 'lazy'}
                    decoding={idx < 6 ? 'sync' : 'async'}
                    fetchpriority={idx < 6 ? 'high' : 'auto'}
                    onError={e => { e.currentTarget.onerror = null; e.currentTarget.src = s3Url(project.images[0]) }}
                  />
                : <div className="image-placeholder" />}
            </div>
            <div className="card-body">
              <div className="card-info">
                <h2 className="card-title">{project.title}</h2>
                <div className="card-tags">
                  {project.categories.map(c => {
                    const meta = categoryMeta[c]
                    const iconSrc = meta?.icon ? (CATEGORY_ICON_MAP[meta.icon] || s3Url(meta.icon)) : null
                    const gameName = meta?.gameName || shortName(c)
                    return (
                      <span key={c} className="tag" title={gameName}>
                        {iconSrc
                          ? <img src={iconSrc} alt={gameName} className="tag-icon" />
                          : gameName}
                      </span>
                    )
                  })}
                </div>
              </div>
              {project.minimap && (
                <div
                  className="card-minimap"
                  {...(isVerticalLayout
                    ? { style: { cursor: 'default', pointerEvents: 'none' } }
                    : {
                        onClick: e => { e.stopPropagation(); setLightboxInitialMinimap(true); setLightboxIndex(idx) },
                        title: 'View minimap',
                        role: 'button',
                        tabIndex: 0,
                        onKeyDown: e => e.key === 'Enter' && (e.stopPropagation(), setLightboxInitialMinimap(true), setLightboxIndex(idx)),
                      })}
                >
                  <img
                    src={minimapThumbUrl(project.minimap)}
                    alt="Minimap"
                    loading={idx < 6 ? 'eager' : 'lazy'}
                    decoding="async"
                    onError={e => { e.currentTarget.onerror = null; e.currentTarget.src = s3Url(project.minimap) }}
                  />
                </div>
              )}
            </div>
          </article>
        ))}
      </main>

      <footer className="site-footer">
        <p>Website built by <a href="https://github.com/MosesHoggatt" target="_blank" rel="noopener noreferrer">Moses Hoggatt</a></p>
        <p>&copy; {new Date().getFullYear()} Adam Hoggatt. All rights reserved.</p>
      </footer>

      {lightboxIndex !== null && (
        <Lightbox
          project={filteredProjects[lightboxIndex]}
          allProjects={filteredProjects}
          projectIndex={lightboxIndex}
          totalProjects={filteredProjects.length}
          onPrevProject={() => setLightboxIndex(i => (i - 1 + filteredProjects.length) % filteredProjects.length)}
          onNextProject={() => setLightboxIndex(i => (i + 1) % filteredProjects.length)}
          onClose={() => setLightboxIndex(null)}
          initialShowMinimap={lightboxInitialMinimap}
        />
      )}

      {showBioModal && (
        <div className="bio-modal-backdrop" onClick={() => setShowBioModal(false)}>
          <div className="bio-modal" onClick={e => e.stopPropagation()}>
            <button className="bio-modal-close" onClick={() => setShowBioModal(false)} aria-label="Close">✕</button>
            <img src={heroPhotoSrc} alt="Adam Hoggatt" className="bio-modal-photo" />
            <div className="bio-modal-content">
              <h2 className="bio-modal-name">Adam Hoggatt</h2>
              <p className="bio-modal-role">Expert Level Designer · Treyarch · Since 2008</p>
              {profile?.bio
                ? <p className="bio-modal-bio">{parseBioLinks(profile.bio)}</p>
                : <p className="bio-modal-bio bio-modal-empty">Bio coming soon.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Portfolio
