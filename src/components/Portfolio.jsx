import { useState, useEffect } from 'react'
import awsConfig from '../aws-exports'
import Lightbox from './Lightbox'
import heroShot from '../assets/AdamHoggattHeroShot.jpg'
import heroBanner from '../assets/AdamHoggattBanner.jpg'
import './Portfolio.css'

const S3_BASE = `https://${awsConfig.Storage.S3.bucket}.s3.${awsConfig.Storage.S3.region}.amazonaws.com`

// Convert an S3 storage path (e.g. "projects/raid/images/raid.jpg")
// to a public HTTPS URL — no signing, no Cognito needed.
const s3Url = (path) => `${S3_BASE}/${path}`

const shortName = (str) => str.replace('Call of Duty: ', '')

const Portfolio = () => {
  const [projects, setProjects] = useState([])
  const [allCategories, setAllCategories] = useState([])
  const [activeFilters, setActiveFilters] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lightboxIndex, setLightboxIndex] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortOrder, setSortOrder] = useState('date-desc')
  const [profile, setProfile] = useState(null)
  const [showBioModal, setShowBioModal] = useState(false)

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
            const res = await fetch(s3Url(path), { cache: 'no-cache' })
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
      let cats = [...catSet]
      const warzone = 'Call of Duty: Warzone'
      if (cats.includes(warzone)) {
        cats = cats.filter(c => c !== warzone).concat(warzone)
      }
      setAllCategories(cats)
      setProjects(valid)
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

  const heroPhotoSrc = profile?.photoPath ? s3Url(profile.photoPath) : heroShot

  return (
    <div className="portfolio">
      {/* ── Hero ── */}
      <header className="hero" style={{ '--hero-bg': `url(${heroBanner})` }}>
        <div className="hero-overlay">
          <div className="hero-inner">
            <img
              src={heroPhotoSrc}
              alt="Adam Hoggatt"
              className="hero-shot hero-shot-clickable"
              onClick={() => setShowBioModal(true)}
              title="View bio"
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
          {['All', ...[...allCategories].reverse()].map(cat => {
            const isAll = cat === 'All'
            const isActive = isAll ? activeFilters.size === 0 : activeFilters.has(cat)
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
              >
                {isAll ? 'All' : shortName(cat)}
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
            onClick={() => setLightboxIndex(idx)}
            role="button"
            tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && setLightboxIndex(idx)}
          >
            <div className="card-image">
              {project.images.length > 0
                ? <img src={s3Url(project.images[0])} alt={project.title} loading="lazy" />
                : <div className="image-placeholder" />}
            </div>
            <div className="card-body">
              <h2 className="card-title">{project.title}</h2>
              <div className="card-tags">
                {project.categories.map(c => (
                  <span key={c} className="tag">{shortName(c)}</span>
                ))}
              </div>
            </div>
          </article>
        ))}
      </main>

      <footer className="site-footer">
        <p>&copy; {new Date().getFullYear()} Adam Hoggatt. All rights reserved.</p>
      </footer>

      {lightboxIndex !== null && (
        <Lightbox
          project={filteredProjects[lightboxIndex]}
          projectIndex={lightboxIndex}
          totalProjects={filteredProjects.length}
          onPrevProject={() => setLightboxIndex(i => Math.max(i - 1, 0))}
          onNextProject={() => setLightboxIndex(i => Math.min(i + 1, filteredProjects.length - 1))}
          onClose={() => setLightboxIndex(null)}
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
                ? <p className="bio-modal-bio">{profile.bio}</p>
                : <p className="bio-modal-bio bio-modal-empty">Bio coming soon.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Portfolio
