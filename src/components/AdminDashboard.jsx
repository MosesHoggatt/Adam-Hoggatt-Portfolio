import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { uploadData, remove } from 'aws-amplify/storage'
import { useAuthenticator } from '@aws-amplify/ui-react'
import awsConfig from '../aws-exports'
import { CATEGORY_ICON_MAP, AVAILABLE_ICONS, BUILTIN_CATEGORY_META } from '../categoryIcons'
import './AdminDashboard.css'

const S3_BASE = `https://${awsConfig.Storage.S3.bucket}.s3.${awsConfig.Storage.S3.region}.amazonaws.com`
const s3Url = (path) => `${S3_BASE}/${path}`

const THUMB_MAX_WIDTH = 400
const THUMB_QUALITY = 0.7

const CARD_MAX_WIDTH = 800
const CARD_QUALITY = 0.82

/** Generate a compressed thumbnail Blob from a File or Blob using canvas */
function generateThumbnail(file) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, THUMB_MAX_WIDTH / img.width)
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, w, h)
      canvas.toBlob(
        (blob) => { URL.revokeObjectURL(img.src); resolve(blob) },
        'image/jpeg',
        THUMB_QUALITY,
      )
    }
    img.onerror = () => { URL.revokeObjectURL(img.src); resolve(null) }
    img.src = URL.createObjectURL(file)
  })
}

/** Generate a card-size image Blob from a File or Blob using canvas */
function generateCardImage(file) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, CARD_MAX_WIDTH / img.width)
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, w, h)
      canvas.toBlob(
        (blob) => { URL.revokeObjectURL(img.src); resolve(blob) },
        'image/webp',
        CARD_QUALITY,
      )
    }
    img.onerror = () => { URL.revokeObjectURL(img.src); resolve(null) }
    img.src = URL.createObjectURL(file)
  })
}

/** Generate a thumbnail from an S3 URL (for existing images) */
function generateThumbnailFromUrl(url) {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const scale = Math.min(1, THUMB_MAX_WIDTH / img.width)
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, w, h)
      canvas.toBlob(
        (blob) => resolve(blob),
        'image/jpeg',
        THUMB_QUALITY,
      )
    }
    img.onerror = () => resolve(null)
    img.src = url
  })
}

/** Generate a card-size image from an S3 URL (for existing images) */
function generateCardImageFromUrl(url) {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const scale = Math.min(1, CARD_MAX_WIDTH / img.width)
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, w, h)
      canvas.toBlob(
        (blob) => resolve(blob),
        'image/webp',
        CARD_QUALITY,
      )
    }
    img.onerror = () => resolve(null)
    img.src = url
  })
}
const getIconSrc = (icon) => {
  if (!icon) return null
  return CATEGORY_ICON_MAP[icon] || s3Url(icon)
}

const slugify = (str) =>
  str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

/* ══════════════════════════════════════════════════════════════════
   A D M I N   D A S H B O A R D
   ══════════════════════════════════════════════════════════════════ */
const AdminDashboard = () => {
  const { signOut, user } = useAuthenticator()
  const navigate = useNavigate()

  /* ── Global state ──────────────────────────────────────────── */
  const [projects, setProjects] = useState([])
  const [allCategories, setAllCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  /* ── Profile state ───────────────────────────────────────── */
  const [profile, setProfile] = useState({ bio: '', photoPath: '', bannerPath: '' })
  const [profileSaving, setProfileSaving] = useState(false)
  const [profilePhotoFile, setProfilePhotoFile] = useState(null)
  const [profilePhotoPreview, setProfilePhotoPreview] = useState(null)
  const [bannerFile, setBannerFile] = useState(null)
  const [bannerPreview, setBannerPreview] = useState(null)
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
  const [newCatForm, setNewCatForm] = useState({ id: '', gameName: '', icon: '' })
  const [newCatIconFile, setNewCatIconFile] = useState(null)
  const [newCatIconPreview, setNewCatIconPreview] = useState(null)
  const [editCatId, setEditCatId] = useState(null)
  const [editCatForm, setEditCatForm] = useState({ gameName: '', icon: '' })
  const [editCatIconFile, setEditCatIconFile] = useState(null)
  const [editCatIconPreview, setEditCatIconPreview] = useState(null)
  const [deleteCatTarget, setDeleteCatTarget] = useState(null)
  const [catDragOverIndex, setCatDragOverIndex] = useState(null)

  /* ── Refs ──────────────────────────────────────────────────── */
  const fileInputRef = useRef(null)
  const profilePhotoInputRef = useRef(null)
  const bannerInputRef = useRef(null)
  const newCatIconInputRef = useRef(null)
  const editCatIconInputRef = useRef(null)
  const dragItem = useRef(null)
  const dragOverItem = useRef(null)
  const catDragItem = useRef(null)
  const catDragOver = useRef(null)
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
      // Collect IDs from projects
      const catIdSet = new Set(valid.flatMap(p => p.categories || []))
      // Seed with builtin defaults so known categories always have their icon
      const catMetaMap = {}
      catIdSet.forEach(id => {
        const builtin = BUILTIN_CATEGORY_META[id]
        catMetaMap[id] = builtin
          ? { id, gameName: builtin.gameName, icon: builtin.icon }
          : { id, gameName: id, icon: null }
      })
      // Merge with global categories.json — preserves S3 order for drag-and-drop
      const orderedCatIds = []
      try {
        const catRes = await fetch(s3Url('projects/categories.json'), { cache: 'no-cache' })
        if (catRes.ok) {
          const globalCats = await catRes.json()
          globalCats.forEach(c => {
            if (typeof c === 'string') {
              orderedCatIds.push(c)
              catIdSet.add(c)
              if (!catMetaMap[c]) {
                const builtin = BUILTIN_CATEGORY_META[c]
                catMetaMap[c] = builtin
                  ? { id: c, gameName: builtin.gameName, icon: builtin.icon }
                  : { id: c, gameName: c, icon: null }
              }
            } else if (c?.id) {
              orderedCatIds.push(c.id)
              catIdSet.add(c.id)
              const builtin = BUILTIN_CATEGORY_META[c.id]
              catMetaMap[c.id] = {
                id: c.id,
                gameName: c.gameName || builtin?.gameName || c.id,
                icon: c.icon ?? builtin?.icon ?? null,
              }
            }
          })
        }
      } catch {}
      // Append any project categories not present in categories.json
      catIdSet.forEach(id => { if (!orderedCatIds.includes(id)) orderedCatIds.push(id) })
      const finalCats = orderedCatIds.map(id => catMetaMap[id] || { id, gameName: id, icon: null })
      setAllCategories(finalCats)
    } catch (err) {
      console.error('Error loading projects:', err)
      showToast('Error loading levels', 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => { fetchProjects() }, [fetchProjects])

  const fetchProfile = useCallback(async () => {
    try {
      const res = await fetch(s3Url('profile/profile.json'), { cache: 'no-cache' })
      if (res.ok) {
        const data = await res.json()
        setProfile(data)
        if (data.photoPath) setProfilePhotoPreview(s3Url(data.photoPath))
        if (data.bannerPath) setBannerPreview(s3Url(data.bannerPath))
      }
    } catch {}
  }, [])

  useEffect(() => { fetchProfile() }, [fetchProfile])

  const saveProfile = async () => {
    setProfileSaving(true)
    try {
      let photoPath = profile.photoPath
      if (profilePhotoFile) {
        const ext = profilePhotoFile.name.split('.').pop().toLowerCase()
        photoPath = `profile/photo.${ext}`
        await uploadData({
          path: photoPath,
          data: profilePhotoFile,
          options: { contentType: profilePhotoFile.type },
        }).result
      }
      let bannerPath = profile.bannerPath
      if (bannerFile) {
        const ext = bannerFile.name.split('.').pop().toLowerCase()
        bannerPath = `profile/banner.${ext}`
        await uploadData({
          path: bannerPath,
          data: bannerFile,
          options: { contentType: bannerFile.type },
        }).result
      }
      const updated = { ...profile, photoPath, bannerPath }
      await uploadData({
        path: 'profile/profile.json',
        data: JSON.stringify(updated, null, 2),
        options: {
          contentType: 'application/json',
          metadata: { 'Cache-Control': 'no-cache, max-age=0' },
        },
      }).result
      setProfile(updated)
      setProfilePhotoFile(null)
      setBannerFile(null)
      showToast('Profile saved')
    } catch (err) {
      showToast(`Failed to save profile: ${err.message}`, 'error')
    } finally {
      setProfileSaving(false)
    }
  }

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
          // Ensure small thumbnail + card image exist for existing images
          const thumbPath = resolvedPath.replace('/images/', '/thumbnails/')
          const cardPath  = resolvedPath.replace('/images/', '/card/').replace(/\.(jpe?g|png|gif)$/i, '.webp')
          try {
            const [thumbRes, cardRes] = await Promise.all([
              fetch(s3Url(thumbPath), { method: 'HEAD' }),
              fetch(s3Url(cardPath),  { method: 'HEAD' }),
            ])
            if (!thumbRes.ok || !cardRes.ok) {
              const blob = await generateCardImageFromUrl(s3Url(resolvedPath))
              if (!thumbRes.ok) {
                const thumbBlob = await generateThumbnailFromUrl(s3Url(resolvedPath))
                if (thumbBlob) await uploadData({ path: thumbPath, data: thumbBlob, options: { contentType: 'image/jpeg', metadata: { 'Cache-Control': 'public, max-age=31536000, immutable' } } }).result
              }
              if (!cardRes.ok && blob) {
                await uploadData({ path: cardPath, data: blob, options: { contentType: 'image/webp', metadata: { 'Cache-Control': 'public, max-age=31536000, immutable' } } }).result
              }
            }
          } catch { /* best-effort */ }
        } else if (item.file) {
          const fileName = item.file.name.replace(/\s+/g, '-')
          const path = `projects/${slug}/images/${fileName}`
          await uploadData({
            path,
            data: item.file,
            options: { contentType: item.file.type },
          }).result
          // Generate and upload small thumbnail + card image
          try {
            const [thumbBlob, cardBlob] = await Promise.all([
              generateThumbnail(item.file),
              generateCardImage(item.file),
            ])
            if (thumbBlob) {
              const thumbPath = `projects/${slug}/thumbnails/${fileName}`
              await uploadData({ path: thumbPath, data: thumbBlob, options: { contentType: 'image/jpeg', metadata: { 'Cache-Control': 'public, max-age=31536000, immutable' } } }).result
            }
            if (cardBlob) {
              const cardPath = `projects/${slug}/card/${fileName.replace(/\.(jpe?g|png|gif)$/i, '.webp')}`
              await uploadData({ path: cardPath, data: cardBlob, options: { contentType: 'image/webp', metadata: { 'Cache-Control': 'public, max-age=31536000, immutable' } } }).result
            }
          } catch { /* best-effort */ }
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
      // 1. List every S3 key under projects/<slug>/ using the public S3 list API
      const prefix = `projects/${slug}/`
      const listUrl = `https://${awsConfig.Storage.S3.bucket}.s3.${awsConfig.Storage.S3.region}.amazonaws.com/?list-type=2&prefix=${encodeURIComponent(prefix)}`
      const xml = await fetch(listUrl).then(r => r.text())
      const keys = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map(m => m[1])

      // 2. Delete every object under that prefix (images, thumbnails, card, minimap)
      for (const key of keys) {
        try { await remove({ path: key }) } catch {}
      }

      // 3. Delete the project JSON
      try { await remove({ path: `projects/${slug}.json` }) } catch {}

      // 4. Rebuild the index without this project
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
    const id = newCatForm.id.trim()
    if (!id) return
    if (allCategories.find(c => c.id === id)) { showToast('Category already exists', 'error'); return }
    let iconValue = newCatForm.icon || null
    try {
      if (newCatIconFile) {
        const ext = newCatIconFile.name.split('.').pop().toLowerCase()
        const iconPath = `projects/category-icons/${slugify(id)}.${ext}`
        await uploadData({ path: iconPath, data: newCatIconFile, options: { contentType: newCatIconFile.type } }).result
        iconValue = iconPath
        URL.revokeObjectURL(newCatIconPreview)
        setNewCatIconFile(null)
        setNewCatIconPreview(null)
      }
      const newCat = { id, gameName: newCatForm.gameName.trim() || id, icon: iconValue }
      const updated = [...allCategories, newCat]
      setAllCategories(updated)
      setNewCatForm({ id: '', gameName: '', icon: '' })
      setShowNewCatRow(false)
      await uploadData({
        path: 'projects/categories.json',
        data: JSON.stringify(updated),
        options: { contentType: 'application/json', metadata: { 'Cache-Control': 'no-cache, max-age=0' } },
      }).result
      showToast(`Category "${newCat.gameName}" added`)
    } catch (err) {
      showToast('Failed to save category', 'error')
    }
  }

  const saveEditCat = async () => {
    let iconValue = editCatForm.icon || null
    try {
      if (editCatIconFile) {
        const ext = editCatIconFile.name.split('.').pop().toLowerCase()
        const iconPath = `projects/category-icons/${slugify(editCatId)}.${ext}`
        await uploadData({ path: iconPath, data: editCatIconFile, options: { contentType: editCatIconFile.type } }).result
        iconValue = iconPath
        URL.revokeObjectURL(editCatIconPreview)
        setEditCatIconFile(null)
        setEditCatIconPreview(null)
      }
      const updated = allCategories.map(c =>
        c.id === editCatId
          ? { ...c, gameName: editCatForm.gameName.trim() || c.id, icon: iconValue }
          : c
      )
      setAllCategories(updated)
      setEditCatId(null)
      await uploadData({
        path: 'projects/categories.json',
        data: JSON.stringify(updated),
        options: { contentType: 'application/json', metadata: { 'Cache-Control': 'no-cache, max-age=0' } },
      }).result
      showToast('Category updated')
    } catch {
      showToast('Failed to update category', 'error')
    }
  }

  const removeGlobalCategory = (cat) => {
    setDeleteCatTarget(typeof cat === 'string' ? cat : cat.id)
  }

  const confirmRemoveGlobalCategory = async () => {
    const catId = deleteCatTarget  // always a string ID now
    setDeleteCatTarget(null)
    // 1. Remove from global list
    const updatedCats = allCategories.filter(c => c.id !== catId)
    setAllCategories(updatedCats)
    // 2. Strip from every project that uses it
    const affectedProjects = projects.filter(p => (p.categories || []).includes(catId))
    const updatedProjects = projects.map(p =>
      p.categories?.includes(catId)
        ? { ...p, categories: p.categories.filter(c => c !== catId) }
        : p
    )
    setProjects(updatedProjects)
    try {
      // Update categories.json (array of objects)
      await uploadData({
        path: 'projects/categories.json',
        data: JSON.stringify(updatedCats),
        options: { contentType: 'application/json', metadata: { 'Cache-Control': 'no-cache, max-age=0' } },
      }).result
      // Update each affected project JSON
      for (const p of affectedProjects) {
        const updatedData = { ...p, categories: p.categories.filter(c => c !== catId) }
        await uploadData({
          path: `projects/${p.slug}.json`,
          data: JSON.stringify(updatedData, null, 4),
          options: { contentType: 'application/json', metadata: { 'Cache-Control': 'no-cache, max-age=0' } },
        }).result
      }
      showToast(`Category "${catId}" removed${affectedProjects.length ? ` from ${affectedProjects.length} level(s)` : ''}`)
    } catch (err) {
      showToast('Failed to remove category', 'error')
    }
  }

  /* ── Category drag-and-drop ───────────────────────────────── */
  const handleCatDragStart = (i) => { catDragItem.current = i }
  const handleCatDragEnter = (i) => { catDragOver.current = i; setCatDragOverIndex(i) }
  const handleCatDrop = async () => {
    const from = catDragItem.current
    const to = catDragOver.current
    catDragItem.current = null
    catDragOver.current = null
    setCatDragOverIndex(null)
    if (from === null || to === null || from === to) return
    const copy = [...allCategories]
    const [moved] = copy.splice(from, 1)
    copy.splice(to, 0, moved)
    setAllCategories(copy)
    try {
      await uploadData({
        path: 'projects/categories.json',
        data: JSON.stringify(copy),
        options: { contentType: 'application/json', metadata: { 'Cache-Control': 'no-cache, max-age=0' } },
      }).result
      showToast('Category order saved')
    } catch {
      showToast('Failed to save category order', 'error')
    }
  }
  const handleCatDragEnd = () => {
    catDragItem.current = null
    catDragOver.current = null
    setCatDragOverIndex(null)
  }

  const filteredCatSuggestions = catInput.trim()
    ? allCategories.filter(c =>
        (c.gameName.toLowerCase().includes(catInput.toLowerCase()) ||
         c.id.toLowerCase().includes(catInput.toLowerCase())) &&
        !form.categories.includes(c.id))
    : allCategories.filter(c => !form.categories.includes(c.id))

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

      {/* Delete category confirm modal */}
      {deleteCatTarget && (
        <div className="adm-modal-backdrop" onClick={() => setDeleteCatTarget(null)}>
          <div className="adm-modal" onClick={e => e.stopPropagation()}>
            <h3>Delete Category</h3>
            <p>
              Remove <strong>{deleteCatTarget}</strong> from the category list and strip it from all levels that use it?
            </p>
            <div className="adm-modal-actions">
              <button className="adm-btn adm-btn-ghost"
                onClick={() => setDeleteCatTarget(null)}>Cancel</button>
              <button className="adm-btn adm-btn-danger"
                onClick={confirmRemoveGlobalCategory}>Delete</button>
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
          {view === 'list' && (
            <button className="adm-btn adm-btn-ghost" onClick={() => navigate('/')}>
              ← Main Page
            </button>
          )}
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
        {/* ── Profile section ── */}
        <section className="adm-section adm-profile-section">
          <h3>Profile</h3>
          <div className="adm-profile-body">
            <div className="adm-profile-photo-col">
              <div
                className="adm-profile-photo-wrap"
                onClick={() => profilePhotoInputRef.current?.click()}
                title="Click to change photo"
              >
                {profilePhotoPreview
                  ? <img src={profilePhotoPreview} alt="Profile" />
                  : <div className="adm-profile-photo-empty">No Photo</div>}
                <div className="adm-profile-photo-overlay">Change Photo</div>
              </div>
              <input
                ref={profilePhotoInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  setProfilePhotoFile(file)
                  setProfilePhotoPreview(URL.createObjectURL(file))
                  e.target.value = ''
                }}
              />
            </div>
            <div className="adm-profile-bio-col">
              <label className="adm-profile-label">Bio</label>
              <textarea
                className="adm-profile-bio"
                rows={6}
                value={profile.bio}
                onChange={e => setProfile(prev => ({ ...prev, bio: e.target.value }))}
                placeholder="Write a short bio about Adam Hoggatt…"
              />
              <p className="adm-profile-hint">Tip: Use <code>[link text](https://url)</code> to create hyperlinks.</p>
              <button
                className="adm-btn adm-btn-primary"
                onClick={saveProfile}
                disabled={profileSaving}
              >
                {profileSaving ? 'Saving…' : 'Save Profile'}
              </button>
            </div>
          </div>
        </section>

        {/* ── Banner section ── */}
        <section className="adm-section">
          <h3>Hero Banner</h3>
          <div className="adm-banner-body">
            <div
              className="adm-banner-preview-wrap"
              onClick={() => bannerInputRef.current?.click()}
              title="Click to change banner"
            >
              {bannerPreview
                ? <img src={bannerPreview} alt="Banner" />
                : <div className="adm-banner-empty">No Banner — click to upload</div>}
              <div className="adm-banner-overlay">Change Banner</div>
            </div>
            <input
              ref={bannerInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={e => {
                const file = e.target.files?.[0]
                if (!file) return
                setBannerFile(file)
                setBannerPreview(URL.createObjectURL(file))
                e.target.value = ''
              }}
            />
            <p className="adm-hint" style={{ marginTop: '0.6rem' }}>
              Recommended: wide landscape image (e.g. 1400&times;400). Changes are saved with the Profile above.
            </p>
          </div>
        </section>

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

        <div className="adm-cats-panel">
          <div className="adm-cats-header">
            <span className="adm-cats-title">Categories</span>
            <button
              className="adm-btn adm-btn-sm adm-btn-ghost"
              onClick={() => { setShowNewCatRow(r => !r); setNewCatForm({ id: '', gameName: '', icon: '' }) }}
              title="Add category"
            >+</button>
          </div>
          {showNewCatRow && (
            <div className="adm-cats-new-row">
              <div className="adm-cats-new-fields">
                <input
                  className="adm-cats-input"
                  type="text"
                  placeholder="Category ID (e.g. Call of Duty: Black Ops)"
                  value={newCatForm.id}
                  autoFocus
                  onChange={e => setNewCatForm(prev => ({ ...prev, id: e.target.value }))}
                  onKeyDown={e => {
                    if (e.key === 'Enter') addGlobalCategory()
                    if (e.key === 'Escape') { setShowNewCatRow(false); setNewCatForm({ id: '', gameName: '', icon: '' }) }
                  }}
                />
                <input
                  className="adm-cats-input"
                  type="text"
                  placeholder="Display name shown on hover (optional)"
                  value={newCatForm.gameName}
                  onChange={e => setNewCatForm(prev => ({ ...prev, gameName: e.target.value }))}
                  onKeyDown={e => {
                    if (e.key === 'Enter') addGlobalCategory()
                    if (e.key === 'Escape') { setShowNewCatRow(false); setNewCatForm({ id: '', gameName: '', icon: '' }) }
                  }}
                />
              </div>
              <div className="adm-icon-picker">
                {AVAILABLE_ICONS.map(ic => (
                  <button
                    key={ic.key}
                    className={`adm-icon-option${newCatForm.icon === ic.key ? ' selected' : ''}`}
                    onClick={() => {
                      if (newCatIconPreview) { URL.revokeObjectURL(newCatIconPreview); setNewCatIconFile(null); setNewCatIconPreview(null) }
                      setNewCatForm(prev => ({ ...prev, icon: prev.icon === ic.key ? '' : ic.key }))
                    }}
                    title={ic.label}
                    type="button"
                  >
                    <img src={ic.src} alt={ic.label} />
                  </button>
                ))}
                {newCatIconPreview ? (
                  <div className="adm-icon-option adm-icon-option-custom selected">
                    <img src={newCatIconPreview} alt="Custom" />
                    <button
                      className="adm-icon-custom-rm"
                      onClick={e => { e.stopPropagation(); URL.revokeObjectURL(newCatIconPreview); setNewCatIconFile(null); setNewCatIconPreview(null) }}
                      title="Remove custom icon"
                      type="button"
                    >&times;</button>
                  </div>
                ) : (
                  <button
                    className="adm-icon-option adm-icon-upload-btn"
                    onClick={() => newCatIconInputRef.current?.click()}
                    title="Upload custom icon"
                    type="button"
                  >+</button>
                )}
                <input
                  ref={newCatIconInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    setNewCatForm(prev => ({ ...prev, icon: '' }))
                    if (newCatIconPreview) URL.revokeObjectURL(newCatIconPreview)
                    setNewCatIconFile(file)
                    setNewCatIconPreview(URL.createObjectURL(file))
                    e.target.value = ''
                  }}
                />
              </div>
              <button className="adm-btn adm-btn-sm adm-btn-primary" onClick={addGlobalCategory}>Add</button>
            </div>
          )}
          <div className="adm-cats-list">
            {allCategories.length === 0
              ? <span className="adm-cats-empty">No categories yet</span>
              : allCategories.map((cat, idx) => (
                <div
                  key={cat.id}
                  className={`adm-cat-row${catDragOverIndex === idx ? ' adm-cat-drag-over' : ''}`}
                  draggable
                  onDragStart={() => handleCatDragStart(idx)}
                  onDragEnter={() => handleCatDragEnter(idx)}
                  onDragEnd={handleCatDrop}
                  onDragOver={e => e.preventDefault()}
                >
                  {editCatId === cat.id ? (
                    <div className="adm-cat-edit-form">
                      <input
                        className="adm-cats-input"
                        value={editCatForm.gameName}
                        onChange={e => setEditCatForm(prev => ({ ...prev, gameName: e.target.value }))}
                        placeholder="Display name"
                        autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') saveEditCat(); if (e.key === 'Escape') setEditCatId(null) }}
                      />
                      <div className="adm-icon-picker">
                        {AVAILABLE_ICONS.map(ic => (
                          <button
                            key={ic.key}
                            className={`adm-icon-option${editCatForm.icon === ic.key ? ' selected' : ''}`}
                            onClick={() => {
                              if (editCatIconFile) { URL.revokeObjectURL(editCatIconPreview); setEditCatIconFile(null) }
                              setEditCatIconPreview(null)
                              setEditCatForm(prev => ({ ...prev, icon: prev.icon === ic.key ? '' : ic.key }))
                            }}
                            title={ic.label}
                            type="button"
                          >
                            <img src={ic.src} alt={ic.label} />
                          </button>
                        ))}
                        {editCatIconPreview ? (
                          <div className="adm-icon-option adm-icon-option-custom selected">
                            <img src={editCatIconPreview} alt="Custom" />
                            <button
                              className="adm-icon-custom-rm"
                              onClick={e => {
                                e.stopPropagation()
                                if (editCatIconFile) URL.revokeObjectURL(editCatIconPreview)
                                setEditCatIconFile(null)
                                setEditCatIconPreview(null)
                                setEditCatForm(prev => ({ ...prev, icon: '' }))
                              }}
                              title="Remove custom icon"
                              type="button"
                            >&times;</button>
                          </div>
                        ) : (
                          <button
                            className="adm-icon-option adm-icon-upload-btn"
                            onClick={() => editCatIconInputRef.current?.click()}
                            title="Upload custom icon"
                            type="button"
                          >+</button>
                        )}
                        <input
                          ref={editCatIconInputRef}
                          type="file"
                          accept="image/*"
                          style={{ display: 'none' }}
                          onChange={e => {
                            const file = e.target.files?.[0]
                            if (!file) return
                            setEditCatForm(prev => ({ ...prev, icon: '' }))
                            if (editCatIconFile) URL.revokeObjectURL(editCatIconPreview)
                            setEditCatIconFile(file)
                            setEditCatIconPreview(URL.createObjectURL(file))
                            e.target.value = ''
                          }}
                        />
                      </div>
                      <div className="adm-cat-edit-actions">
                        <button className="adm-btn adm-btn-sm adm-btn-primary" onClick={saveEditCat}>Save</button>
                        <button className="adm-btn adm-btn-sm adm-btn-ghost" onClick={() => {
                          if (editCatIconFile) URL.revokeObjectURL(editCatIconPreview)
                          setEditCatIconFile(null)
                          setEditCatIconPreview(null)
                          setEditCatId(null)
                        }}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="adm-cat-row-icon">
                        {getIconSrc(cat.icon)
                          ? <img src={getIconSrc(cat.icon)} alt={cat.gameName} />
                          : <div className="adm-cat-no-icon">?</div>}
                      </div>
                      <div className="adm-cat-row-info">
                        <span className="adm-cat-row-name">{cat.gameName}</span>
                        {cat.gameName !== cat.id && (
                          <span className="adm-cat-row-id">{cat.id}</span>
                        )}
                      </div>
                      <div className="adm-cat-row-actions">
                        <button
                          className="adm-btn adm-btn-sm adm-btn-ghost"
                          onClick={() => {
                            setEditCatId(cat.id)
                            setEditCatForm({ gameName: cat.gameName, icon: CATEGORY_ICON_MAP[cat.icon] ? cat.icon : '' })
                            setEditCatIconFile(null)
                            if (cat.icon && !CATEGORY_ICON_MAP[cat.icon]) {
                              setEditCatIconPreview(s3Url(cat.icon))
                            } else {
                              setEditCatIconPreview(null)
                            }
                          }}
                        >Edit</button>
                        <button
                          className="adm-cat-chip-rm"
                          onClick={() => removeGlobalCategory(cat)}
                          title="Remove category"
                        >×</button>
                      </div>
                    </>
                  )}
                </div>
              ))
            }
          </div>
        </div>

        <div className="adm-stats">
          {projects.length} levels &middot; {allCategories.length} categories
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
            {form.categories.map(catId => {
              const catMeta = allCategories.find(c => c.id === catId) || { id: catId, gameName: catId, icon: null }
              const iconSrc = getIconSrc(catMeta.icon)
              return (
                <span key={catId} className="adm-cat-pill">
                  {iconSrc && <img src={iconSrc} alt="" className="adm-cat-pill-icon" />}
                  <span>{catMeta.gameName}</span>
                  <button onClick={() => removeCategory(catId)}
                    aria-label={`Remove ${catMeta.gameName}`}>&times;</button>
                </span>
              )
            })}
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
              placeholder="Search or type category ID…"
            />
            {showCatDropdown && filteredCatSuggestions.length > 0 && (
              <div className="adm-cat-dropdown">
                {filteredCatSuggestions.map(cat => {
                  const iconSrc = getIconSrc(cat.icon)
                  return (
                    <button key={cat.id} className="adm-cat-option"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => addCategory(cat.id)}>
                      {iconSrc && <img src={iconSrc} alt="" className="adm-cat-option-icon" />}
                      {cat.gameName}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
          <p className="adm-hint">
            Select from existing categories or type a category ID and press Enter.
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
