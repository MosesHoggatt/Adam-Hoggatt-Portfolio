import { useState, useEffect } from 'react'
import { uploadData, list, getUrl, downloadData, remove } from 'aws-amplify/storage'
import './AdminDashboard.css'

const AdminDashboard = () => {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    date: new Date().toISOString().split('T')[0],
    categories: '', // comma-separated, e.g. "Call of Duty: Black Ops 4, Call of Duty: Black Ops 3"
  })
  const [selectedImages, setSelectedImages] = useState([])
  const [imagePreviews, setImagePreviews] = useState([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState({ text: '', type: '' })
  const [projects, setProjects] = useState([])
  const [loadingProjects, setLoadingProjects] = useState(true)

  useEffect(() => {
    fetchProjects()
  }, [])

  const fetchProjects = async () => {
    try {
      setLoadingProjects(true)
      const result = await list({ path: 'projects/' })
      
      // Filter for .json files
      const jsonFiles = result.items.filter(file => file.path.endsWith('.json'))
      
      // Fetch and parse each project JSON
      const projectsData = await Promise.all(
        jsonFiles.map(async (file) => {
          try {
            const downloadResult = await downloadData({ path: file.path }).result
            const text = await downloadResult.body.text()
            const data = JSON.parse(text)
            return { ...data, key: file.path }
          } catch (err) {
            console.error('Error fetching project:', err)
            return null
          }
        })
      )
      
      setProjects(projectsData.filter(p => p !== null))
    } catch (error) {
      console.error('Error fetching projects:', error)
      setMessage({ text: 'Error loading projects', type: 'error' })
    } finally {
      setLoadingProjects(false)
    }
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleImageSelect = (e) => {
    const files = Array.from(e.target.files)
    setSelectedImages(files)
    
    // Create previews
    const previews = files.map(file => URL.createObjectURL(file))
    setImagePreviews(previews)
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    
    const files = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('image/'))
    setSelectedImages(files)
    
    const previews = files.map(file => URL.createObjectURL(file))
    setImagePreviews(previews)
  }

  const generateSlug = (title) => {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!formData.title || !formData.description) {
      setMessage({ text: 'Please fill in all required fields', type: 'error' })
      return
    }

    if (selectedImages.length === 0) {
      setMessage({ text: 'Please select at least one image', type: 'error' })
      return
    }

    setLoading(true)
    setMessage({ text: '', type: '' })

    try {
      const slug = generateSlug(formData.title)
      
      // Upload images
      const imageKeys = []
      for (let i = 0; i < selectedImages.length; i++) {
        const file = selectedImages[i]
        const fileExtension = file.name.split('.').pop()
        const fileName = `image-${i + 1}.${fileExtension}`
        const path = `projects/${slug}/images/${fileName}`
        
        await uploadData({
          path: path,
          data: file,
          options: {
            contentType: file.type,
          }
        }).result
        
        imageKeys.push(path)
      }

      // Parse comma-separated categories into an array, trimming whitespace
      const categories = formData.categories
        .split(',')
        .map(c => c.trim())
        .filter(Boolean)

      // Create project metadata
      const projectData = {
        title: formData.title,
        description: formData.description,
        date: formData.date,
        categories,
        images: imageKeys,
        slug: slug,
        createdAt: new Date().toISOString(),
      }

      // Upload project JSON
      const jsonPath = `projects/${slug}.json`
      await uploadData({
        path: jsonPath,
        data: JSON.stringify(projectData, null, 2),
        options: {
          contentType: 'application/json',
        }
      }).result

      setMessage({ text: 'Project uploaded successfully!', type: 'success' })
      
      // Reset form
      setFormData({
        title: '',
        description: '',
        date: new Date().toISOString().split('T')[0],
        categories: '',
      })
      setSelectedImages([])
      setImagePreviews([])
      
      // Refresh projects list
      fetchProjects()
    } catch (error) {
      console.error('Error uploading project:', error)
      setMessage({ text: `Error: ${error.message}`, type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteProject = async (projectKey, projectSlug) => {
    if (!window.confirm('Are you sure you want to delete this project?')) {
      return
    }

    try {
      setLoading(true)
      
      // Delete project JSON
      await remove({ path: projectKey })
      
      // Delete project images
      const imageFolder = `projects/${projectSlug}/images/`
      const imageFiles = await list({ path: imageFolder })
      
      for (const file of imageFiles.items) {
        await remove({ path: file.path })
      }
      
      setMessage({ text: 'Project deleted successfully', type: 'success' })
      fetchProjects()
    } catch (error) {
      console.error('Error deleting project:', error)
      setMessage({ text: `Error deleting project: ${error.message}`, type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="admin-dashboard">
      <div className="admin-container">
        <h1>Admin Dashboard</h1>
        
        {message.text && (
          <div className={`message ${message.type}`}>
            {message.text}
          </div>
        )}

        <section className="upload-section">
          <h2>Add New Project</h2>
          <form onSubmit={handleSubmit} className="project-form">
            <div className="form-group">
              <label htmlFor="title">Project Title *</label>
              <input
                type="text"
                id="title"
                name="title"
                value={formData.title}
                onChange={handleInputChange}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="description">Description *</label>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                rows="4"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="date">Date</label>
              <input
                type="date"
                id="date"
                name="date"
                value={formData.date}
                onChange={handleInputChange}
              />
            </div>

            <div className="form-group">
              <label htmlFor="categories">
                Game Categories
                <span className="field-hint"> — comma-separated (e.g. Call of Duty: Black Ops 4, Call of Duty: Black Ops 3)</span>
              </label>
              <input
                type="text"
                id="categories"
                name="categories"
                value={formData.categories}
                onChange={handleInputChange}
                placeholder="Call of Duty: Black Ops 4, Call of Duty: Black Ops 3"
              />
            </div>

            <div className="form-group">
              <label>Project Images *</label>
              <div
                className="drop-zone"
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => document.getElementById('image-input').click()}
              >
                <p>Drag & drop images here or click to select</p>
                <input
                  type="file"
                  id="image-input"
                  multiple
                  accept="image/*"
                  onChange={handleImageSelect}
                  style={{ display: 'none' }}
                />
              </div>
            </div>

            {imagePreviews.length > 0 && (
              <div className="image-previews">
                <h3>Selected Images ({imagePreviews.length})</h3>
                <div className="preview-grid">
                  {imagePreviews.map((preview, index) => (
                    <div key={index} className="preview-item">
                      <img src={preview} alt={`Preview ${index + 1}`} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button type="submit" disabled={loading} className="submit-btn">
              {loading ? 'Uploading...' : 'Upload Project'}
            </button>
          </form>
        </section>

        <section className="projects-section">
          <h2>Existing Projects</h2>
          
          {loadingProjects ? (
            <p>Loading projects...</p>
          ) : projects.length === 0 ? (
            <p>No projects found. Upload your first project above!</p>
          ) : (
            <div className="projects-list">
              {projects.map((project, index) => (
                <div key={index} className="project-item">
                  <div className="project-info">
                    <h3>{project.title}</h3>
                    <p>{project.description}</p>
                    <small>Date: {project.date} | Images: {project.images?.length || 0}</small>
                  </div>
                  <div className="project-actions">
                    <button
                      onClick={() => handleDeleteProject(project.key, project.slug)}
                      disabled={loading}
                      className="delete-btn"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

export default AdminDashboard
