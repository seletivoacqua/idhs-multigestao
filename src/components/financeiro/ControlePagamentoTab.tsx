import { useState, useEffect } from 'react';
import { Plus, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface Invoice {
  id: string;
  item_number: number;
  unit_name: string;
  cnpj_cpf: string;
  exercise_month: number;
  exercise_year: number;
  document_type: string;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  net_value: number;
  payment_status: 'PAGO' | 'EM ABERTO' | 'ATRASADO';
  payment_date?: string;
  paid_value?: number;
  created_at: string;
}

export function ControlePagamentoTab() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const { user } = useAuth();

  const [formData, setFormData] = useState({
    unit_name: '',
    cnpj_cpf: '',
    exercise_month: new Date().getMonth() + 1,
    exercise_year: new Date().getFullYear(),
    document_type: 'Nota Fiscal',
    invoice_number: '',
    issue_date: new Date().toISOString().split('T')[0],
    due_date: new Date().toISOString().split('T')[0],
    net_value: '',
    payment_status: 'EM ABERTO' as 'PAGO' | 'EM ABERTO' | 'ATRASADO',
    payment_date: '',
    paid_value: '',
  });

  useEffect(() => {
    loadInvoices();
  }, []);

  const loadInvoices = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .order('item_number', { ascending: false });

    if (error) {
      console.error('Error loading invoices:', error);
      return;
    }

    setInvoices(data || []);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (editingInvoice) {
      const { error } = await supabase
        .from('invoices')
        .update({
          unit_name: formData.unit_name,
          cnpj_cpf: formData.cnpj_cpf,
          exercise_month: formData.exercise_month,
          exercise_year: formData.exercise_year,
          document_type: formData.document_type,
          invoice_number: formData.invoice_number,
          issue_date: formData.issue_date,
          due_date: formData.due_date,
          net_value: parseFloat(formData.net_value),
          payment_status: formData.payment_status,
          payment_date: formData.payment_date || null,
          paid_value: formData.paid_value ? parseFloat(formData.paid_value) : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingInvoice.id);

      if (error) {
        console.error('Error updating invoice:', error);
        alert('Erro ao atualizar nota fiscal');
        return;
      }
    } else {
      const { data: itemNumberData } = await supabase.rpc('get_next_item_number', {
        p_user_id: user.id,
      });

      const { error } = await supabase.from('invoices').insert([
        {
          user_id: user.id,
          item_number: itemNumberData || 1,
          unit_name: formData.unit_name,
          cnpj_cpf: formData.cnpj_cpf,
          exercise_month: formData.exercise_month,
          exercise_year: formData.exercise_year,
          document_type: formData.document_type,
          invoice_number: formData.invoice_number,
          issue_date: formData.issue_date,
          due_date: formData.due_date,
          net_value: parseFloat(formData.net_value),
          payment_status: formData.payment_status,
          payment_date: formData.payment_date || null,
          paid_value: formData.paid_value ? parseFloat(formData.paid_value) : null,
        },
      ]);

      if (error) {
        console.error('Error adding invoice:', error);
        alert('Erro ao adicionar nota fiscal');
        return;
      }
    }

    resetForm();
    loadInvoices();
  };

  const resetForm = () => {
    setShowAddModal(false);
    setEditingInvoice(null);
    setFormData({
      unit_name: '',
      cnpj_cpf: '',
      exercise_month: new Date().getMonth() + 1,
      exercise_year: new Date().getFullYear(),
      document_type: 'Nota Fiscal',
      invoice_number: '',
      issue_date: new Date().toISOString().split('T')[0],
      due_date: new Date().toISOString().split('T')[0],
      net_value: '',
      payment_status: 'EM ABERTO',
      payment_date: '',
      paid_value: '',
    });
  };

  const handleEdit = (invoice: Invoice) => {
    setEditingInvoice(invoice);
    setFormData({
      unit_name: invoice.unit_name,
      cnpj_cpf: invoice.cnpj_cpf,
      exercise_month: invoice.exercise_month,
      exercise_year: invoice.exercise_year,
      document_type: invoice.document_type,
      invoice_number: invoice.invoice_number,
      issue_date: invoice.issue_date,
      due_date: invoice.due_date,
      net_value: invoice.net_value.toString(),
      payment_status: invoice.payment_status,
      payment_date: invoice.payment_date || '',
      paid_value: invoice.paid_value?.toString() || '',
    });
    setShowAddModal(true);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'PAGO':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'ATRASADO':
        return <AlertCircle className="w-5 h-5 text-red-600" />;
      default:
        return <Clock className="w-5 h-5 text-yellow-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PAGO':
        return 'bg-green-100 text-green-700';
      case 'ATRASADO':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-yellow-100 text-yellow-700';
    }
  };

  const totalPago = invoices
    .filter((inv) => inv.payment_status === 'PAGO')
    .reduce((sum, inv) => sum + Number(inv.paid_value || 0), 0);

  const totalEmAberto = invoices
    .filter((inv) => inv.payment_status === 'EM ABERTO')
    .reduce((sum, inv) => sum + Number(inv.net_value), 0);

  const totalAtrasado = invoices
    .filter((inv) => inv.payment_status === 'ATRASADO')
    .reduce((sum, inv) => sum + Number(inv.net_value), 0);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-slate-800">Controle de Notas Fiscais</h2>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          <span>Nova Nota Fiscal</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center space-x-3">
            <CheckCircle className="w-8 h-8 text-green-600" />
            <div>
              <p className="text-sm text-green-600 font-medium">Total Pago</p>
              <p className="text-xl font-bold text-green-700">R$ {totalPago.toFixed(2)}</p>
            </div>
          </div>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center space-x-3">
            <Clock className="w-8 h-8 text-yellow-600" />
            <div>
              <p className="text-sm text-yellow-600 font-medium">Em Aberto</p>
              <p className="text-xl font-bold text-yellow-700">R$ {totalEmAberto.toFixed(2)}</p>
            </div>
          </div>
        </div>

        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center space-x-3">
            <AlertCircle className="w-8 h-8 text-red-600" />
            <div>
              <p className="text-sm text-red-600 font-medium">Atrasado</p>
              <p className="text-xl font-bold text-red-700">R$ {totalAtrasado.toFixed(2)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Item</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Unidade</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">CNPJ/CPF</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Exercício</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">NF</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Emissão</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Vencimento</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Valor</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {invoices.map((invoice) => (
                <tr key={invoice.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700 font-medium">
                    {invoice.item_number}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">{invoice.unit_name}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700">{invoice.cnpj_cpf}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700">
                    {String(invoice.exercise_month).padStart(2, '0')}/{invoice.exercise_year}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700">{invoice.invoice_number}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700">
                    {new Date(invoice.issue_date).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700">
                    {new Date(invoice.due_date).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700 font-medium">
                    R$ {Number(invoice.net_value).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(invoice.payment_status)}
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(invoice.payment_status)}`}>
                        {invoice.payment_status}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <button
                      onClick={() => handleEdit(invoice)}
                      className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
              {invoices.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-slate-500">
                    Nenhuma nota fiscal cadastrada
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full p-6 my-8">
            <h3 className="text-xl font-bold text-slate-800 mb-4">
              {editingInvoice ? 'Editar Nota Fiscal' : 'Nova Nota Fiscal'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Nome da Unidade</label>
                  <input
                    type="text"
                    value={formData.unit_name}
                    onChange={(e) => setFormData({ ...formData, unit_name: e.target.value })}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">CNPJ/CPF</label>
                  <input
                    type="text"
                    value={formData.cnpj_cpf}
                    onChange={(e) => setFormData({ ...formData, cnpj_cpf: e.target.value })}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Exercício - Mês</label>
                  <input
                    type="number"
                    min="1"
                    max="12"
                    value={formData.exercise_month}
                    onChange={(e) => setFormData({ ...formData, exercise_month: parseInt(e.target.value) })}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Exercício - Ano</label>
                  <input
                    type="number"
                    min="2000"
                    value={formData.exercise_year}
                    onChange={(e) => setFormData({ ...formData, exercise_year: parseInt(e.target.value) })}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Tipo de Documento</label>
                  <input
                    type="text"
                    value={formData.document_type}
                    onChange={(e) => setFormData({ ...formData, document_type: e.target.value })}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Número da NF</label>
                  <input
                    type="text"
                    value={formData.invoice_number}
                    onChange={(e) => setFormData({ ...formData, invoice_number: e.target.value })}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Data de Emissão</label>
                  <input
                    type="date"
                    value={formData.issue_date}
                    onChange={(e) => setFormData({ ...formData, issue_date: e.target.value })}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Data de Vencimento</label>
                  <input
                    type="date"
                    value={formData.due_date}
                    onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Valor Líquido</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.net_value}
                    onChange={(e) => setFormData({ ...formData, net_value: e.target.value })}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Status do Pagamento</label>
                  <select
                    value={formData.payment_status}
                    onChange={(e) => setFormData({ ...formData, payment_status: e.target.value as any })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="EM ABERTO">EM ABERTO</option>
                    <option value="PAGO">PAGO</option>
                    <option value="ATRASADO">ATRASADO</option>
                  </select>
                </div>

                {formData.payment_status === 'PAGO' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Data do Pagamento</label>
                      <input
                        type="date"
                        value={formData.payment_date}
                        onChange={(e) => setFormData({ ...formData, payment_date: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Valor Pago</label>
                      <input
                        type="number"
                        step="0.01"
                        value={formData.paid_value}
                        onChange={(e) => setFormData({ ...formData, paid_value: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </>
                )}
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={resetForm}
                  className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  {editingInvoice ? 'Atualizar' : 'Adicionar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
