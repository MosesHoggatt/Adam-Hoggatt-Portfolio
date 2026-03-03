import { useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom'
import { Amplify } from 'aws-amplify'
import { Authenticator } from '@aws-amplify/ui-react'
import '@aws-amplify/ui-react/styles.css'
import './App.css'

// Import aws-exports if it exists (created by Amplify CLI)
// If you don't have this file yet, you'll need to run 'amplify init' and 'amplify push'
// aws-exports may not exist in environments where Amplify hasn't been initialized.
// include a fallback so builds don't fail.
let awsExports = {}
try {
  // using require avoids build-time errors when the file is missing
  awsExports = require('./aws-exports').default
} catch (e) {
  // aws-exports.js not found; continue without it
}

import Portfolio from './components/Portfolio'
import AdminDashboard from './components/AdminDashboard'
import ProtectedRoute from './routes/ProtectedRoute'

Amplify.configure(awsExports)

function App() {
  return (
    <Authenticator.Provider>
      <Router>
        <div className="app">
          <Routes>
            <Route path="/" element={<Portfolio />} />
            <Route
              path="/admin"
              element={
                <ProtectedRoute>
                  <AdminDashboard />
                </ProtectedRoute>
              }
            />
          </Routes>
        </div>
      </Router>
    </Authenticator.Provider>
  )
}

export default App