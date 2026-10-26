import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import { RequireAuth, RequireAdmin } from "./components/Guards";

import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import BookPage from "./pages/BookPage";
import ConfirmationPage from "./pages/ConfirmationPage";
import MyBookingsPage from "./pages/MyBookingsPage";
import BookingDetailsPage from "./pages/BookingDetailsPage";
import ChangePasswordPage from "./pages/ChangePasswordPage";
import NotFoundPage from "./pages/NotFoundPage";

import AdminOverviewPage from "./pages/admin/AdminOverviewPage";
import AdminUsersPage from "./pages/admin/AdminUsersPage";
import AdminCreateUserPage from "./pages/admin/AdminCreateUserPage";
import AdminUserDetailPage from "./pages/admin/AdminUserDetailPage";
import AdminBookingsPage from "./pages/admin/AdminBookingsPage";
import AdminSettingsPage from "./pages/admin/AdminSettingsPage";

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />

        <Route
          path="/book"
          element={
            <RequireAuth>
              <BookPage />
            </RequireAuth>
          }
        />
        <Route
          path="/book/confirmation/:id"
          element={
            <RequireAuth>
              <ConfirmationPage />
            </RequireAuth>
          }
        />
        <Route
          path="/bookings"
          element={
            <RequireAuth>
              <MyBookingsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/bookings/:id"
          element={
            <RequireAuth>
              <BookingDetailsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/account/password"
          element={
            <RequireAuth>
              <ChangePasswordPage />
            </RequireAuth>
          }
        />

        <Route
          path="/admin"
          element={
            <RequireAdmin>
              <AdminOverviewPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/users"
          element={
            <RequireAdmin>
              <AdminUsersPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/users/new"
          element={
            <RequireAdmin>
              <AdminCreateUserPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/users/:id"
          element={
            <RequireAdmin>
              <AdminUserDetailPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/bookings"
          element={
            <RequireAdmin>
              <AdminBookingsPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/settings"
          element={
            <RequireAdmin>
              <AdminSettingsPage />
            </RequireAdmin>
          }
        />

        <Route path="/404" element={<NotFoundPage />} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Routes>
    </Layout>
  );
}
