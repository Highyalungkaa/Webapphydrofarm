import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.js';
import { CartProvider } from './context/CartContext.js';
import { EquipmentCartProvider } from './context/EquipmentCartContext.js';

// Layouts
import { CustomerLayout } from './components/layout/CustomerLayout.js';
import { AdminLayout } from './components/layout/AdminLayout.js';
import { EquipmentAdminLayout } from './components/layout/EquipmentAdminLayout.js';

// Customer Pages
const HomePage = React.lazy(() => import('./pages/customer/HomePage.js').then((module) => ({ default: module.HomePage })));
const RoundDetailPage = React.lazy(() => import('./pages/customer/RoundDetailPage.js').then((module) => ({ default: module.RoundDetailPage })));
const CheckoutPage = React.lazy(() => import('./pages/customer/CheckoutPage.js').then((module) => ({ default: module.CheckoutPage })));
const BookingReviewPage = React.lazy(() => import('./pages/customer/BookingReviewPage.js').then((module) => ({ default: module.BookingReviewPage })));
const OrdersPage = React.lazy(() => import('./pages/customer/OrdersPage.js').then((module) => ({ default: module.OrdersPage })));
const OrderDetailPage = React.lazy(() => import('./pages/customer/OrderDetailPage.js').then((module) => ({ default: module.OrderDetailPage })));
const EquipmentOrderDetailPage = React.lazy(() => import('./pages/customer/EquipmentOrderDetailPage.js').then((module) => ({ default: module.EquipmentOrderDetailPage })));
const ProfilePage = React.lazy(() => import('./pages/customer/ProfilePage.js').then((module) => ({ default: module.ProfilePage })));
const LoginPage = React.lazy(() => import('./pages/customer/LoginPage.js').then((module) => ({ default: module.LoginPage })));
const EquipmentShopPage = React.lazy(() => import('./pages/customer/EquipmentShopPage.js').then((module) => ({ default: module.EquipmentShopPage })));
const EquipmentCheckoutPage = React.lazy(() => import('./pages/customer/EquipmentCheckoutPage.js').then((module) => ({ default: module.EquipmentCheckoutPage })));

// Admin Pages
const AdminDashboardPage = React.lazy(() => import('./pages/admin/AdminDashboardPage.js').then((module) => ({ default: module.AdminDashboardPage })));
const AdminRoundsPage = React.lazy(() => import('./pages/admin/AdminRoundsPage.js').then((module) => ({ default: module.AdminRoundsPage })));
const AdminRoundDetailPage = React.lazy(() => import('./pages/admin/AdminRoundDetailPage.js').then((module) => ({ default: module.AdminRoundDetailPage })));
const AdminRoundsHistoryPage = React.lazy(() => import('./pages/admin/AdminRoundsHistoryPage.js').then((module) => ({ default: module.AdminRoundsHistoryPage })));
const AdminOrdersPage = React.lazy(() => import('./pages/admin/AdminOrdersPage.js').then((module) => ({ default: module.AdminOrdersPage })));
const AdminCropsPage = React.lazy(() => import('./pages/admin/AdminCropsPage.js').then((module) => ({ default: module.AdminCropsPage })));
const AdminDistrictsPage = React.lazy(() => import('./pages/admin/AdminDistrictsPage.js').then((module) => ({ default: module.AdminDistrictsPage })));
const AdminAdminsPage = React.lazy(() => import('./pages/admin/AdminAdminsPage.js').then((module) => ({ default: module.AdminAdminsPage })));
const AdminSettingsPage = React.lazy(() => import('./pages/admin/AdminSettingsPage.js').then((module) => ({ default: module.AdminSettingsPage })));
const AdminAuditPage = React.lazy(() => import('./pages/admin/AdminAuditPage.js').then((module) => ({ default: module.AdminAuditPage })));
const AdminCustomersPage = React.lazy(() => import('./pages/admin/AdminCustomersPage.js').then((module) => ({ default: module.AdminCustomersPage })));
const AdminFarmPage = React.lazy(() => import('./pages/admin/AdminFarmPage.js').then((module) => ({ default: module.AdminFarmPage })));
const AdminPlotsPage = React.lazy(() => import('./pages/admin/AdminPlotsPage.js').then((module) => ({ default: module.AdminPlotsPage })));
const AdminBookingsPage = React.lazy(() => import('./pages/admin/AdminBookingsPage.js').then((module) => ({ default: module.AdminBookingsPage })));
const AdminReportsPage = React.lazy(() => import('./pages/admin/AdminReportsPage.js').then((module) => ({ default: module.AdminReportsPage })));
const AdminEquipmentPage = React.lazy(() => import('./pages/admin/AdminEquipmentPage.js').then((module) => ({ default: module.AdminEquipmentPage })));
const AdminEquipmentDashboardPage = React.lazy(() => import('./pages/admin/AdminEquipmentDashboardPage.js').then((module) => ({ default: module.AdminEquipmentDashboardPage })));
const AdminEquipmentOrdersPage = React.lazy(() => import('./pages/admin/AdminEquipmentOrdersPage.js').then((module) => ({ default: module.AdminEquipmentOrdersPage })));
const AdminEquipmentOrderHistoryPage = React.lazy(() => import('./pages/admin/AdminEquipmentOrderHistoryPage.js').then((module) => ({ default: module.AdminEquipmentOrderHistoryPage })));
const AdminEquipmentReportsPage = React.lazy(() => import('./pages/admin/AdminEquipmentReportsPage.js').then((module) => ({ default: module.AdminEquipmentReportsPage })));
const AdminEquipmentShippingPage = React.lazy(() => import('./pages/admin/AdminEquipmentShippingPage.js').then((module) => ({ default: module.AdminEquipmentShippingPage })));

// Route Guard for authenticated customers
const ProtectedCustomerRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) {
    return (
      <div className="py-20 text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-farm-600"></div>
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" state={{ returnTo: `${location.pathname}${location.search}` }} replace />;
  }
  return <>{children}</>;
};

export const App: React.FC = () => {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <CartProvider>
        <EquipmentCartProvider>
          <Suspense fallback={<div className="py-20 text-center text-sm text-slate-500">กำลังโหลดหน้า...</div>}>
          <Routes>
            {/* Customer Routes */}
            <Route element={<CustomerLayout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/rounds/:id" element={<RoundDetailPage />} />
              <Route path="/booking-review" element={<BookingReviewPage />} />
              <Route path="/checkout" element={<CheckoutPage />} />
              <Route path="/equipment" element={<EquipmentShopPage />} />
              <Route path="/equipment/:id" element={<EquipmentShopPage />} />
              <Route path="/equipment/checkout" element={<ProtectedCustomerRoute><EquipmentCheckoutPage /></ProtectedCustomerRoute>} />
              <Route
                path="/orders"
                element={
                  <ProtectedCustomerRoute>
                    <OrdersPage />
                  </ProtectedCustomerRoute>
                }
              />
              <Route
                path="/orders/equipment/:id"
                element={
                  <ProtectedCustomerRoute>
                    <EquipmentOrderDetailPage />
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
              <Route path="reports" element={<AdminReportsPage />} />
            </Route>

            {/* Dedicated admin area for the equipment shop */}
            <Route path="/admin/equipment" element={<EquipmentAdminLayout />}>
              <Route index element={<AdminEquipmentDashboardPage />} />
              <Route path="products" element={<AdminEquipmentPage />} />
              <Route path="orders" element={<AdminEquipmentOrdersPage />} />
              <Route path="orders/history" element={<AdminEquipmentOrderHistoryPage />} />
              <Route path="reports" element={<AdminEquipmentReportsPage />} />
              <Route path="settings/shipping" element={<AdminEquipmentShippingPage />} />
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
        </EquipmentCartProvider>
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
