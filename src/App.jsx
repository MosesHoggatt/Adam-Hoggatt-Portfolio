import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { Amplify } from 'aws-amplify'
import { Authenticator } from '@aws-amplify/ui-react'
import '@aws-amplify/ui-react/styles.css'
import './App.css'

import Portfolio from './components/Portfolio'
import AdminDashboard from './components/AdminDashboard'
import ProtectedRoute from './routes/ProtectedRoute'
import awsConfig from './aws-exports'

Amplify.configure(awsConfig)

function App() {
  return (
    <Authenticator.Provider>
      {/* use BASE_URL as basename so Router knows the correct root */}
      <Router basename={import.meta.env.BASE_URL}>
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