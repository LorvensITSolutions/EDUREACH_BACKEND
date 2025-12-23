import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Provider } from "react-redux";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { Toaster } from "react-hot-toast";
import { store } from "./store";
import { ThemeProvider } from "./contexts/ThemeContext";

// Layouts
import AdminLayout from "./layouts/AdminLayout";
import EmployeeLayout from "./layouts/EmployeeLayout";

// Auth Pages
import Login from "./pages/auth/Login";
import Register from "./pages/auth/Register";
import ForgotPassword from "./pages/auth/ForgotPassword";
import ResetPassword from "./pages/auth/ResetPassword";
import VerifyEmail from "./pages/auth/VerifyEmail";
import VerifyInvitation from "./pages/auth/VerifyInvitation";

// Admin Pages
import AdminDashboard from "./pages/admin/Dashboard";
import Employees from "./pages/admin/Employees";
import AddEmployee from "./pages/admin/AddEmployee";
import EmployeeDetails from "./pages/admin/EmployeeDetails";
import EditEmployee from "./pages/admin/EditEmployee";
import Attendance from "./pages/admin/Attendance";
import ManualAttendance from "./pages/admin/ManualAttendance";
import AdminRequests from "./pages/admin/Requests";
import Reports from "./pages/admin/Reports";
import Configuration from "./pages/admin/Configuration";

// Employee Pages
import EmployeeDashboard from "./pages/employee/Dashboard";
import EmployeeAttendance from "./pages/employee/Attendance";
import EmployeeCalendar from "./components/employee/EmployeeCalendar";
import Requests from "./pages/employee/Requests";
import Profile from "./pages/employee/Profile";

// Components
import ProtectedRoute from "./components/auth/ProtectedRoute";
import { DesktopOnlyRoute } from "./components/auth/DesktopOnlyRoute";
import MobileAccessGuard from "./components/common/MobileAccessGuard";

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 10 * 60 * 1000, // 10 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function App() {
  return (
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <div className="App">
            <MobileAccessGuard>
              <Routes>
                {/* Public Routes */}
                <Route
                  path="/login"
                  element={
                    <DesktopOnlyRoute>
                      <Login />
                    </DesktopOnlyRoute>
                  }
                />
                <Route
                  path="/register"
                  element={
                    <DesktopOnlyRoute>
                      <Register />
                    </DesktopOnlyRoute>
                  }
                />
                <Route
                  path="/forgot-password"
                  element={
                    <DesktopOnlyRoute>
                      <ForgotPassword />
                    </DesktopOnlyRoute>
                  }
                />
                <Route
                  path="/reset-password/:token"
                  element={
                    <DesktopOnlyRoute>
                      <ResetPassword />
                    </DesktopOnlyRoute>
                  }
                />
                <Route path="/verify-email/:token" element={<VerifyEmail />} />
                <Route
                  path="/verify-invitation/:token"
                  element={
                    <DesktopOnlyRoute>
                      <VerifyInvitation />
                    </DesktopOnlyRoute>
                  }
                />

                {/* Admin Routes */}
                <Route
                  path="/admin"
                  element={<ProtectedRoute allowedRoles={["admin"]} />}
                >
                  <Route element={<AdminLayout />}>
                    <Route
                      index
                      element={<Navigate to="/admin/dashboard" replace />}
                    />
                    <Route path="dashboard" element={<AdminDashboard />} />
                    <Route path="employees" element={<Employees />} />
                    <Route path="employees/add" element={<AddEmployee />} />
                    <Route
                      path="employees/:id/details"
                      element={<EmployeeDetails />}
                    />
                    <Route
                      path="employees/:id/edit"
                      element={<EditEmployee />}
                    />
                    <Route path="attendance" element={<Attendance />} />
                    <Route
                      path="manual-attendance"
                      element={<ManualAttendance />}
                    />
                    <Route path="requests" element={<AdminRequests />} />
                    <Route path="reports" element={<Reports />} />
                    <Route path="configuration" element={<Configuration />} />
                  </Route>
                </Route>

                {/* Employee Routes */}
                <Route
                  path="/employee"
                  element={<ProtectedRoute allowedRoles={["employee"]} />}
                >
                  <Route element={<EmployeeLayout />}>
                    <Route
                      index
                      element={<Navigate to="/employee/dashboard" replace />}
                    />
                    <Route path="dashboard" element={<EmployeeDashboard />} />
                    <Route path="attendance" element={<EmployeeAttendance />} />
                    <Route path="calendar" element={<EmployeeCalendar />} />
                    <Route path="requests" element={<Requests />} />
                    <Route path="profile" element={<Profile />} />
                  </Route>
                </Route>

                {/* Default redirect */}
                <Route path="/" element={<Navigate to="/login" replace />} />
                <Route path="*" element={<Navigate to="/login" replace />} />
              </Routes>
            </MobileAccessGuard>
          </div>

          {/* React Query DevTools - only in development */}
          {/* Uncomment the line below if you need DevTools for debugging */}
          {/* {process.env.NODE_ENV === 'development' && <ReactQueryDevtools initialIsOpen={false} />} */}

          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                background: "#363636",
                color: "#fff",
              },
              success: {
                duration: 3000,
                iconTheme: {
                  primary: "#10B981",
                  secondary: "#fff",
                },
              },
              error: {
                duration: 5000,
                iconTheme: {
                  primary: "#EF4444",
                  secondary: "#fff",
                },
              },
            }}
          />
        </ThemeProvider>
      </QueryClientProvider>
    </Provider>
  );
}

export default App;
