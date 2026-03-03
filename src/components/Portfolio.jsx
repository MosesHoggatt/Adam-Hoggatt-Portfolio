import { useState, useEffect } from 'react'
import { list, getUrl } from 'aws-amplify/storage'
import './Portfolio.css'

// ─── Static project catalogue ───────────────────────────────────────────────
// Images are loaded from S3 (keyed by slug). Cards render without images until
// assets are uploaded via the Admin Dashboard.
const STATIC_PROJECTS = [
  // Call of Duty: Black Ops 6
  { title: 'Warhead',        slug: 'warhead',        categories: ['Call of Duty: Black Ops 6'] },
  { title: 'Vorkuta',        slug: 'vorkuta',        categories: ['Call of Duty: Black Ops 6'] },
  { title: 'Skyline',        slug: 'skyline',        categories: ['Call of Duty: Black Ops 6'] },
  { title: 'Vault',          slug: 'vault',          categories: ['Call of Duty: Black Ops 6'] },
  // Call of Duty: Black Ops Cold War / Warzone
  { title: 'Echelon',        slug: 'echelon',        categories: ['Call of Duty: Black Ops Cold War'] },
  { title: 'Hijacked Gulag', slug: 'hijacked-gulag', categories: ['Call of Duty: Warzone'] },
  { title: 'Cartel',         slug: 'cartel',         categories: ['Call of Duty: Black Ops Cold War'] },
  { title: 'Moscow',         slug: 'moscow',         categories: ['Call of Duty: Black Ops Cold War'] },
  // Call of Duty: Black Ops 4
  { title: 'Der Schatten',   slug: 'der-schatten',   categories: ['Call of Duty: Black Ops 4'] },
  { title: 'Remnant',        slug: 'remnant',        categories: ['Call of Duty: Black Ops 4'] },
  { title: 'Lockup',         slug: 'lockup',         categories: ['Call of Duty: Black Ops 4'] },
  { title: 'Masquerade',     slug: 'masquerade',     categories: ['Call of Duty: Black Ops 4'] },
  { title: 'Frequency',      slug: 'frequency',      categories: ['Call of Duty: Black Ops 4'] },
  { title: 'Contraband',     slug: 'contraband',     categories: ['Call of Duty: Black Ops 4'] },
  // Call of Duty: Black Ops 3
  { title: 'Micro',          slug: 'micro',          categories: ['Call of Duty: Black Ops 3'] },
  { title: 'Citadel',        slug: 'citadel',        categories: ['Call of Duty: Black Ops 3'] },
  { title: 'Spire',          slug: 'spire',          categories: ['Call of Duty: Black Ops 3'] },
  { title: 'Berserk',        slug: 'berserk',        categories: ['Call of Duty: Black Ops 3'] },
  { title: 'Gauntlet',       slug: 'gauntlet',       categories: ['Call of Duty: Black Ops 3'] },
  { title: 'Metro',          slug: 'metro',          categories: ['Call of Duty: Black Ops 3'] },
  { title: 'Aquarium',       slug: 'aquarium',       categories: ['Call of Duty: Black Ops 3'] },
  { title: 'Redwood',        slug: 'redwood',        categories: ['Call of Duty: Black Ops 3'] },
  // Call of Duty: Black Ops 2
  { title: 'Frost',          slug: 'frost',          categories: ['Call of Duty: Black Ops 2'] },
  { title: 'Encore',         slug: 'encore',         categories: ['Call of Duty: Black Ops 2'] },
  { title: 'Raid',           slug: 'raid',           categories: ['Call of Duty: Black Ops 2', 'Call of Duty: Black Ops 3', 'Call of Duty: Black Ops 4', 'Call of Duty: Black Ops Cold War'] },
  { title: 'Overflow',       slug: 'overflow',       categories: ['Call of Duty: Black Ops 2'] },
  { title: 'Meltdown',       slug: 'meltdown',       categories: ['Call of Duty: Black Ops 2'] },
  // Call of Duty: Black Ops
  { title: 'Drive In',       slug: 'drive-in',       categories: ['Call of Duty: Black Ops', 'Call of Duty: Black Ops Cold War'] },
  { title: 'Discovery',      slug: 'discovery',      categories: ['Call of Duty: Black Ops'] },
  { title: 'Cracked',        slug: 'cracked',        categories: ['Call of Duty: Black Ops'] },
  { title: 'Nuketown',       slug: 'nuketown',       categories: ['Call of Duty: Black Ops', 'Call of Duty: Black Ops 2', 'Call of Duty: Black Ops 3', 'Call of Duty: Black Ops 4', 'Call of Duty: Black Ops 6'] },
  { title: 'Radiation',      slug: 'radiation',      categories: ['Call of Duty: Black Ops'] },
  // Call of Duty: World at War
  { title: 'Knee Deep',      slug: 'knee-deep',      categories: ['Call of Duty: World at War'] },
  { title: 'Cliffside/Hazard', slug: 'cliffside',    categories: ['Call of Duty: Black Ops', 'Call of Duty: World at War'] },
  { title: 'Upheaval',       slug: 'upheaval',       categories: ['Call of Duty: World at War'] },
]

const ALL_GAMES = [
  'Call of Duty: Black Ops 6',
  'Call of Duty: Black Ops Cold War',
  'Call of Duty: Warzone',
  'Call of Duty: Black Ops 4',
  'Call of Duty: Black Ops 3',
  'Call of Duty: Black Ops 2',
  'Call of Duty: Black Ops',
  'Call of Duty: World at War',
]

const shortName = (game) => game.replace('Call of Duty: ', '')

const Portfolio = () => {
  const [imageMap, setImageMap] = useState({}) // slug → first image URL
  const [activeFilter, setActiveFilter] = useState('All')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchImages()
  }, [])

  // Load the first available image for each project slug from S3.
  // Cards render immediately from static data; images fill in asynchronously.
  const fetchImages = async () => {
    try {
      const result = await list({ path: 'projects/' })
      const imageFiles = result.items.filter(item =>
        /\.(jpe?g|png|gif|webp)$/i.test(item.path)
      )

      const entries = await Promise.all(
        STATIC_PROJECTS.map(async ({ slug }) => {
          const match = imageFiles.find(f => f.path.includes(`/${slug}/`))
          if (!match) return [slug, null]
          try {
            const { url } = await getUrl({ path: match.path })
            return [slug, url.toString()]
          } catch {
            return [slug, null]
          }
        })
      )

      setImageMap(Object.fromEntries(entries))
    } catch (err) {
      console.warn('S3 unavailable; showing cards without images.', err)
    } finally {
      setLoading(false)
    }
  }

  const filteredProjects = activeFilter === 'All'
    ? STATIC_PROJECTS
    : STATIC_PROJECTS.filter(p => p.categories.includes(activeFilter))

  return (
    <div className="portfolio">
      {/* ── Hero ── */}
      <header className="hero">
        <div className="hero-inner">
          <h1 className="hero-title">Level Design</h1>
          <p className="hero-bio">
            As Expert Level Designer at Treyarch, my primary responsibility is gameplay design,
            and I have created many popular maps in the Call of Duty franchise with the help of
            many talented members of the Treyarch team. Though others have contributed to the
            design of many of these, and I have contributed to many others, this is a list of
            the maps I consider to be mostly (or all) my design work. A few of the most notable
            maps I've designed include Nuketown, Raid, Moscow, Contraband and Skyline.
          </p>
        </div>
      </header>

      {/* ── Filter bar ── */}
      <div className="filter-bar">
        {['All', ...ALL_GAMES].map(game => (
          <button
            key={game}
            className={`filter-btn${activeFilter === game ? ' active' : ''}`}
            onClick={() => setActiveFilter(game)}
          >
            {game === 'All' ? 'All' : shortName(game)}
          </button>
        ))}
      </div>

      {/* ── Grid ── */}
      <main className="projects-grid">
        {loading && <p className="status-msg">Loading images…</p>}

        {filteredProjects.map(project => (
          <article key={project.slug} className="project-card">
            <div className="card-image">
              {imageMap[project.slug]
                ? <img src={imageMap[project.slug]} alt={project.title} />
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
    </div>
  )
}

export default Portfolio
