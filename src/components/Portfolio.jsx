import { useState, useEffect } from 'react'
import { list, getUrl, downloadData } from 'aws-amplify/storage'
import awsConfig from '../aws-exports'
import Lightbox from './Lightbox'
import heroShot from '../assets/AdamHoggattHeroShot.jpg'
import './Portfolio.css'

// Returns true only if Amplify Storage has been configured with real AWS values.
const isAmplifyConfigured = () => {
  const bucket = awsConfig?.Storage?.S3?.bucket
  return bucket && !bucket.startsWith('YOUR_')
}

const shortName = (str) => str.replace('Call of Duty: ', '')

const Portfolio = () => {
  const [projects, setProjects] = useState([])   // full project objects from S3
  const [allCategories, setAllCategories] = useState([]) // derived from loaded data
  const [activeFilter, setActiveFilter] = useState('All')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lightboxProject, setLightboxProject] = useState(null)

  /* Lock body scroll when detail panel is open */
  useEffect(() => {
    document.body.style.overflow = lightboxProject ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [lightboxProject])

  useEffect(() => {
    fetchProjects()
  }, [])

  const fetchProjects = async () => {
    if (!isAmplifyConfigured()) {
      // AWS backend not yet connected — show empty state without firing any requests.
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)

      // 1. List every file under projects/
      const result = await list({ path: 'projects/' })

      // 2. Only top-level JSON files are project manifests (e.g. projects/raid.json)
      const jsonFiles = result.items.filter(item =>
        item.path.match(/^projects\/[^/]+\.json$/)
      )

      if (jsonFiles.length === 0) {
        setProjects([])
        setLoading(false)
        return
      }

      // 3. Download and parse each manifest
      const loaded = await Promise.all(
        jsonFiles.map(async (file) => {
          try {
            const dl = await downloadData({ path: file.path }).result
            const data = JSON.parse(await dl.body.text())

            // 4. Resolve the thumbnail URL from the first image path in the manifest
            let thumbnailUrl = null
            if (data.images && data.images.length > 0) {
              try {
                const { url } = await getUrl({ path: data.images[0] })
                thumbnailUrl = url.toString()
              } catch { /* image not yet uploaded */ }
            }

            return {
              title: data.title || '',
              slug: data.slug || '',
              description: data.description || '',
              date: data.date || '',
              categories: Array.isArray(data.categories) ? data.categories : [],
              images: Array.isArray(data.images) ? data.images : [],
              thumbnailUrl,
            }
          } catch (err) {
            console.warn('Failed to load project:', file.path, err)
            return null
          }
        })
      )

      const valid = loaded
        .filter(Boolean)
        .sort((a, b) => new Date(b.date) - new Date(a.date))

      // 5. Build the category filter list from whatever is in the data
      const catSet = new Set(valid.flatMap(p => p.categories))
      // keep Warzone filter at the very end of the list
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
    <div className={`portfolio${lightboxProject ? ' portfolio-detail' : ''}`}>
      {/* ── Hero ── */}
      <header className="hero">
        <img src={heroShot} alt="Adam Hoggatt" className="hero-shot" />
        <div className="hero-text">
          <p className="hero-name">Adam Hoggatt</p>
          <h1 className="hero-title">Level Design<br />Portfolio</h1>
          <p className="hero-subtitle">Expert Level Designer · Treyarch</p>
        </div>
      </header>

      {/* ── Filter bar (built dynamically from loaded category data) ── */}
      {!lightboxProject && allCategories.length > 0 && (
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
      {!lightboxProject && (
        <main className="projects-grid">
          {loading && <p className="status-msg">Loading projects…</p>}
          {error  && <p className="status-msg error-msg">{error}</p>}
          {!loading && !error && projects.length === 0 && (
            <p className="status-msg">No projects yet. Check back soon.</p>
          )}

          {filteredProjects.map(project => (
            <article
              key={project.slug}
              className="project-card"
              onClick={() => setLightboxProject(project)}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && setLightboxProject(project)}
            >
              <div className="card-image">
                {project.thumbnailUrl
                  ? <img src={project.thumbnailUrl} alt={project.title} />
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
      )}

      {!lightboxProject && (
        <footer className="site-footer">
          <p>&copy; {new Date().getFullYear()} Adam Hoggatt. All rights reserved.</p>
        </footer>
      )}

      {lightboxProject && (
        <Lightbox project={lightboxProject} onClose={() => setLightboxProject(null)} />
      )}
    </div>
  )
}

export default Portfolio
