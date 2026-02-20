import { BrowserRouter, Route, Routes } from 'react-router-dom'
import HomePage from '../pages/home/HomePage'
import LoginPage from '../pages/auth/LoginPage'
import RegisterPage from '../pages/auth/RegisterPage'
import SupplierRegistrationPage from '../pages/supplier/SupplierRegistrationPage'
import SupplierDashboardPage from '../pages/supplier/SupplierDashboardPage'
import MarketplaceDashboardPage from '../pages/marketplace/MarketplaceDashboardPage'

export default function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/supplier/register" element={<SupplierRegistrationPage />} />
        <Route path="/supplier/dashboard" element={<SupplierDashboardPage />} />
        <Route path="/marketplace/dashboard" element={<MarketplaceDashboardPage />} />
      </Routes>
    </BrowserRouter>
  )
}
