// src/components/financeiro/FinancialSummary.tsx
import { useEffect, useState } from 'react';
import { Calendar, TrendingUp, TrendingDown, Clock, DollarSign } from 'lucide-react';
import { useFinancial } from '../../contexts/FinancialContext';

// Função auxiliar de formatação
const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
};

interface FinancialSummaryProps {
  selectedMonth: string;
  onMonthChange: (month: string) => void;
}

export function FinancialSummary({ selectedMonth, onMonthChange }: FinancialSummaryProps) {
  const { getMonthlyTotals, loadInitialBalance, saveInitialBalance } = useFinancial();
  const [initialBalance, setInitialBalance] = useState(0);
  const [editingInitialBalance, setEditingInitialBalance] = useState(false);
  const [initialBalanceInput, setInitialBalanceInput] = useState('0');

  const { income, expense, pendingInvoices } = getMonthlyTotals(selectedMonth);
  const balance = initialBalance + income - expense;

  // Carregar saldo inicial quando o mês mudar
  useEffect(() => {
    const [year, month] = selectedMonth.split('-').map(Number);
    loadInitialBalance(year, month).then(balance => {
      setInitialBalance(balance);
      setInitialBalanceInput(balance.toString());
    });
  }, [selectedMonth, loadInitialBalance]);

  const handleSaveInitialBalance = async () => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const newBalance = parseFloat(initialBalanceInput) || 0;
    
    try {
      await saveInitialBalance(year, month, newBalance);
      setInitialBalance(newBalance);
      setEditingInitialBalance(false);
    } catch (error) {
      console.error('Error saving initial balance:', error);
      alert('Erro ao salvar saldo inicial');
    }
  };

  return (
    <div className="flex flex-col space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2 bg-white px-4 py-2 rounded-lg border border-slate-200">
            <Calendar className="w-5 h-5 text-slate-500" />
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => onMonthChange(e.target.value)}
              className="border-0 focus:ring-0 text-lg font-medium"
            />
          </div>
        </div>

        <div className="text-sm text-slate-500">
          {new Date(selectedMonth + '-01').toLocaleDateString('pt-BR', { 
            month: 'long', 
            year: 'numeric' 
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {/* Saldo Inicial */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 font-medium">Saldo Inicial</p>
              {editingInitialBalance ? (
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="number"
                    step="0.01"
                    value={initialBalanceInput}
                    onChange={(e) => setInitialBalanceInput(e.target.value)}
                    className="w-24 px-2 py-1 text-sm border border-slate-300 rounded"
                    autoFocus
                  />
                  <button
                    onClick={handleSaveInitialBalance}
                    className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700"
                  >
                    Salvar
                  </button>
                  <button
                    onClick={() => {
                      setEditingInitialBalance(false);
                      setInitialBalanceInput(initialBalance.toString());
                    }}
                    className="text-xs bg-slate-300 text-slate-700 px-2 py-1 rounded hover:bg-slate-400"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <p className="text-lg font-bold text-slate-700">
                    {formatCurrency(initialBalance)}
                  </p>
                  <button
                    onClick={() => setEditingInitialBalance(true)}
                    className="text-xs text-blue-600 hover:text-blue-800"
                  >
                    Editar
                  </button>
                </div>
              )}
            </div>
            <DollarSign className="w-6 h-6 text-slate-400" />
          </div>
        </div>

        {/* Receitas */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-green-600 font-medium">Receitas</p>
              <p className="text-lg font-bold text-green-700">
                {formatCurrency(income)}
              </p>
            </div>
            <TrendingUp className="w-6 h-6 text-green-600" />
          </div>
        </div>

        {/* Despesas */}
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-red-600 font-medium">Despesas</p>
              <p className="text-lg font-bold text-red-700">
                {formatCurrency(expense)}
              </p>
            </div>
            <TrendingDown className="w-6 h-6 text-red-600" />
          </div>
        </div>

        {/* A Pagar */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-yellow-600 font-medium">A Pagar</p>
              <p className="text-lg font-bold text-yellow-700">
                {formatCurrency(pendingInvoices)}
              </p>
            </div>
            <Clock className="w-6 h-6 text-yellow-600" />
          </div>
        </div>

        {/* Saldo Final */}
        <div className={`${balance >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'} rounded-lg p-4`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-sm ${balance >= 0 ? 'text-blue-600' : 'text-orange-600'} font-medium`}>
                Saldo Final
              </p>
              <p className={`text-lg font-bold ${balance >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
                {formatCurrency(balance)}
              </p>
            </div>
            <DollarSign className={`w-6 h-6 ${balance >= 0 ? 'text-blue-600' : 'text-orange-600'}`} />
          </div>
        </div>
      </div>
    </div>
  );
}
