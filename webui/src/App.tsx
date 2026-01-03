/**
 * Root Application Component
 *
 * Handles authentication-based routing:
 * - Shows loading state during initial token validation
 * - Shows LoginPage if not authenticated
 * - Shows Dashboard if authenticated
 */

import { AuthProvider } from './auth/AuthContext';
import { useAuth } from './auth/useAuth';
import { LoginPage } from './pages/LoginPage';

/**
 * Logout button component for authenticated users
 */
function LogoutButton(): JSX.Element {
  const { logout } = useAuth();

  return (
    <button
      onClick={logout}
      className="mt-4 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors"
    >
      Logout
    </button>
  );
}

/**
 * Application content with auth-based routing
 * Must be wrapped in AuthProvider to access auth context
 */
function AppContent(): JSX.Element {
  const { isAuthenticated, isLoading } = useAuth();

  // Show loading state during initial token validation
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-gray-300 border-t-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Show login page if not authenticated
  if (!isAuthenticated) {
    return <LoginPage />;
  }

  // Dashboard placeholder for authenticated users
  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Dashboard</h1>
          <p className="text-green-600 font-medium mb-4">Logged in successfully!</p>
          <p className="text-gray-600">
            This is a placeholder dashboard. Future updates will add guild management
            and bot configuration features.
          </p>
          <LogoutButton />
        </div>
      </div>
    </div>
  );
}

/**
 * Root App component
 * Wraps the entire application in AuthProvider
 */
export function App(): JSX.Element {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
