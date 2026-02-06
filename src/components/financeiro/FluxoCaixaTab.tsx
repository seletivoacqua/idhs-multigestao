import { useState, useEffect } from 'react';
import { Plus, TrendingUp, TrendingDown, Calendar, Filter, Settings } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface Transaction {
  id: string;
  type: 'income' | 'expense';
  amount: number;
  method: string;
  category?: string;
  description: string;
  transaction_date: string;
}

interface FixedExpense {
  id: string;
  name: string;
  amount: number;
  method: string;
  description: string;
  active: boolean;
}

export function FluxoCaixaTab() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [fixedExpenses, setFixedExpenses] = useState<FixedExpense[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showFixedExpensesModal, setShowFixedExpensesModal] = useState(false);
  const [filterMonth, setFilterMonth] = useState<string>(
    new Date().toISOString().substring(0, 7)
  );
  const { user } = useAuth();

  const [formData, setFormData] = useState({
    type: 'income' as 'income' | 'expense',
    amount: '',
    method: 'pix',
    category: '',
    description: '',
    transaction_date: new Date().toISOString().split('T')[0],
  });

  const [fixedExpenseForm, setFixedExpenseForm] = useState({
    name: '',
    amount: '',
    method: 'boleto',
    description: '',
  });

  useEffect(() => {
    loadTransactions();
    loadFixedExpenses();
  }, [filterMonth]);

  const loadTransactions = async () => {
    if (!user) return;

    const startDate = `${filterMonth}-01`;
    const endDate = new Date(filterMonth + '-01');
    endDate.setMonth(endDate.getMonth() + 1);
    endDate.setDate(0);
    const endDateStr = endDate.toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('cash_flow_transactions')
      .select('*')
      .eq('user_id', user.id)
      .gte('transaction_date', startDate)
      .lte('transaction_date', endDateStr)
      .order('transaction_date', { ascending: false });

    if (error) {
      console.error('Error loading transactions:', error);
      return;
    }

    setTransactions(data || []);
  };

  const loadFixedExpenses = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('fixed_expenses')
      .select('*')
      .eq('user_id', user.id)
      .order('name');

    if (error) {
      console.error('Error loading fixed expenses:', error);
      return;
    }

    setFixedExpenses(data || []);
  };

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const { error } = await supabase.from('cash_flow_transactions').insert([
      {
        user_id: user.id,
        type: formData.type,
        amount: parseFloat(formData.amount),
        method: formData.method,
        category: formData.type === 'expense' ? formData.category : null,
        description: formData.description,
        transaction_date: formData.transaction_date,
      },
    ]);

    if (error) {
      console.error('Error adding transaction:', error);
      alert('Erro ao adicionar transação');
      return;
    }

    setShowAddModal(false);
    setFormData({
      type: 'income',
      amount: '',
      method: 'pix',
      category: '',
      description: '',
      transaction_date: new Date().toISOString().split('T')[0],
    });
    loadTransactions();
  };

  const handleAddFixedExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const { error } = await supabase.from('fixed_expenses').insert([
      {
        user_id: user.id,
        name: fixedExpenseForm.name,
        amount: parseFloat(fixedExpenseForm.amount),
        method: fixedExpenseForm.method,
        description: fixedExpenseForm.description,
      },
    ]);

    if (error) {
      console.error('Error adding fixed expense:', error);
      alert('Erro ao adicionar despesa fixa');
      return;
    }

    setFixedExpenseForm({
      name: '',
      amount: '',
      method: 'boleto',
      description: '',
    });
    loadFixedExpenses();
  };

  const toggleFixedExpense = async (id: string, active: boolean) => {
    const { error } = await supabase
      .from('fixed_expenses')
      .update({ active: !active })
      .eq('id', id);

    if (error) {
      console.error('Error updating fixed expense:', error);
      return;
    }

    loadFixedExpenses();
  };

  const totalIncome = transactions
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const totalExpense = transactions
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const balance = totalIncome - totalExpense;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Calendar className="w-5 h-5 text-slate-500" />
            <input
              type="month"
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <button
            onClick={() => setShowFixedExpensesModal(!showFixedExpensesModal)}
            className="flex items-center space-x-2 px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors"
          >
            <Settings className="w-5 h-5" />
            <span>Despesas Fixas</span>
          </button>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          <span>Nova Transação</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-green-600 font-medium">Receitas</p>
              <p className="text-2xl font-bold text-green-700">
                R$ {totalIncome.toFixed(2)}
              </p>
            </div>
            <TrendingUp className="w-8 h-8 text-green-600" />
          </div>
        </div>

        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-red-600 font-medium">Despesas</p>
              <p className="text-2xl font-bold text-red-700">
                R$ {totalExpense.toFixed(2)}
              </p>
            </div>
            <TrendingDown className="w-8 h-8 text-red-600" />
          </div>
        </div>

        <div className={`${balance >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'} border rounded-lg p-4`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-sm ${balance >= 0 ? 'text-blue-600' : 'text-orange-600'} font-medium`}>Saldo</p>
              <p className={`text-2xl font-bold ${balance >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
                R$ {balance.toFixed(2)}
              </p>
            </div>
            <Filter className={`w-8 h-8 ${balance >= 0 ? 'text-blue-600' : 'text-orange-600'}`} />
          </div>
        </div>
      </div>

      {showFixedExpensesModal && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Gerenciar Despesas Fixas</h3>

          <form onSubmit={handleAddFixedExpense} className="mb-6 grid grid-cols-1 md:grid-cols-5 gap-3">
            <input
              type="text"
              placeholder="Nome da despesa"
              value={fixedExpenseForm.name}
              onChange={(e) => setFixedExpenseForm({ ...fixedExpenseForm, name: e.target.value })}
              required
              className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <input
              type="number"
              step="0.01"
              placeholder="Valor"
              value={fixedExpenseForm.amount}
              onChange={(e) => setFixedExpenseForm({ ...fixedExpenseForm, amount: e.target.value })}
              required
              className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <select
              value={fixedExpenseForm.method}
              onChange={(e) => setFixedExpenseForm({ ...fixedExpenseForm, method: e.target.value })}
              className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="boleto">Boleto</option>
              <option value="pix">PIX</option>
              <option value="transferencia">Transferência</option>
            </select>
            <input
              type="text"
              placeholder="Descrição"
              value={fixedExpenseForm.description}
              onChange={(e) => setFixedExpenseForm({ ...fixedExpenseForm, description: e.target.value })}
              className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Adicionar
            </button>
          </form>

          <div className="space-y-2">
            {fixedExpenses.map((expense) => (
              <div
                key={expense.id}
                className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-lg"
              >
                <div className="flex-1">
                  <p className={`font-medium ${expense.active ? 'text-slate-800' : 'text-slate-400'}`}>
                    {expense.name}
                  </p>
                  <p className="text-sm text-slate-500">
                    R$ {expense.amount.toFixed(2)} - {expense.method}
                  </p>
                </div>
                <button
                  onClick={() => toggleFixedExpense(expense.id, expense.active)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    expense.active
                      ? 'bg-green-100 text-green-700 hover:bg-green-200'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {expense.active ? 'Ativa' : 'Inativa'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Data</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Tipo</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Descrição</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Método</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Categoria</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-600 uppercase">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {transactions.map((transaction) => (
                <tr key={transaction.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700">
                    {new Date(transaction.transaction_date).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        transaction.type === 'income'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {transaction.type === 'income' ? 'Receita' : 'Despesa'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-700">{transaction.description}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700 capitalize">
                    {transaction.method}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700">
                    {transaction.category ? transaction.category.replace('_', ' ') : '-'}
                  </td>
                  <td className={`px-6 py-4 whitespace-nowrap text-sm text-right font-medium ${
                    transaction.type === 'income' ? 'text-green-600' : 'text-red-600'
                  }`}>
                    R$ {Number(transaction.amount).toFixed(2)}
                  </td>
                </tr>
              ))}
              {transactions.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                    Nenhuma transação encontrada para este período
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-slate-800 mb-4">Nova Transação</h3>
            <form onSubmit={handleAddTransaction} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Tipo</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, type: 'income', category: '' })}
                    className={`py-2 rounded-lg font-medium transition-colors ${
                      formData.type === 'income'
                        ? 'bg-green-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Receita
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, type: 'expense' })}
                    className={`py-2 rounded-lg font-medium transition-colors ${
                      formData.type === 'expense'
                        ? 'bg-red-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Despesa
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Valor</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Método</label>
                <select
                  value={formData.method}
                  onChange={(e) => setFormData({ ...formData, method: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {formData.type === 'income' ? (
                    <>
                      <option value="pix">PIX</option>
                      <option value="transferencia">Transferência</option>
                      <option value="dinheiro">Dinheiro</option>
                    </>
                  ) : (
                    <>
                      <option value="boleto">Boleto</option>
                      <option value="pix">PIX</option>
                      <option value="transferencia">Transferência</option>
                    </>
                  )}
                </select>
              </div>

              {formData.type === 'expense' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Categoria</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Selecione...</option>
                    <option value="despesas_fixas">Despesas Fixas</option>
                    <option value="despesas_variaveis">Despesas Variáveis</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Data</label>
                <input
                  type="date"
                  value={formData.transaction_date}
                  onChange={(e) => setFormData({ ...formData, transaction_date: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Descrição</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  required
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Adicionar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
