import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { Layout } from './components/Layout';
import Dashboard from './pages/Dashboard';
import NewOS from './pages/NewOS';
import EditOS from './pages/EditOS';
import Customers from './pages/Customers';
import Technicians from './pages/Technicians';
import Suppliers from './pages/Suppliers';
import Products from './pages/Products';
import Stock from './pages/Stock';
import Quotes from './pages/Quotes';
import SalesOrders from './pages/SalesOrders';
import PurchaseOrders from './pages/PurchaseOrders';
import Services from './pages/Services';
import CashFlow from './pages/CashFlow';
import CompanySettings from './pages/CompanySettings';
import ClientSignature from './pages/ClientSignature';
import Login from './pages/Login';
import { AuthProvider, useAuth } from './contexts/AuthContext';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  return <>{children}</>;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 3000,
            style: {
              background: '#fff',
              color: '#1f2937',
              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
              borderRadius: '12px',
              padding: '16px',
              fontFamily: 'Inter, sans-serif',
            },
            success: {
              iconTheme: {
                primary: '#10b981',
                secondary: '#fff',
              },
            },
            error: {
              iconTheme: {
                primary: '#ef4444',
                secondary: '#fff',
              },
            },
          }}
        />
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/assinar/:token" element={<ClientSignature />} />

          {/* Protected routes with layout */}
          <Route path="/" element={<ProtectedRoute><Layout><Dashboard /></Layout></ProtectedRoute>} />
          <Route path="/nova-os" element={<ProtectedRoute><Layout><NewOS /></Layout></ProtectedRoute>} />
          <Route path="/editar-os/:id" element={<ProtectedRoute><Layout><EditOS /></Layout></ProtectedRoute>} />
          <Route path="/clientes" element={<ProtectedRoute><Layout><Customers /></Layout></ProtectedRoute>} />
          <Route path="/tecnicos" element={<ProtectedRoute><Layout><Technicians /></Layout></ProtectedRoute>} />
          <Route path="/fornecedores" element={<ProtectedRoute><Layout><Suppliers /></Layout></ProtectedRoute>} />
          <Route path="/produtos" element={<ProtectedRoute><Layout><Products /></Layout></ProtectedRoute>} />
          <Route path="/estoque" element={<ProtectedRoute><Layout><Stock /></Layout></ProtectedRoute>} />
          <Route path="/orcamentos" element={<ProtectedRoute><Layout><Quotes /></Layout></ProtectedRoute>} />
          <Route path="/vendas" element={<ProtectedRoute><Layout><SalesOrders /></Layout></ProtectedRoute>} />
          <Route path="/compras" element={<ProtectedRoute><Layout><PurchaseOrders /></Layout></ProtectedRoute>} />
          <Route path="/servicos" element={<ProtectedRoute><Layout><Services /></Layout></ProtectedRoute>} />
          <Route path="/caixa" element={<ProtectedRoute><Layout><CashFlow /></Layout></ProtectedRoute>} />
          <Route path="/faturamento" element={<Navigate to="/caixa" replace />} />
          <Route path="/configuracoes" element={<ProtectedRoute><Layout><CompanySettings /></Layout></ProtectedRoute>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
