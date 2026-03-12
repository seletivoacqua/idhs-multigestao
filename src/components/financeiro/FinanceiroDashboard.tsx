// FinanceiroDashboard.tsx
import { useState, useEffect } from 'react';
import { LogOut, TrendingUp, FileText, Building, User } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { FinancialProvider, useFinancial } from '../../contexts/FinancialContext';
import { FluxoCaixaTab } from './FluxoCaixaTab';
import { ControlePagamentoTab } from './ControlePagamentoTab';
import { ControleInstitucionalTab } from './ControleInstitucionalTab';
import { FinancialSummary } from './components/FinancialSummary';
import logoImg from '../../assets/image.png';

type Tab = 'fluxo' | 'pagamento' | 'institucional';

function DashboardContent() {
  const [activeTab, setActiveTab] = useState<Tab>('fluxo');
  const [selectedMonth, setSelectedMonth] = useState(
    new Date().toISOString().substring(0, 7)
  );
  const { signOut, userName } = useAuth();
  const { refreshData, loading } = useFinancial();

  // Atualizar dados quando o mês mudar
  useEffect(() => {
    refreshData(selectedMonth);
  }, [selectedMonth, refreshData]);

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const handleInvoicePaid = async () => {
    // Recarregar dados após pagamento
    await refreshData(selectedMonth);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white shadow-sm border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <img src={logoImg} alt="IDHS" className="h-12" />
              <h1 className="text-2xl font-bold text-slate-800">Módulo Financeiro</h1>
            </div>
            <div className="flex items-center space-x-4">
              {userName && (
                <div className="flex items-center space-x-2 px-4 py-2 bg-slate-100 rounded-lg">
                  <User className="w-5 h-5 text-slate-600" />
                  <span className="text-slate-700 font-medium">{userName}</span>
                </div>
              )}
              <button
                onClick={handleSignOut}
                className="flex items-center space-x-2 px-4 py-2 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <LogOut className="w-5 h-5" />
                <span>Sair</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-white rounded-lg shadow-sm border border-slate-200">
          {/* Seletor de Mês e Resumo Financeiro */}
          <div className="p-4 border-b border-slate-200 bg-slate-50">
            <FinancialSummary 
              selectedMonth={selectedMonth}
              onMonthChange={setSelectedMonth}
            />
          </div>

          {/* Navegação por Abas */}
          <div className="border-b border-slate-200">
            <nav className="flex space-x-1 p-2">
              <button
                onClick={() => setActiveTab('fluxo')}
                className={`flex items-center space-x-2 px-6 py-3 rounded-lg font-medium transition-colors ${
                  activeTab === 'fluxo'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <TrendingUp className="w-5 h-5" />
                <span>Fluxo de Caixa</span>
              </button>
              <button
                onClick={() => setActiveTab('pagamento')}
                className={`flex items-center space-x-2 px-6 py-3 rounded-lg font-medium transition-colors ${
                  activeTab === 'pagamento'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <FileText className="w-5 h-5" />
                <span>Controle de Pagamento</span>
              </button>
              <button
                onClick={() => setActiveTab('institucional')}
                className={`flex items-center space-x-2 px-6 py-3 rounded-lg font-medium transition-colors ${
                  activeTab === 'institucional'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Building className="w-5 h-5" />
                <span>Controle Institucional</span>
              </button>
            </nav>
          </div>

          {/* Conteúdo das Abas */}
          <div className="p-6">
            {activeTab === 'fluxo' && <FluxoCaixaTab selectedMonth={selectedMonth} />}
            {activeTab === 'pagamento' && (
              <ControlePagamentoTab 
                selectedMonth={selectedMonth}
                onInvoicePaid={handleInvoicePaid}
              />
            )}
            {activeTab === 'institucional' && <ControleInstitucionalTab />}
          </div>
        </div>
      </div>
    </div>
  );
}

export function FinanceiroDashboard() {
  return (
    <FinancialProvider>
      <DashboardContent />
    </FinancialProvider>
  );
}
