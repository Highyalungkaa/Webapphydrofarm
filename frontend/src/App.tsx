import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, matchPath } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.js';
import { CartProvider } from './context/CartContext.js';
import { EquipmentCartProvider } from './context/EquipmentCartContext.js';

// Layouts
import { CustomerLayout } from './components/layout/CustomerLayout.js';
import { AdminLayout } from './components/layout/AdminLayout.js';
import { EquipmentAdminLayout } from './components/layout/EquipmentAdminLayout.js';

const pagePreloads = new Map<string, () => Promise<unknown>>();

function lazyPage<T extends React.ComponentType<any>>(paths: string | string[], load: () => Promise<{ default: T }>) {
  let pending: Promise<{ default: T }> | undefined;
  const preload = () => pending ??= load().catch(error => {
    pending = undefined;
    throw error;
  });
  for (const path of Array.isArray(paths) ? paths : [paths]) pagePreloads.set(path, preload);
  return React.lazy(preload);
}

function PreloadLinkedPages() {
  React.useEffect(() => {
    const preload = (event: Event) => {
      if (!(event.target instanceof Element)) return;
      const link = event.target.closest<HTMLAnchorElement>('a[href]');
      if (!link || link.origin !== window.location.origin || link.download) return;
      const pathname = link.pathname.replace(/\/+$/, '') || '/';
      const load = pagePreloads.get(pathname)
        ?? [...pagePreloads].find(([path]) => path.includes(':') && matchPath(path, pathname))?.[1];
      if (load) void load().catch(() => {});
    };
    document.addEventListener('pointerover', preload, { passive: true });
    document.addEventListener('focusin', preload);
    return () => {
      document.removeEventListener('pointerover', preload);
      document.removeEventListener('focusin', preload);
    };
  }, []);
  return null;
}

// Customer Pages
const HomePage = lazyPage("/", () => import('./pages/customer/HomePage.js').then((module) => ({ default: module.HomePage })));
const RoundDetailPage = lazyPage("/rounds/:id", () => import('./pages/customer/RoundDetailPage.js').then((module) => ({ default: module.RoundDetailPage })));
const CheckoutPage = lazyPage("/checkout", () => import('./pages/customer/CheckoutPage.js').then((module) => ({ default: module.CheckoutPage })));
const BookingReviewPage = lazyPage("/booking-review", () => import('./pages/customer/BookingReviewPage.js').then((module) => ({ default: module.BookingReviewPage })));
const OrdersPage = lazyPage("/orders", () => import('./pages/customer/OrdersPage.js').then((module) => ({ default: module.OrdersPage })));
const OrderDetailPage = lazyPage("/orders/:id", () => import('./pages/customer/OrderDetailPage.js').then((module) => ({ default: module.OrderDetailPage })));
const EquipmentOrderDetailPage = lazyPage("/orders/equipment/:id", () => import('./pages/customer/EquipmentOrderDetailPage.js').then((module) => ({ default: module.EquipmentOrderDetailPage })));
const ProfilePage = lazyPage("/profile", () => import('./pages/customer/ProfilePage.js').then((module) => ({ default: module.ProfilePage })));
const LoginPage = lazyPage("/login", () => import('./pages/customer/LoginPage.js').then((module) => ({ default: module.LoginPage })));
const EquipmentShopPage = lazyPage(["/equipment","/equipment/:id"], () => import('./pages/customer/EquipmentShopPage.js').then((module) => ({ default: module.EquipmentShopPage })));
const EquipmentCheckoutPage = lazyPage("/equipment/checkout", () => import('./pages/customer/EquipmentCheckoutPage.js').then((module) => ({ default: module.EquipmentCheckoutPage })));

// Admin Pages
const AdminDashboardPage = lazyPage("/admin", () => import('./pages/admin/AdminDashboardPage.js').then((module) => ({ default: module.AdminDashboardPage })));
const AdminRoundsPage = lazyPage("/admin/rounds", () => import('./pages/admin/AdminRoundsPage.js').then((module) => ({ default: module.AdminRoundsPage })));
const AdminRoundDetailPage = lazyPage("/admin/rounds/:id", () => import('./pages/admin/AdminRoundDetailPage.js').then((module) => ({ default: module.AdminRoundDetailPage })));
const AdminRoundsHistoryPage = lazyPage("/admin/rounds/history", () => import('./pages/admin/AdminRoundsHistoryPage.js').then((module) => ({ default: module.AdminRoundsHistoryPage })));
const AdminOrdersPage = lazyPage("/admin/orders", () => import('./pages/admin/AdminOrdersPage.js').then((module) => ({ default: module.AdminOrdersPage })));
const AdminCropsPage = lazyPage("/admin/crops", () => import('./pages/admin/AdminCropsPage.js').then((module) => ({ default: module.AdminCropsPage })));
const AdminAdminsPage = lazyPage("/admin/admins", () => import('./pages/admin/AdminAdminsPage.js').then((module) => ({ default: module.AdminAdminsPage })));
const AdminSettingsPage = lazyPage("/admin/settings", () => import('./pages/admin/AdminSettingsPage.js').then((module) => ({ default: module.AdminSettingsPage })));
const AdminCustomersPage = lazyPage("/admin/customers", () => import('./pages/admin/AdminCustomersPage.js').then((module) => ({ default: module.AdminCustomersPage })));
const AdminPlotsPage = lazyPage("/admin/plots", () => import('./pages/admin/AdminPlotsPage.js').then((module) => ({ default: module.AdminPlotsPage })));
const AdminBookingsPage = lazyPage("/admin/bookings", () => import('./pages/admin/AdminBookingsPage.js').then((module) => ({ default: module.AdminBookingsPage })));
const AdminReportsPage = lazyPage("/admin/reports", () => import('./pages/admin/AdminReportsPage.js').then((module) => ({ default: module.AdminReportsPage })));
const AdminEquipmentPage = lazyPage("/admin/equipment/products", () => import('./pages/admin/AdminEquipmentPage.js').then((module) => ({ default: module.AdminEquipmentPage })));
const AdminEquipmentDashboardPage = lazyPage("/admin/equipment", () => import('./pages/admin/AdminEquipmentDashboardPage.js').then((module) => ({ default: module.AdminEquipmentDashboardPage })));
const AdminEquipmentOrdersPage = lazyPage("/admin/equipment/orders", () => import('./pages/admin/AdminEquipmentOrdersPage.js').then((module) => ({ default: module.AdminEquipmentOrdersPage })));
const AdminEquipmentOrderHistoryPage = lazyPage("/admin/equipment/orders/history", () => import('./pages/admin/AdminEquipmentOrderHistoryPage.js').then((module) => ({ default: module.AdminEquipmentOrderHistoryPage })));
const AdminEquipmentReportsPage = lazyPage("/admin/equipment/reports", () => import('./pages/admin/AdminEquipmentReportsPage.js').then((module) => ({ default: module.AdminEquipmentReportsPage })));
const AdminEquipmentShippingPage = lazyPage("/admin/equipment/settings/shipping", () => import('./pages/admin/AdminEquipmentShippingPage.js').then((module) => ({ default: module.AdminEquipmentShippingPage })));

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
      <PreloadLinkedPages />
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
              <Route path="farm" element={<Navigate to="/admin/plots" replace />} />
              <Route path="rounds" element={<AdminRoundsPage />} />
              <Route path="rounds/history" element={<AdminRoundsHistoryPage />} />
              <Route path="rounds/:id" element={<AdminRoundDetailPage />} />
              <Route path="bookings" element={<AdminBookingsPage />} />
              <Route path="orders" element={<AdminOrdersPage />} />
              <Route path="crops" element={<AdminCropsPage />} />
              <Route path="districts" element={<Navigate to="/admin/customers" replace />} />
              <Route path="customers" element={<AdminCustomersPage />} />
              <Route path="settings" element={<AdminSettingsPage />} />
              <Route path="admins" element={<AdminAdminsPage />} />
              <Route path="audit" element={<Navigate to="/admin" replace />} />
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
