import { useState, useEffect } from 'react'
import awsConfig from '../aws-exports'
import Lightbox from './Lightbox'
import heroShot from '../assets/AdamHoggattHeroShot.jpg'
import './Portfolio.css'

const S3_BASE = `https://${awsConfig.Storage.S3.bucket}.s3.${awsConfig.Storage.S3.region}.amazonaws.com`

// Convert an S3 storage path (e.g. "projects/raid/images/raid.jpg")
// to a public HTTPS URL — no signing, no Cognito needed.
const s3Url = (path) => `${S3_BASE}/${path}`

const shortName = (str) => str.replace('Call of Duty: ', '')

const Portfolio = () => {
  const [projects, setProjects] = useState([])
  const [allCategories, setAllCategories] = useState([])
  const [activeFilter, setActiveFilter] = useState('All')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lightboxIndex, setLightboxIndex] = useState(null)

  useEffect(() => {
    fetchProjects()
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

  const filteredProjects = activeFilter === 'All'
    ? projects
    : projects.filter(p => p.categories.includes(activeFilter))

  return (
    <div className="portfolio">
      {/* ── Hero ── */}
      <header className="hero">
        <div className="hero-inner">
          <img src={heroShot} alt="Adam Hoggatt" className="hero-shot" />
          <div className="hero-text">
            <h1 className="hero-title">Adam Hoggatt</h1>
            <p className="hero-subtitle">Level Design Portfolio</p>
            <p className="hero-role">Expert Level Designer · Treyarch</p>
          </div>
        </div>
      </header>

      {/* ── Filter bar (built dynamically from loaded category data) ── */}
      {allCategories.length > 0 && (
        <div className="filter-bar">
          {/* we display ‘All’ followed by categories in reverse order */}
          {['All', ...[...allCategories].reverse()].map(cat => (
            <button
              key={cat}
              className={`filter-btn${activeFilter === cat ? ' active' : ''}`}
              onClick={() => setActiveFilter(cat)}
            >
              {cat === 'All' ? 'All' : shortName(cat)}
            </button>
          ))}
        </div>
      )}

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
    </div>
  )
}

export default Portfolio
