import bo1 from './assets/category-icons/bo1.png'
import bo2 from './assets/category-icons/bo2.png'
import bo3 from './assets/category-icons/bo3.png'
import bo4 from './assets/category-icons/bo4.png'
import bo6 from './assets/category-icons/bo6.png'
import bo7 from './assets/category-icons/bo7.png'
import cw  from './assets/category-icons/cw.png'
import waw from './assets/category-icons/waw.png'

export const CATEGORY_ICON_MAP = { bo1, bo2, bo3, bo4, bo6, bo7, cw, waw }

export const AVAILABLE_ICONS = [
  { key: 'waw', src: waw, label: 'World at War'       },
  { key: 'bo1', src: bo1, label: 'Black Ops 1'        },
  { key: 'bo2', src: bo2, label: 'Black Ops 2'        },
  { key: 'bo3', src: bo3, label: 'Black Ops 3'        },
  { key: 'bo4', src: bo4, label: 'Black Ops 4'        },
  { key: 'cw',  src: cw,  label: 'Black Ops Cold War' },
  { key: 'bo6', src: bo6, label: 'Black Ops 6'        },
  { key: 'bo7', src: bo7, label: 'Black Ops 7'        },
]

// Default icon + short display name for known category IDs.
// S3 categories.json overrides these when set via the admin.
export const BUILTIN_CATEGORY_META = {
  'Call of Duty: World at War':        { gameName: 'World at War',       icon: 'waw' },
  'Call of Duty: Black Ops':           { gameName: 'Black Ops',          icon: 'bo1' },
  'Call of Duty: Black Ops 2':         { gameName: 'Black Ops 2',        icon: 'bo2' },
  'Call of Duty: Black Ops 3':         { gameName: 'Black Ops 3',        icon: 'bo3' },
  'Call of Duty: Black Ops 4':         { gameName: 'Black Ops 4',        icon: 'bo4' },
  'Call of Duty: Black Ops Cold War':  { gameName: 'Black Ops Cold War', icon: 'cw'  },
  'Call of Duty: Black Ops 6':         { gameName: 'Black Ops 6',        icon: 'bo6' },
  'Call of Duty: Black Ops 7':         { gameName: 'Black Ops 7',        icon: 'bo7' },
  'Call of Duty: Warzone':             { gameName: 'Warzone',            icon: null  },
}
