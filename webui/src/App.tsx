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
import { DashboardPage } from './pages/DashboardPage';

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

  // Dashboard for authenticated users
  return <DashboardPage />;
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
