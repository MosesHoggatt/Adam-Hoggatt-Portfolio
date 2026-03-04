import { Authenticator } from '@aws-amplify/ui-react'
import '@aws-amplify/ui-react/styles.css'

const ProtectedRoute = ({ children }) => {
  return (
    <Authenticator hideSignUp={true}>
      {() => children}
    </Authenticator>
  )
}

export default ProtectedRoute
