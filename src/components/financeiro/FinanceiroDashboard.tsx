// FinanceiroDashboard.tsx - Versão com integração entre abas
import { useState, useCallback } from 'react';
import { LogOut, TrendingUp, FileText, Building, User } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { FluxoCaixaTab } from './FluxoCaixaTab';
import { ControlePagamentoTab } from './ControlePagamentoTab';
import { ControleInstitucionalTab } from './ControleInstitucionalTab';
import logoImg from '../../assets/image.png';

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
          {/* NAVEGAÇÃO POR ABAS */}
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
