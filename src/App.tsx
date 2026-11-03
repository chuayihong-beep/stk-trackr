import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { AuthProvider, useAuth } from './lib/auth';
import { StoreProvider } from './lib/store';
import { Overview } from './pages/Overview';
import { Search } from './pages/Search';
import { Favourites } from './pages/Favourites';
import { StockDetail } from './pages/StockDetail';
import { Settings } from './pages/Settings';
import { NotFound } from './pages/NotFound';
import { Login } from './pages/Login';

function Gate() {
  const { session, loading } = useAuth();
  if (loading) return <p className="py-24 text-center text-sm text-slate-500">Checking session…</p>;
  if (!session) return <Login />;
  return (
    // Keyed by user so data never leaks between sessions.
    <StoreProvider key={session.user.id}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Overview />} />
          <Route path="search" element={<Search />} />
          <Route path="favourites" element={<Favourites />} />
          <Route path="stock/:id" element={<StockDetail />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </StoreProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
