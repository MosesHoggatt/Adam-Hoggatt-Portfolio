import { useState, useEffect } from 'react'
import { list, getUrl, downloadData } from 'aws-amplify/storage'
import Card from '../Card'
import './Portfolio.css'

const Portfolio = () => {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchProjects()
  }, [])

  const fetchProjects = async () => {
    try {
      setLoading(true)
      setError(null)
      
      // List all files in the projects folder
      const result = await list({ path: 'projects/' })
      
      // Filter for .json files
      const jsonFiles = result.items.filter(file => file.path.endsWith('.json'))
      
      if (jsonFiles.length === 0) {
        setProjects([])
        setLoading(false)
        return
      }

      // Fetch and parse each project JSON
      const projectsData = await Promise.all(
        jsonFiles.map(async (file) => {
          try {
            const downloadResult = await downloadData({ path: file.path }).result
            const text = await downloadResult.body.text()
            const projectData = JSON.parse(text)
            
            // Get public URLs for images
            const imageUrls = await Promise.all(
              (projectData.images || []).map(async (imagePath) => {
                try {
                  const urlResult = await getUrl({ path: imagePath })
                  return urlResult.url.toString()
                } catch (err) {
                  console.error('Error fetching image:', err)
                  return null
                }
              })
            )
            
            return {
              ...projectData,
              imageUrls: imageUrls.filter(url => url !== null)
            }
          } catch (err) {
            console.error('Error fetching project:', err)
            return null
          }
        })
      )
      
      // Filter out any failed project loads and sort by date (newest first)
      const validProjects = projectsData
        .filter(p => p !== null)
        .sort((a, b) => new Date(b.date) - new Date(a.date))
      
      setProjects(validProjects)
    } catch (error) {
      console.error('Error fetching projects:', error)
      setError('Failed to load projects. Please try again later.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <header className="header">
        <img src="/src/assets/adam-hoggatt-logo.jpg" alt="Adam Hoggatt Logo" className="logo" />
        <nav className="nav">
          <a href="#about">About</a>
          <a href="#projects">Projects</a>
        </nav>
      </header>

      <div className="portfolio">
        <section id="about" className="about">
          <h2>About Me</h2>
          <p>
            As a Level Designer at Treyarch, my primary responsibility is gameplay design, and I have created many popular maps in the Call of Duty franchise with the help of many talented members of the Treyarch team. Though others have contributed to the design of many of these, and I have contributed to many others, this is a list of the maps I consider to be mostly (or all) my design work.
          </p>
        </section>

        <section id="projects" className="projects">
          <h2>My Projects</h2>
          
          {loading && (
            <div className="loading">
              <p>Loading projects...</p>
            </div>
          )}
          
          {error && (
            <div className="error">
              <p>{error}</p>
            </div>
          )}
          
          {!loading && !error && projects.length === 0 && (
            <div className="empty-state">
              <p>No projects available yet. Check back soon!</p>
            </div>
          )}
          
          {!loading && !error && projects.length > 0 && (
            <div className="grid">
              {projects.map((project, index) => (
                <div key={index} className="project-card">
                  <div className="project-images">
                    {project.imageUrls && project.imageUrls.length > 0 ? (
                      <img 
                        src={project.imageUrls[0]} 
                        alt={project.title}
                        className="project-thumbnail"
                      />
                    ) : (
                      <div className="no-image">No image</div>
                    )}
                  </div>
                  <div className="project-content">
                    <h3>{project.title}</h3>
                    <p className="project-description">{project.description}</p>
                    <div className="project-meta">
                      <span className="project-date">{new Date(project.date).toLocaleDateString()}</span>
                      {project.imageUrls && project.imageUrls.length > 1 && (
                        <span className="image-count">{project.imageUrls.length} images</span>
                      )}
                    </div>
                    
                    {project.imageUrls && project.imageUrls.length > 1 && (
                      <div className="additional-images">
                        {project.imageUrls.slice(1).map((url, idx) => (
                          <img 
                            key={idx}
                            src={url} 
                            alt={`${project.title} - ${idx + 2}`}
                            className="additional-image"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <footer className="footer">
        <p>&copy; {new Date().getFullYear()} Adam Hoggatt Portfolio. All rights reserved.</p>
      </footer>
    </>
  )
}

export default Portfolio
