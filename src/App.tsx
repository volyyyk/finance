import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Header } from './components/Header';
import { StatsCards } from './components/StatsCards';
import { GoalCard } from './components/GoalCard';
import { ForecastCharts } from './components/ForecastCharts';
import { EventsCalendar } from './components/EventsCalendar';
import { ProductsSection } from './components/ProductsSection';
import { CashbackSection } from './components/CashbackSection';
import { InvestmentsSection } from './components/InvestmentsSection';
import { CapacitorOTAPanel } from './components/CapacitorOTAPanel';
import { ProductModal } from './components/ProductModal';
import { SettingsDrawer } from './components/SettingsDrawer';

import { StorageService } from './services/storageService';
import { Product, Goal, CashbackMonthData, CashbackDictionary, ProductType } from './types/finance';
import { StatsCalculator } from './utils/financeCalculations';

export default function App() {
  const [activeTab, setActiveTab] = useState<'main' | 'cashback' | 'invest' | 'apk'>('cashback');
  
  // Theme state
  const [theme, setTheme] = useState<'dark' | 'light'>(() => StorageService.getTheme());

  // Core Data
  const [products, setProducts] = useState<Product[]>(() => StorageService.getProducts());
  const [goal, setGoal] = useState<Goal>(() => StorageService.getGoal());
  const [cashbackData, setCashbackData] = useState<CashbackMonthData>(() => StorageService.getCashbackData());
  const [cbDict, setCbDict] = useState<CashbackDictionary>(() => StorageService.getCbDict());

  // Modals & Drawers
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [modalDefaultType, setModalDefaultType] = useState<ProductType>('deposit');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Initial theme sync
  useEffect(() => {
    StorageService.saveTheme(theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      StorageService.saveTheme(next);
      return next;
    });
  }, []);

  // Save changes handler for products
  const handleUpdateProducts = useCallback((newProducts: Product[]) => {
    setProducts(newProducts);
    StorageService.saveProducts(newProducts);
  }, []);

  // Save changes for goal
  const handleUpdateGoal = useCallback((newGoal: Goal) => {
    setGoal(newGoal);
    StorageService.saveGoal(newGoal);
  }, []);

  // Save changes for cashback
  const handleUpdateCashback = useCallback((newData: CashbackMonthData) => {
    setCashbackData(newData);
    StorageService.saveCashbackData(newData);
  }, []);

  // Save changes for cbDict
  const handleUpdateCbDict = useCallback((newDict: CashbackDictionary) => {
    setCbDict(newDict);
    StorageService.saveCbDict(newDict);
  }, []);

  // JS-Optimizations: calculate overall stats with useMemo
  const stats = useMemo(() => {
    return StatsCalculator.calculate(products);
  }, [products]);

  // Product actions
  const handleOpenAddModal = (type: ProductType = 'deposit') => {
    setEditingProduct(null);
    setModalDefaultType(type);
    setIsProductModalOpen(true);
  };

  const handleEditProduct = (prod: Product) => {
    setEditingProduct(prod);
    setModalDefaultType(prod.type);
    setIsProductModalOpen(true);
  };

  const handleDeleteProduct = (id: string) => {
    const next = products.filter(p => p.id !== id);
    handleUpdateProducts(next);
  };

  const handleSaveProductModal = (product: Product) => {
    if (editingProduct) {
      const next = products.map(p => p.id === product.id ? product : p);
      handleUpdateProducts(next);
    } else {
      const next = [...products, product];
      handleUpdateProducts(next);
    }
  };

  const handleUpdateSingleProduct = (updated: Product) => {
    const next = products.map(p => p.id === updated.id ? updated : p);
    handleUpdateProducts(next);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      
      {/* Top 3-Zone Navigation Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenAddModal={() => activeTab === 'cashback' ? setActiveTab('cashback') : handleOpenAddModal()}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        
        {/* 1. Main Accounting Tab */}
        {activeTab === 'main' && (
          <div className="space-y-6">
            {/* KPI Cards */}
            <StatsCards stats={stats} />

            {/* Goal Progress Banner */}
            <GoalCard goal={goal} onSaveGoal={handleUpdateGoal} stats={stats} />

            {/* Forecast Chart */}
            <ForecastCharts products={products} />

            {/* Calendar & Upcoming Events */}
            <EventsCalendar 
              products={products} 
              onSelectProduct={handleEditProduct} 
            />

            {/* Products List & Account Balances */}
            <ProductsSection
              products={products}
              onOpenAddModal={handleOpenAddModal}
              onEditProduct={handleEditProduct}
              onDeleteProduct={handleDeleteProduct}
            />
          </div>
        )}

        {/* 2. Cashback Tab (Featuring 3 Collapsible Lists at the bottom with illuminated edge accents) */}
        {activeTab === 'cashback' && (
          <CashbackSection
            cashbackData={cashbackData}
            setCashbackData={handleUpdateCashback}
            cbDict={cbDict}
            setCbDict={handleUpdateCbDict}
          />
        )}

        {/* 3. Investments Tab */}
        {activeTab === 'invest' && (
          <InvestmentsSection
            products={products}
            onUpdateProduct={handleUpdateSingleProduct}
          />
        )}

        {/* 4. Native APK & Capacitor OTA Tab */}
        {activeTab === 'apk' && (
          <CapacitorOTAPanel />
        )}

      </main>

      {/* Modals and Drawers */}
      <ProductModal
        isOpen={isProductModalOpen}
        onClose={() => setIsProductModalOpen(false)}
        onSave={handleSaveProductModal}
        editingProduct={editingProduct}
        defaultType={modalDefaultType}
      />

      <SettingsDrawer
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

    </div>
  );
}
