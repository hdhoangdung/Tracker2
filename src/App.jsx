import { useState } from 'react';
import { ProductProvider } from './context/ProductContext';
import { BottomNav } from './components/BottomNav';
import { HomePage } from './pages/HomePage';
import { ScannerPage } from './pages/ScannerPage';
import { DetailPage } from './pages/DetailPage';
import { SettingsPage } from './pages/SettingsPage';

export default function App() {
  const [tab, setTab] = useState('home');
  const [selectedProductId, setSelectedProductId] = useState(null);

  const handleSelectProduct = (id) => {
    setSelectedProductId(id);
    setTab('detail');
  };

  const handleBack = () => {
    setSelectedProductId(null);
    setTab('home');
  };

  return (
    <ProductProvider>
      <div className="min-h-screen max-w-md mx-auto relative" style={{ background: '#0F0F0F' }}>
        {tab === 'detail' && selectedProductId ? (
          <DetailPage productId={selectedProductId} onBack={handleBack} />
        ) : tab === 'scanner' ? (
          <ScannerPage onBack={() => setTab('home')} onNavigate={setTab} />
        ) : tab === 'settings' ? (
          <>
            <SettingsPage />
            <BottomNav active={tab} onChange={setTab} />
          </>
        ) : (
          <>
            <HomePage onNavigate={setTab} onSelectProduct={handleSelectProduct} />
            <BottomNav active={tab} onChange={setTab} />
          </>
        )}
      </div>
    </ProductProvider>
  );
}
