// FinanceiroDashboard.tsx - Versão com integração entre abas
import { useState, useCallback } from 'react';
import { LogOut, TrendingUp, FileText, Building, User } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { FluxoCaixaTab } from './FluxoCaixaTab';
import { ControlePagamentoTab } from './ControlePagamentoTab';
import { ControleInstitucionalTab } from './ControleInstitucionalTab';
import logoImg from '../../assets/Gemini_Generated_Image_dimyf6dimyf6dimy-removebg-preview.png';

type Tab = 'fluxo' | 'pagamento' | 'institucional';

export function FinanceiroDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('fluxo');
  // 🔥 Estado para forçar recarregamento do Fluxo de Caixa quando uma nota for paga
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  
  const { signOut, userName } = useAuth();

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  // 🔥 Callback chamado quando uma nota é paga no ControlePagamentoTab
  const handleInvoicePaid = useCallback(() => {
    console.log('💰 Nota fiscal paga! Atualizando Fluxo de Caixa...');
    setRefreshTrigger(prev => prev + 1); // Incrementa o trigger para recarregar o Fluxo de Caixa
    
    // Se estiver na aba de pagamento, muda para a aba de fluxo? (opcional)
    // Se quiser, pode descomentar a linha abaixo para ir automaticamente para o Fluxo de Caixa
    // setActiveTab('fluxo');
  }, []);

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-blue-900 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <img src={logoImg} alt="IDHS" className="h-14 drop-shadow-md" />
              <div>
                <p className="text-blue-300 text-xs font-semibold uppercase tracking-widest">Sistema IDHS</p>
                <h1 className="text-xl font-bold text-white leading-tight">Módulo Financeiro</h1>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              {userName && (
                <div className="flex items-center space-x-2 px-4 py-2 bg-blue-800 rounded-lg border border-blue-700">
                  <User className="w-4 h-4 text-blue-300" />
                  <span className="text-white text-sm font-medium">{userName}</span>
                </div>
              )}
              <button
                onClick={handleSignOut}
                className="flex items-center space-x-2 px-4 py-2 text-blue-200 hover:text-white hover:bg-blue-800 rounded-lg transition-colors border border-transparent hover:border-blue-700"
              >
                <LogOut className="w-4 h-4" />
                <span className="text-sm font-medium">Sair</span>
              </button>
            </div>
          </div>
        </div>
        <div className="h-1 bg-gradient-to-r from-blue-500 via-cyan-400 to-blue-500" />
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
          <div className="bg-slate-50 border-b border-slate-200">
            <nav className="flex space-x-1 p-2 overflow-x-auto">
              <button
                onClick={() => setActiveTab('fluxo')}
                className={`flex items-center space-x-2 px-4 py-2.5 rounded-lg font-medium transition-all whitespace-nowrap text-sm ${
                  activeTab === 'fluxo'
                    ? 'bg-blue-900 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-200 hover:text-slate-800'
                }`}
              >
                <TrendingUp className="w-4 h-4" />
                <span>Fluxo de Caixa</span>
              </button>
              <button
                onClick={() => setActiveTab('pagamento')}
                className={`flex items-center space-x-2 px-4 py-2.5 rounded-lg font-medium transition-all whitespace-nowrap text-sm ${
                  activeTab === 'pagamento'
                    ? 'bg-blue-900 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-200 hover:text-slate-800'
                }`}
              >
                <FileText className="w-4 h-4" />
                <span>Controle de Pagamento</span>
              </button>
              <button
                onClick={() => setActiveTab('institucional')}
                className={`flex items-center space-x-2 px-4 py-2.5 rounded-lg font-medium transition-all whitespace-nowrap text-sm ${
                  activeTab === 'institucional'
                    ? 'bg-blue-900 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-200 hover:text-slate-800'
                }`}
              >
                <Building className="w-4 h-4" />
                <span>Controle Institucional</span>
              </button>
            </nav>
          </div>

          {/* CONTEÚDO DAS ABAS - COM PROPS DE INTEGRAÇÃO */}
          <div className="p-6">
            {activeTab === 'fluxo' && (
              <FluxoCaixaTab 
                refreshTrigger={refreshTrigger} // 🔥 Passa o trigger para recarregar quando necessário
              />
            )}
            {activeTab === 'pagamento' && (
              <ControlePagamentoTab 
                onInvoicePaid={handleInvoicePaid} // 🔥 Callback para quando uma nota for paga
              />
            )}
            {activeTab === 'institucional' && <ControleInstitucionalTab />}
          </div>
        </div>
      </div>
    </div>
  );
}
