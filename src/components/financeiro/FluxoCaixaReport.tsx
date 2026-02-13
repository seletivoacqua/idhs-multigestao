import { useState } from 'react';
import { X, FileDown, FileSpreadsheet } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';

interface Transaction {
  id: string;
  type: 'income' | 'expense';
  amount: number;
  method: string;
  category?: string;
  subcategoria?: string;
  description: string;
  transaction_date: string;
  fonte_pagadora?: string;
  com_nota?: boolean;
  so_recibo?: boolean;
}

interface FluxoCaixaReportProps {
  onClose: () => void;
}

export function FluxoCaixaReport({ onClose }: FluxoCaixaReportProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filters, setFilters] = useState({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    type: 'all',
    documentType: 'all',
    category: 'all',
  });

  const handleGenerateReport = async () => {
    if (!user) return;
    setLoading(true);

    try {
      let query = supabase
        .from('cash_flow_transactions')
        .select('*')
        .eq('user_id', user.id)
        .gte('transaction_date', filters.startDate)
        .lte('transaction_date', filters.endDate)
        .order('transaction_date', { ascending: false });

      if (filters.type !== 'all') {
        query = query.eq('type', filters.type);
      }

      if (filters.documentType === 'com_nota') {
        query = query.eq('com_nota', true);
      } else if (filters.documentType === 'so_recibo') {
        query = query.eq('so_recibo', true);
      }

      if (filters.category !== 'all') {
        query = query.eq('category', filters.category);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error loading transactions:', error);
        alert('Erro ao gerar relatório');
        return;
      }

      setTransactions(data || []);
    } catch (error) {
      console.error('Error generating report:', error);
      alert('Erro ao gerar relatório');
    } finally {
      setLoading(false);
    }
  };

  const exportToPDF = () => {
    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.text('Relatório de Fluxo de Caixa', 14, 20);

    doc.setFontSize(11);
    doc.text(`Período: ${new Date(filters.startDate).toLocaleDateString('pt-BR')} a ${new Date(filters.endDate).toLocaleDateString('pt-BR')}`, 14, 30);

    let yPos = 45;
    doc.setFontSize(10);

    doc.text('Data', 14, yPos);
    doc.text('Tipo', 45, yPos);
    doc.text('Descrição', 70, yPos);
    doc.text('Valor (R$)', 160, yPos);

    yPos += 5;
    doc.line(14, yPos, 200, yPos);
    yPos += 5;

    const totalIncome = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + Number(t.amount), 0);
    const totalExpense = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + Number(t.amount), 0);

    transactions.forEach((transaction) => {
      if (yPos > 270) {
        doc.addPage();
        yPos = 20;
      }

      doc.text(new Date(transaction.transaction_date).toLocaleDateString('pt-BR'), 14, yPos);
      doc.text(transaction.type === 'income' ? 'Entrada' : 'Saída', 45, yPos);
      doc.text(transaction.description.substring(0, 40), 70, yPos);
      doc.text(Number(transaction.amount).toFixed(2), 160, yPos);

      yPos += 7;
    });

    yPos += 5;
    doc.line(14, yPos, 200, yPos);
    yPos += 7;

    doc.setFontSize(12);
    doc.text(`Total Entradas: R$ ${totalIncome.toFixed(2)}`, 14, yPos);
    yPos += 7;
    doc.text(`Total Saídas: R$ ${totalExpense.toFixed(2)}`, 14, yPos);
    yPos += 7;
    doc.text(`Saldo: R$ ${(totalIncome - totalExpense).toFixed(2)}`, 14, yPos);

    doc.save('relatorio-fluxo-caixa.pdf');
  };

  const exportToExcel = () => {
    const data = transactions.map((transaction) => ({
      Data: new Date(transaction.transaction_date).toLocaleDateString('pt-BR'),
      Tipo: transaction.type === 'income' ? 'Entrada' : 'Saída',
      'Fonte Pagadora': transaction.fonte_pagadora || '-',
      Descrição: transaction.description,
      Método: transaction.method,
      Categoria: transaction.category ? transaction.category.replace('_', ' ') : '-',
      Subcategoria: transaction.subcategoria || '-',
      'Com Nota': transaction.com_nota ? 'Sim' : 'Não',
      'Só Recibo': transaction.so_recibo ? 'Sim' : 'Não',
      'Valor (R$)': Number(transaction.amount).toFixed(2),
    }));

    const totalIncome = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + Number(t.amount), 0);
    const totalExpense = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + Number(t.amount), 0);

    data.push({
      Data: '',
      Tipo: '',
      'Fonte Pagadora': '',
      Descrição: '',
      Método: '',
      Categoria: '',
      Subcategoria: '',
      'Com Nota': '',
      'Só Recibo': 'Total Entradas:',
      'Valor (R$)': totalIncome.toFixed(2),
    });

    data.push({
      Data: '',
      Tipo: '',
      'Fonte Pagadora': '',
      Descrição: '',
      Método: '',
      Categoria: '',
      Subcategoria: '',
      'Com Nota': '',
      'Só Recibo': 'Total Saídas:',
      'Valor (R$)': totalExpense.toFixed(2),
    });

    data.push({
      Data: '',
      Tipo: '',
      'Fonte Pagadora': '',
      Descrição: '',
      Método: '',
      Categoria: '',
      Subcategoria: '',
      'Com Nota': '',
      'Só Recibo': 'Saldo:',
      'Valor (R$)': (totalIncome - totalExpense).toFixed(2),
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Fluxo de Caixa');
    XLSX.writeFile(workbook, 'relatorio-fluxo-caixa.xlsx');
  };

  const totalIncome = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + Number(t.amount), 0);
  const totalExpense = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + Number(t.amount), 0);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl max-w-6xl w-full p-6 my-8 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-slate-800">Relatório de Fluxo de Caixa</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="space-y-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Data Inicial</label>
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Data Final</label>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Tipo</label>
              <select
                value={filters.type}
                onChange={(e) => setFilters({ ...filters, type: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">Todos</option>
                <option value="income">Entradas</option>
                <option value="expense">Saídas</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Documento</label>
              <select
                value={filters.documentType}
                onChange={(e) => setFilters({ ...filters, documentType: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">Todos</option>
                <option value="com_nota">Com Nota</option>
                <option value="so_recibo">Só Recibo</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Categoria</label>
              <select
                value={filters.category}
                onChange={(e) => setFilters({ ...filters, category: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">Todas</option>
                <option value="despesas_fixas">Despesas Fixas</option>
                <option value="despesas_variaveis">Despesas Variáveis</option>
              </select>
            </div>
          </div>

          <button
            onClick={handleGenerateReport}
            disabled={loading}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-slate-300"
          >
            {loading ? 'Gerando...' : 'Gerar Relatório'}
          </button>
        </div>

        {transactions.length > 0 && (
          <>
            <div className="mb-4 flex space-x-3">
              <button
                onClick={exportToPDF}
                className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                <FileDown className="w-5 h-5" />
                <span>Exportar PDF</span>
              </button>
              <button
                onClick={exportToExcel}
                className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                <FileSpreadsheet className="w-5 h-5" />
                <span>Exportar Excel</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-sm text-green-600 font-medium">Total Entradas</p>
                <p className="text-2xl font-bold text-green-700">R$ {totalIncome.toFixed(2)}</p>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-600 font-medium">Total Saídas</p>
                <p className="text-2xl font-bold text-red-700">R$ {totalExpense.toFixed(2)}</p>
              </div>
              <div className={`${totalIncome - totalExpense >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'} border rounded-lg p-4`}>
                <p className={`text-sm ${totalIncome - totalExpense >= 0 ? 'text-blue-600' : 'text-orange-600'} font-medium`}>Saldo</p>
                <p className={`text-2xl font-bold ${totalIncome - totalExpense >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
                  R$ {(totalIncome - totalExpense).toFixed(2)}
                </p>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Data</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Tipo</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Descrição</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Categoria</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Subcategoria</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Doc</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-slate-600 uppercase">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {transactions.map((transaction) => (
                      <tr key={transaction.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700">
                          {new Date(transaction.transaction_date).toLocaleDateString('pt-BR')}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium ${
                              transaction.type === 'income'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-red-100 text-red-700'
                            }`}
                          >
                            {transaction.type === 'income' ? 'Entrada' : 'Saída'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700">{transaction.description}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700">
                          {transaction.category ? transaction.category.replace('_', ' ') : '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700">
                          {transaction.subcategoria || '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700">
                          {transaction.com_nota ? 'Nota' : transaction.so_recibo ? 'Recibo' : '-'}
                        </td>
                        <td className={`px-4 py-3 whitespace-nowrap text-sm text-right font-medium ${
                          transaction.type === 'income' ? 'text-green-600' : 'text-red-600'
                        }`}>
                          R$ {Number(transaction.amount).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {transactions.length === 0 && !loading && (
          <div className="text-center py-12 text-slate-500">
            Clique em "Gerar Relatório" para visualizar os dados
          </div>
        )}
      </div>
    </div>
  );
}
