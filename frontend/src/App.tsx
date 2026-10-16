import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.js';
import { CartProvider } from './context/CartContext.js';

// Layouts
import { CustomerLayout } from './components/layout/CustomerLayout.js';
import { AdminLayout } from './components/layout/AdminLayout.js';

// Customer Pages
import { HomePage } from './pages/customer/HomePage.js';
import { RoundDetailPage } from './pages/customer/RoundDetailPage.js';
import { CheckoutPage } from './pages/customer/CheckoutPage.js';
import { OrdersPage } from './pages/customer/OrdersPage.js';
import { OrderDetailPage } from './pages/customer/OrderDetailPage.js';
import { ProfilePage } from './pages/customer/ProfilePage.js';
import { LoginPage } from './pages/customer/LoginPage.js';

// Admin Pages
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage.js';
import { AdminRoundsPage } from './pages/admin/AdminRoundsPage.js';
import { AdminRoundDetailPage } from './pages/admin/AdminRoundDetailPage.js';
import { AdminRoundsHistoryPage } from './pages/admin/AdminRoundsHistoryPage.js';
import { AdminOrdersPage } from './pages/admin/AdminOrdersPage.js';
import { AdminCropsPage } from './pages/admin/AdminCropsPage.js';
import { AdminDistrictsPage } from './pages/admin/AdminDistrictsPage.js';
import { AdminAdminsPage } from './pages/admin/AdminAdminsPage.js';
import { AdminSettingsPage } from './pages/admin/AdminSettingsPage.js';
import { AdminAuditPage } from './pages/admin/AdminAuditPage.js';
import { AdminCustomersPage } from './pages/admin/AdminCustomersPage.js';
import { AdminFarmPage } from './pages/admin/AdminFarmPage.js';
import { AdminPlotsPage } from './pages/admin/AdminPlotsPage.js';
import { AdminBookingsPage } from './pages/admin/AdminBookingsPage.js';

// Route Guard for authenticated customers
const ProtectedCustomerRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="py-20 text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-farm-600"></div>
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CartProvider>
          <Routes>
            {/* Customer Routes */}
            <Route element={<CustomerLayout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/rounds/:id" element={<RoundDetailPage />} />
              <Route path="/checkout" element={<CheckoutPage />} />
              <Route
                path="/orders"
                element={
                  <ProtectedCustomerRoute>
                    <OrdersPage />
                  </ProtectedCustomerRoute>
                }
              />
              <Route
                path="/orders/:id"
                element={
                  <ProtectedCustomerRoute>
                    <OrderDetailPage />
                  </ProtectedCustomerRoute>
                }
              />
              <Route
                path="/profile"
                element={
                  <ProtectedCustomerRoute>
                    <ProfilePage />
                  </ProtectedCustomerRoute>
                }
              />
              <Route path="/login" element={<LoginPage />} />
            </Route>

            {/* Admin Routes (Guarded inside AdminLayout by isAdmin check) */}
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<AdminDashboardPage />} />
              <Route path="plots" element={<AdminPlotsPage />} />
              <Route path="farm" element={<AdminFarmPage />} />
              <Route path="rounds" element={<AdminRoundsPage />} />
              <Route path="rounds/history" element={<AdminRoundsHistoryPage />} />
              <Route path="rounds/:id" element={<AdminRoundDetailPage />} />
              <Route path="bookings" element={<AdminBookingsPage />} />
              <Route path="orders" element={<AdminOrdersPage />} />
              <Route path="crops" element={<AdminCropsPage />} />
              <Route path="districts" element={<AdminDistrictsPage />} />
              <Route path="customers" element={<AdminCustomersPage />} />
              <Route path="settings" element={<AdminSettingsPage />} />
              <Route path="admins" element={<AdminAdminsPage />} />
              <Route path="audit" element={<AdminAuditPage />} />
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
