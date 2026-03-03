import { Navigate } from 'react-router-dom'
import { Authenticator, useAuthenticator } from '@aws-amplify/ui-react'
import '@aws-amplify/ui-react/styles.css'

const ProtectedRoute = ({ children }) => {
  return (
    <Authenticator>
      {({ signOut, user }) => (
        <div>
          <nav style={{ padding: '1rem', borderBottom: '1px solid #ccc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <a href="/" style={{ marginRight: '1rem' }}>Home</a>
              <a href="/admin" style={{ marginRight: '1rem' }}>Admin Dashboard</a>
            </div>
            <div>
              <span style={{ marginRight: '1rem' }}>Hello, {user?.username}</span>
              <button onClick={signOut}>Sign Out</button>
            </div>
          </nav>
          {children}
        </div>
      )}
    </Authenticator>
  )
}

export default ProtectedRoute
