import { useState, useEffect, useCallback, useRef } from 'react'
import { uploadData, remove } from 'aws-amplify/storage'
import { useAuthenticator } from '@aws-amplify/ui-react'
import awsConfig from '../aws-exports'
import './AdminDashboard.css'

const S3_BASE = `https://${awsConfig.Storage.S3.bucket}.s3.${awsConfig.Storage.S3.region}.amazonaws.com`
const s3Url = (path) => `${S3_BASE}/${path}`

const slugify = (str) =>
  str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

/* ══════════════════════════════════════════════════════════════════
   A D M I N   D A S H B O A R D
   ══════════════════════════════════════════════════════════════════ */
const AdminDashboard = () => {
  const { signOut, user } = useAuthenticator()

  /* ── Global state ──────────────────────────────────────────── */
  const [projects, setProjects] = useState([])
  const [allCategories, setAllCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)

  /* ── View state ────────────────────────────────────────────── */
  const [view, setView] = useState('list') // 'list' | 'editor'
  const [searchQuery, setSearchQuery] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)

  /* ── Editor state ──────────────────────────────────────────── */
  const [editSlug, setEditSlug] = useState(null) // null = new project
  const [form, setForm] = useState({
    title: '', slug: '', description: '', date: '',
    categories: [], responsibilities: [],
  })
  const [imageList, setImageList] = useState([])
  const [removedPaths, setRemovedPaths] = useState([])
  const [catInput, setCatInput] = useState('')
  const [showCatDropdown, setShowCatDropdown] = useState(false)
  const [dragOverIndex, setDragOverIndex] = useState(null)
  const [minimapIndex, setMinimapIndex] = useState(null)
  const [showUnsavedModal, setShowUnsavedModal] = useState(false)
  const [newCatInput, setNewCatInput] = useState('')
  const [showNewCatRow, setShowNewCatRow] = useState(false)

  /* ── Refs ──────────────────────────────────────────────────── */
  const fileInputRef = useRef(null)
  const dragItem = useRef(null)
  const dragOverItem = useRef(null)
  const toastTimer = useRef(null)
  const isDirtyRef = useRef(false)

  /* ════════════════════════════════════════════════════════════════
     DATA LOADING
     ════════════════════════════════════════════════════════════════ */
  const showToast = useCallback((msg, type = 'success') => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ msg, type })
    toastTimer.current = setTimeout(() => setToast(null), 4000)
  }, [])

  const fetchProjects = useCallback(async () => {
    try {
      setLoading(true)
      const indexRes = await fetch(s3Url('projects/index.json'), { cache: 'no-cache' })
      if (!indexRes.ok) throw new Error('Failed to load index')
      const paths = await indexRes.json()
      const loaded = await Promise.all(
        paths.map(async (p) => {
          try {
            const res = await fetch(s3Url(p), { cache: 'no-cache' })
            return await res.json()
          } catch { return null }
        })
      )
      const valid = loaded.filter(Boolean).sort((a, b) =>
        (a.title || '').localeCompare(b.title || ''))
      setProjects(valid)
      const cats = new Set(valid.flatMap(p => p.categories || []))
      // Merge with global categories.json if it exists
      try {
        const catRes = await fetch(s3Url('projects/categories.json'), { cache: 'no-cache' })
        if (catRes.ok) {
          const globalCats = await catRes.json()
          globalCats.forEach(c => cats.add(c))
        }
      } catch {}
      setAllCategories([...cats].sort())
    } catch (err) {
      console.error('Error loading projects:', err)
      showToast('Error loading levels', 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => { fetchProjects() }, [fetchProjects])

  /* Add noindex meta tag to hide admin from search engines */
  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex, nofollow'
    document.head.appendChild(meta)
    return () => { if (meta.parentNode) meta.parentNode.removeChild(meta) }
  }, [])

  /* ════════════════════════════════════════════════════════════════
     INDEX REBUILD
     ════════════════════════════════════════════════════════════════ */
  const rebuildIndex = useCallback(async (updatedProjects) => {
    const paths = updatedProjects.map(p => `projects/${p.slug}.json`).sort()
    await uploadData({
      path: 'projects/index.json',
      data: JSON.stringify(paths),
      options: {
        contentType: 'application/json',
        metadata: { 'Cache-Control': 'no-cache, max-age=0' },
      },
    }).result
  }, [])

  /* ════════════════════════════════════════════════════════════════
     EDITOR OPEN / CLOSE
     ════════════════════════════════════════════════════════════════ */
  const openEditor = (project = null) => {
    isDirtyRef.current = false
    setMinimapIndex(null)
    if (project) {
      setEditSlug(project.slug)
      setForm({
        title: project.title || '',
        slug: project.slug || '',
        description: project.description || '',
        date: project.date || '',
        categories: [...(project.categories || [])],
        responsibilities: [...(project.responsibilities || [])],
      })
      const galleryItems = (project.images || []).map((path, i) => ({
        id: `existing-${i}-${Date.now()}`,
        path,
        file: null,
        preview: s3Url(path),
      }))
      if (project.minimap) {
        const mmItem = {
          id: `minimap-${Date.now()}`,
          path: project.minimap,
          file: null,
          preview: s3Url(project.minimap),
        }
        setImageList([...galleryItems, mmItem])
        setMinimapIndex(galleryItems.length)
      } else {
        setImageList(galleryItems)
      }
    } else {
      setEditSlug(null)
      setForm({
        title: '', slug: '', description: '',
        date: new Date().toISOString().split('T')[0],
        categories: [], responsibilities: [],
      })
      setImageList([])
    }
    setRemovedPaths([])
    setCatInput('')
    setView('editor')
  }

  const closeEditor = () => {
    if (isDirtyRef.current) {
      setShowUnsavedModal(true)
      return
    }
    imageList.forEach(item => { if (item.file) URL.revokeObjectURL(item.preview) })
    setView('list')
    setEditSlug(null)
  }

  const confirmDiscard = () => {
    isDirtyRef.current = false
    setShowUnsavedModal(false)
    imageList.forEach(item => { if (item.file) URL.revokeObjectURL(item.preview) })
    setView('list')
    setEditSlug(null)
  }

  /* ════════════════════════════════════════════════════════════════
     SAVE PROJECT
     ════════════════════════════════════════════════════════════════ */
  const saveProject = async () => {
    if (!form.title.trim()) { showToast('Title is required', 'error'); return }
    if (!form.slug.trim()) { showToast('Slug is required', 'error'); return }
    setSaving(true)
    try {
      const slug = form.slug.trim()

      // 1. Upload gallery images + minimap separately
      const finalImages = []
      let finalMinimap = null
      for (let i = 0; i < imageList.length; i++) {
        const item = imageList[i]
        let resolvedPath = null
        if (item.path) {
          resolvedPath = item.path
        } else if (item.file) {
          const fileName = item.file.name.replace(/\s+/g, '-')
          const path = `projects/${slug}/images/${fileName}`
          await uploadData({
            path,
            data: item.file,
            options: { contentType: item.file.type },
          }).result
          resolvedPath = path
        }
        if (resolvedPath) {
          if (i === minimapIndex) finalMinimap = resolvedPath
          else finalImages.push(resolvedPath)
        }
      }

      // 2. Delete removed images
      for (const path of removedPaths) {
        try { await remove({ path }) } catch (e) {
          console.warn('Failed to delete:', path, e)
        }
      }

      // 3. Build project JSON
      const projectData = {
        title: form.title.trim(),
        slug,
        description: form.description.trim(),
        date: form.date,
        categories: form.categories,
        images: finalImages,
        ...(finalMinimap ? { minimap: finalMinimap } : {}),
        responsibilities: form.responsibilities.filter(r => r.trim()),
        ...(editSlug ? {} : { createdAt: new Date().toISOString() }),
        updatedAt: new Date().toISOString(),
      }

      // 4. If slug changed (edit mode), delete old JSON
      if (editSlug && editSlug !== slug) {
        try { await remove({ path: `projects/${editSlug}.json` }) } catch {}
      }

      // 5. Upload project JSON
      await uploadData({
        path: `projects/${slug}.json`,
        data: JSON.stringify(projectData, null, 4),
        options: {
          contentType: 'application/json',
          metadata: { 'Cache-Control': 'no-cache, max-age=0' },
        },
      }).result

      // 6. Rebuild index
      let updatedProjects
      if (editSlug) {
        updatedProjects = projects.map(p =>
          p.slug === editSlug ? projectData : p)
      } else {
        updatedProjects = [...projects, projectData]
      }
      await rebuildIndex(updatedProjects)

      showToast(editSlug ? 'Level updated' : 'Level created')
      isDirtyRef.current = false
      await fetchProjects()
      closeEditor()
    } catch (err) {
      console.error('Save error:', err)
      showToast(`Save failed: ${err.message}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  /* ════════════════════════════════════════════════════════════════
     DELETE PROJECT
     ════════════════════════════════════════════════════════════════ */
  const deleteProject = async (slug) => {
    setSaving(true)
    try {
      const project = projects.find(p => p.slug === slug)
      if (project?.images) {
        for (const path of project.images) {
          try { await remove({ path }) } catch {}
        }
      }
      await remove({ path: `projects/${slug}.json` })
      const updatedProjects = projects.filter(p => p.slug !== slug)
      await rebuildIndex(updatedProjects)
      showToast('Level deleted')
      await fetchProjects()
      setDeleteTarget(null)
    } catch (err) {
      console.error('Delete error:', err)
      showToast(`Delete failed: ${err.message}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  /* ════════════════════════════════════════════════════════════════
     IMAGE MANAGEMENT
     ════════════════════════════════════════════════════════════════ */
  const handleFileDrop = (e) => {
    e.preventDefault()
    const files = Array.from(e.dataTransfer?.files || [])
      .filter(f => f.type.startsWith('image/'))
    addImages(files)
  }

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || [])
      .filter(f => f.type.startsWith('image/'))
    addImages(files)
    e.target.value = ''
  }

  const addImages = (files) => {
    isDirtyRef.current = true
    const newItems = files.map((file, i) => ({
      id: `new-${Date.now()}-${i}`,
      path: null,
      file,
      preview: URL.createObjectURL(file),
    }))
    setImageList(prev => [...prev, ...newItems])
  }

  const removeImage = (index) => {
    isDirtyRef.current = true
    const item = imageList[index]
    if (item.path) setRemovedPaths(prev => [...prev, item.path])
    if (item.file) URL.revokeObjectURL(item.preview)
    setImageList(prev => prev.filter((_, i) => i !== index))
    setMinimapIndex(prev => {
      if (prev === null) return null
      if (prev === index) return null
      if (prev > index) return prev - 1
      return prev
    })
  }

  const setMainImage = (index) => {
    if (index === 0) return
    isDirtyRef.current = true
    setMinimapIndex(prev => {
      if (prev === null) return null
      if (prev === index) return 0
      if (prev < index) return prev + 1
      return prev
    })
    setImageList(prev => {
      const copy = [...prev]
      const [moved] = copy.splice(index, 1)
      copy.unshift(moved)
      return copy
    })
  }

  const setMinimap = (index) => {
    isDirtyRef.current = true
    setMinimapIndex(prev => prev === index ? null : index)
  }

  const handleDragStart = (e, index) => {
    dragItem.current = index
    e.dataTransfer.effectAllowed = 'move'
  }
  const handleDragEnter = (e, index) => {
    e.preventDefault()
    dragOverItem.current = index
    setDragOverIndex(index)
  }
  const handleDragOver = (e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }
  const handleDrop = (e, index) => {
    e.preventDefault()
    if (dragItem.current === null || dragItem.current === index) {
      setDragOverIndex(null)
      return
    }
    isDirtyRef.current = true
    const from = dragItem.current
    const to = index
    setMinimapIndex(prev => {
      if (prev === null) return null
      if (prev === from) return to
      if (from < to && prev > from && prev <= to) return prev - 1
      if (from > to && prev >= to && prev < from) return prev + 1
      return prev
    })
    setImageList(prev => {
      const copy = [...prev]
      const [moved] = copy.splice(from, 1)
      copy.splice(to, 0, moved)
      return copy
    })
    dragItem.current = null
    dragOverItem.current = null
    setDragOverIndex(null)
  }
  const handleDragEnd = () => {
    dragItem.current = null
    dragOverItem.current = null
    setDragOverIndex(null)
  }

  /* ════════════════════════════════════════════════════════════════
     CATEGORY MANAGEMENT
     ════════════════════════════════════════════════════════════════ */
  const addCategory = (cat) => {
    const trimmed = cat.trim()
    if (!trimmed || form.categories.includes(trimmed)) return
    isDirtyRef.current = true
    setForm(prev => ({ ...prev, categories: [...prev.categories, trimmed] }))
    setCatInput('')
    setShowCatDropdown(false)
  }

  const removeCategory = (cat) => {
    isDirtyRef.current = true
    setForm(prev => ({
      ...prev,
      categories: prev.categories.filter(c => c !== cat),
    }))
  }

  const addGlobalCategory = async () => {
    const trimmed = newCatInput.trim()
    if (!trimmed) return
    const updated = [...new Set([...allCategories, trimmed])].sort()
    setAllCategories(updated)
    setNewCatInput('')
    setShowNewCatRow(false)
    try {
      await uploadData({
        path: 'projects/categories.json',
        data: JSON.stringify(updated),
        options: {
          contentType: 'application/json',
          metadata: { 'Cache-Control': 'no-cache, max-age=0' },
        },
      }).result
      showToast(`Category "${trimmed}" added`)
    } catch (err) {
      showToast('Failed to save category', 'error')
    }
  }

  const removeGlobalCategory = async (cat) => {
    const updated = allCategories.filter(c => c !== cat)
    setAllCategories(updated)
    try {
      await uploadData({
        path: 'projects/categories.json',
        data: JSON.stringify(updated),
        options: {
          contentType: 'application/json',
          metadata: { 'Cache-Control': 'no-cache, max-age=0' },
        },
      }).result
    } catch (err) {
      showToast('Failed to update categories', 'error')
    }
  }

  const filteredCatSuggestions = catInput.trim()
    ? allCategories.filter(c =>
        c.toLowerCase().includes(catInput.toLowerCase()) &&
        !form.categories.includes(c))
    : allCategories.filter(c => !form.categories.includes(c))

  /* ════════════════════════════════════════════════════════════════
     FILTERED LIST
     ════════════════════════════════════════════════════════════════ */
  const filteredProjects = searchQuery.trim()
    ? projects.filter(p =>
        p.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.slug?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.categories || []).some(c =>
          c.toLowerCase().includes(searchQuery.toLowerCase())))
    : projects

  /* ════════════════════════════════════════════════════════════════
     R E N D E R
     ════════════════════════════════════════════════════════════════ */
  return (
    <div className="adm">
      {/* Toast */}
      {toast && (
        <div className={`adm-toast adm-toast-${toast.type}`}
          onClick={() => setToast(null)}>
          {toast.msg}
        </div>
      )}

      {/* Unsaved changes modal */}
      {showUnsavedModal && (
        <div className="adm-modal-backdrop" onClick={() => setShowUnsavedModal(false)}>
          <div className="adm-modal" onClick={e => e.stopPropagation()}>
            <h3>Unsaved Changes</h3>
            <p>You have unsaved changes. Discard them and go back?</p>
            <div className="adm-modal-actions">
              <button className="adm-btn adm-btn-ghost"
                onClick={() => setShowUnsavedModal(false)}>Keep Editing</button>
              <button className="adm-btn adm-btn-danger"
                onClick={confirmDiscard}>Discard Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {deleteTarget && (
        <div className="adm-modal-backdrop" onClick={() => setDeleteTarget(null)}>
          <div className="adm-modal" onClick={e => e.stopPropagation()}>
            <h3>Delete Level</h3>
            <p>
              Are you sure you want to delete <strong>{deleteTarget.title}</strong>?
              This will remove all images and cannot be undone.
            </p>
            <div className="adm-modal-actions">
              <button className="adm-btn adm-btn-ghost"
                onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button className="adm-btn adm-btn-danger" disabled={saving}
                onClick={() => deleteProject(deleteTarget.slug)}>
                {saving ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="adm-header">
        <div className="adm-header-left">
          {view === 'editor' && (
            <button className="adm-btn adm-btn-ghost" onClick={closeEditor}>
              ← Back
            </button>
          )}
          <h1 className="adm-logo">Portfolio Admin</h1>
        </div>
        <div className="adm-header-right">
          <span className="adm-user">
            {user?.signInDetails?.loginId || user?.username}
          </span>
          <button className="adm-btn adm-btn-ghost" onClick={signOut}>
            Sign Out
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="adm-main">
        {view === 'list' ? renderList() : renderEditor()}
      </main>
    </div>
  )

  /* ──────────────────────────────────────────────────────────────
     L I S T   V I E W
     ────────────────────────────────────────────────────────────── */
  function renderList() {
    return (
      <>
        <div className="adm-toolbar">
          <input
            className="adm-search"
            type="text"
            placeholder="Search levels…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          <button className="adm-btn adm-btn-primary"
            onClick={() => openEditor()}>
            + New Level
          </button>
        </div>

        {loading ? (
          <p className="adm-status">Loading levels…</p>
        ) : filteredProjects.length === 0 ? (
          <p className="adm-status">
            {searchQuery ? 'No levels match your search.' : 'No levels yet.'}
          </p>
        ) : (
          <div className="adm-project-grid">
            {filteredProjects.map(project => (
              <div key={project.slug} className="adm-project-card">
                <div className="adm-card-thumb"
                  onClick={() => openEditor(project)}>
                  {project.images?.[0]
                    ? <img src={s3Url(project.images[0])} alt="" loading="lazy" />
                    : <div className="adm-card-no-img">No Image</div>}
                </div>
                <div className="adm-card-body"
                  onClick={() => openEditor(project)}>
                  <h3 className="adm-card-title">{project.title}</h3>
                  <div className="adm-card-meta">
                    <span>{project.images?.length || 0} images</span>
                    <span>{project.categories?.length || 0} categories</span>
                  </div>
                </div>
                <div className="adm-card-actions">
                  <button className="adm-btn adm-btn-sm adm-btn-ghost"
                    onClick={() => openEditor(project)}>Edit</button>
                  <button className="adm-btn adm-btn-sm adm-btn-danger"
                    onClick={() => setDeleteTarget(project)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="adm-cats-panel">
          <div className="adm-cats-header">
            <span className="adm-cats-title">Categories</span>
            <button
              className="adm-btn adm-btn-sm adm-btn-ghost"
              onClick={() => { setShowNewCatRow(r => !r); setNewCatInput('') }}
              title="Add category"
            >+</button>
          </div>
          {showNewCatRow && (
            <div className="adm-cats-new-row">
              <input
                className="adm-cats-input"
                type="text"
                placeholder="New category…"
                value={newCatInput}
                autoFocus
                onChange={e => setNewCatInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') addGlobalCategory()
                  if (e.key === 'Escape') { setShowNewCatRow(false); setNewCatInput('') }
                }}
              />
              <button className="adm-btn adm-btn-sm adm-btn-primary" onClick={addGlobalCategory}>Add</button>
            </div>
          )}
          <div className="adm-cats-list">
            {allCategories.length === 0
              ? <span className="adm-cats-empty">No categories yet</span>
              : allCategories.map(cat => (
                <span key={cat} className="adm-cat-chip">
                  {cat}
                  <button
                    className="adm-cat-chip-rm"
                    onClick={() => removeGlobalCategory(cat)}
                    title="Remove category"
                  >×</button>
                </span>
              ))
            }
          </div>
        </div>

        <div className="adm-stats">
          {projects.length} levels &middot; {allCategories.length} categories
        </div>
      </>
    )
  }

  /* ──────────────────────────────────────────────────────────────
     E D I T O R   V I E W
     ────────────────────────────────────────────────────────────── */
  function renderEditor() {
    return (
      <div className="adm-editor">
        <div className="adm-editor-header">
          <h2>{editSlug ? `Edit: ${form.title || editSlug}` : 'New Level'}</h2>
          <div className="adm-editor-actions">
            <button className="adm-btn adm-btn-ghost"
              onClick={closeEditor} disabled={saving}>Cancel</button>
            <button className="adm-btn adm-btn-primary"
              onClick={saveProject} disabled={saving}>
              {saving ? 'Saving…' : 'Save Level'}
            </button>
          </div>
        </div>

        {/* Details */}
        <section className="adm-section">
          <h3>Details</h3>
          <div className="adm-field-row">
            <div className="adm-field">
              <label>Title</label>
              <input type="text" value={form.title}
                onChange={e => {
                  isDirtyRef.current = true
                  const title = e.target.value
                  setForm(prev => ({
                    ...prev, title,
                    ...(editSlug ? {} : { slug: slugify(title) }),
                  }))
                }}
                placeholder="Level title"
              />
            </div>
            <div className="adm-field adm-field-slug">
              <label>Slug</label>
              <input type="text" value={form.slug}
                onChange={e => {
                  isDirtyRef.current = true
                  setForm(prev => ({ ...prev, slug: slugify(e.target.value) }))
                }}
                placeholder="level-slug"
              />
            </div>
            <div className="adm-field adm-field-date">
              <label>Release Date</label>
              <input type="date" value={form.date}
                onChange={e => {
                  isDirtyRef.current = true
                  setForm(prev => ({ ...prev, date: e.target.value }))
                }}
              />
            </div>
          </div>
          <div className="adm-field">
            <label>Description</label>
            <textarea value={form.description} rows={8}
              onChange={e => {
                isDirtyRef.current = true
                setForm(prev => ({ ...prev, description: e.target.value }))
              }}
              placeholder="Level description"
            />
          </div>
        </section>

        {/* Categories */}
        <section className="adm-section">
          <h3>Categories</h3>
          <div className="adm-cat-pills">
            {form.categories.map(cat => (
              <span key={cat} className="adm-cat-pill">
                {cat}
                <button onClick={() => removeCategory(cat)}
                  aria-label={`Remove ${cat}`}>&times;</button>
              </span>
            ))}
          </div>
          <div className="adm-cat-input-wrap">
            <input
              type="text"
              className="adm-cat-input"
              value={catInput}
              onChange={e => {
                setCatInput(e.target.value)
                setShowCatDropdown(true)
              }}
              onFocus={() => setShowCatDropdown(true)}
              onBlur={() => setTimeout(() => setShowCatDropdown(false), 150)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addCategory(catInput)
                }
                if (e.key === 'Escape') setShowCatDropdown(false)
              }}
              placeholder="Add category…"
            />
            {showCatDropdown && filteredCatSuggestions.length > 0 && (
              <div className="adm-cat-dropdown">
                {filteredCatSuggestions.map(cat => (
                  <button key={cat} className="adm-cat-option"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => addCategory(cat)}>
                    {cat}
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className="adm-hint">
            Type a new category name and press Enter, or select from existing.
          </p>
        </section>

        {/* Images */}
        <section className="adm-section">
          <h3>Images</h3>
          <p className="adm-hint">
            Drag images to reorder. First image is the main thumbnail.
            Click &#9733; to set as main.
          </p>
          <div className="adm-img-grid">
            {imageList.map((item, index) => (
              <div
                key={item.id}
                className={`adm-img-card${index === 0 ? ' adm-img-main' : ''}${dragOverIndex === index && dragItem.current !== index ? ' adm-img-drag-over' : ''}`}
                draggable
                onDragStart={e => handleDragStart(e, index)}
                onDragEnter={e => handleDragEnter(e, index)}
                onDragOver={handleDragOver}
                onDrop={e => handleDrop(e, index)}
                onDragEnd={handleDragEnd}
              >
                <img src={item.preview} alt="" />
                <div className="adm-img-overlay">
                  <div className="adm-img-badges">
                    {index === 0 && <span className="adm-img-badge">Main</span>}
                    {index === minimapIndex && <span className="adm-img-badge adm-img-badge-map">Map</span>}
                  </div>
                  <div className="adm-img-actions">
                    {index !== 0 && (
                      <button onClick={() => setMainImage(index)}
                        title="Set as main">&#9733;</button>
                    )}
                    <button
                      onClick={() => setMinimap(index)}
                      title={index === minimapIndex ? 'Remove minimap' : 'Set as minimap'}
                      className={index === minimapIndex ? 'adm-img-btn-active' : ''}
                    >&#128204;</button>
                    <button onClick={() => removeImage(index)}
                      title="Remove">&times;</button>
                  </div>
                  <span className="adm-img-order">#{index + 1}</span>
                </div>
              </div>
            ))}
            <div
              className="adm-img-upload"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => {
                e.preventDefault()
                e.currentTarget.classList.add('active')
              }}
              onDragLeave={e => e.currentTarget.classList.remove('active')}
              onDrop={e => {
                e.currentTarget.classList.remove('active')
                handleFileDrop(e)
              }}
            >
              <span className="adm-upload-icon">+</span>
              <span>Add Images</span>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
            </div>
          </div>
        </section>
      </div>
    )
  }
}

export default AdminDashboard
