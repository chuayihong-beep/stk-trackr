import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { WatchlistProvider } from './lib/watchlist';
import { Overview } from './pages/Overview';
import { Search } from './pages/Search';
import { Favourites } from './pages/Favourites';
import { StockDetail } from './pages/StockDetail';
import { Settings } from './pages/Settings';
import { NotFound } from './pages/NotFound';

export default function App() {
  return (
    <WatchlistProvider>
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
    </WatchlistProvider>
  );
}
