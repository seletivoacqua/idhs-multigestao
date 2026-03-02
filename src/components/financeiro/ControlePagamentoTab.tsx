import { useState, useEffect } from 'react';
import { Plus, AlertCircle, CheckCircle, Clock, Upload, Eye, FileText, Trash2, Edit } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { ControlePagamentoReport } from './ControlePagamentoReport';

interface Unit {
  id: string;
  name: string;
  municipality: string;
}

interface Invoice {
  id: string;
  item_number: number;
  unit_id?: string;
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
  document_url?: string;
  document_name?: string;
  document_type_file?: string;
  estado?: string;
  created_at: string;
  units?: Unit;
}

export function ControlePagamentoTab() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'PAGO' | 'EM ABERTO' | 'ATRASADO'>('all');
  const [editingPaymentDate, setEditingPaymentDate] = useState<string | null>(null);
  const [tempPaymentDate, setTempPaymentDate] = useState<string>('');
  const { user } = useAuth();

  // Função utilitária para formatar datas sem problemas de fuso horário
  const formatDate = (dateString: string | undefined | null): string => {
    if (!dateString) return '-';
    
    // Divide a string YYYY-MM-DD em partes e cria a data no horário local (meio-dia)
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day, 12, 0, 0);
    
    return date.toLocaleDateString('pt-BR');
  };

  // Função para criar data no formato ISO sem perder o dia por causa do fuso
  const createISODate = (dateString: string): string => {
    if (!dateString) return '';
    
    // Mantém a data no formato YYYY-MM-DD sem conversão de fuso
    const [year, month, day] = dateString.split('-').map(Number);
    // Cria a data no UTC meio-dia para garantir que ao salvar no banco não perca o dia
    const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    return date.toISOString();
  };

  const [formData, setFormData] = useState({
    unit_id: '',
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
    estado: 'MA',
  });

  useEffect(() => {
    loadInvoices();
    loadUnits();
    updateOverdueInvoices();
  }, []);

  const updateOverdueInvoices = async () => {
    if (!user) return;

    // Criar data atual no início do dia no horário local
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data: overdueInvoices } = await supabase
      .from('invoices')
      .select('*')
      .eq('user_id', user.id)
      .eq('payment_status', 'EM ABERTO')
      .is('deleted_at', null);

    if (overdueInvoices) {
      for (const invoice of overdueInvoices) {
        // Criar data de vencimento usando o mesmo método para evitar problemas de fuso
        const [year, month, day] = invoice.due_date.split('-').map(Number);
        const dueDate = new Date(year, month - 1, day, 0, 0, 0);

        const oneDayAfterDue = new Date(dueDate);
        oneDayAfterDue.setDate(oneDayAfterDue.getDate() + 1);

        if (today >= oneDayAfterDue) {
          await supabase
            .from('invoices')
            .update({ payment_status: 'ATRASADO' })
            .eq('id', invoice.id);
        }
      }
      loadInvoices();
    }
  };

  const loadUnits = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('units')
      .select('*')
      .eq('user_id', user.id)
      .order('name', { ascending: true });

    if (error) {
      console.error('Error loading units:', error);
      return;
    }

    setUnits(data || []);
  };

  const loadInvoices = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('invoices')
      .select('*, units(id, name, municipality)')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .order('item_number', { ascending: true });

    if (error) {
      console.error('Error loading invoices:', error);
      return;
    }

    setInvoices(data || []);
  };

  const uploadDocument = async (invoiceId: string): Promise<string | null> => {
    if (!selectedFile || !user) return null;

    setUploadingFile(true);

    try {
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${invoiceId}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('invoice-documents')
        .upload(filePath, selectedFile, { upsert: true });

      if (uploadError) {
        console.error('Error uploading file:', uploadError);
        alert('Erro ao fazer upload do documento');
        return null;
      }

      const { data: urlData } = supabase.storage
        .from('invoice-documents')
        .getPublicUrl(filePath);

      return urlData.publicUrl;
    } catch (error) {
      console.error('Error uploading document:', error);
      alert('Erro ao fazer upload do documento');
      return null;
    } finally {
      setUploadingFile(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    let invoiceId = editingInvoice?.id;

    const selectedUnit = units.find(u => u.id === formData.unit_id);
    const unitName = selectedUnit ? selectedUnit.name : formData.unit_name;

    const issueDateISO = createISODate(formData.issue_date);
    const dueDateISO = createISODate(formData.due_date);
    const paymentDateISO = formData.payment_date ? createISODate(formData.payment_date) : null;

    if (editingInvoice) {
      const { error } = await supabase
        .from('invoices')
        .update({
          unit_id: formData.unit_id || null,
          unit_name: unitName,
          cnpj_cpf: formData.cnpj_cpf,
          exercise_month: formData.exercise_month,
          exercise_year: formData.exercise_year,
          document_type: formData.document_type,
          invoice_number: formData.invoice_number,
          issue_date: issueDateISO,
          due_date: dueDateISO,
          net_value: parseFloat(formData.net_value),
          payment_status: formData.payment_status,
          payment_date: paymentDateISO,
          paid_value: formData.paid_value ? parseFloat(formData.paid_value) : null,
          estado: formData.estado,
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

      const { data: newInvoice, error } = await supabase.from('invoices').insert([
        {
          user_id: user.id,
          item_number: itemNumberData || 1,
          unit_id: formData.unit_id || null,
          unit_name: unitName,
          cnpj_cpf: formData.cnpj_cpf,
          exercise_month: formData.exercise_month,
          exercise_year: formData.exercise_year,
          document_type: formData.document_type,
          invoice_number: formData.invoice_number,
          issue_date: issueDateISO,
          due_date: dueDateISO,
          net_value: parseFloat(formData.net_value),
          payment_status: formData.payment_status,
          payment_date: paymentDateISO,
          paid_value: formData.paid_value ? parseFloat(formData.paid_value) : null,
          estado: formData.estado,
        },
      ]).select();

      if (error) {
        console.error('Error adding invoice:', error);
        alert('Erro ao adicionar nota fiscal');
        return;
      }

      if (newInvoice && newInvoice.length > 0) {
        invoiceId = newInvoice[0].id;
      }
    }

    if (selectedFile && invoiceId) {
      const documentUrl = await uploadDocument(invoiceId);

      if (documentUrl) {
        await supabase
          .from('invoices')
          .update({
            document_url: documentUrl,
            document_name: selectedFile.name,
            document_type: selectedFile.type,
          })
          .eq('id', invoiceId);
      }
    }

    resetForm();
    loadInvoices();
  };

  const resetForm = () => {
    setShowAddModal(false);
    setEditingInvoice(null);
    setSelectedFile(null);
    setFormData({
      unit_id: '',
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
      estado: 'MA',
    });
  };

  const handleEdit = (invoice: Invoice) => {
    setEditingInvoice(invoice);
    setFormData({
      unit_id: invoice.unit_id || '',
      unit_name: invoice.unit_name,
      cnpj_cpf: invoice.cnpj_cpf,
      exercise_month: invoice.exercise_month,
      exercise_year: invoice.exercise_year,
      document_type: invoice.document_type,
      invoice_number: invoice.invoice_number,
      issue_date: invoice.issue_date.split('T')[0],
      due_date: invoice.due_date.split('T')[0],
      net_value: invoice.net_value.toString(),
      payment_status: invoice.payment_status,
      payment_date: invoice.payment_date?.split('T')[0] || '',
      paid_value: invoice.paid_value?.toString() || '',
      estado: invoice.estado || 'MA',
    });
    setShowAddModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta nota fiscal?')) return;

    const { error } = await supabase
      .from('invoices')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.error('Error deleting invoice:', error);
      alert('Erro ao excluir nota fiscal');
      return;
    }

    loadInvoices();
  };

  const viewDocument = (documentUrl: string) => {
    window.open(documentUrl, '_blank');
  };

  const handleEditPaymentDate = (invoice: Invoice) => {
    setEditingPaymentDate(invoice.id);
    setTempPaymentDate(invoice.payment_date?.split('T')[0] || '');
  };

  const handleSavePaymentDate = async (invoiceId: string) => {
    if (!tempPaymentDate) {
      alert('Por favor, selecione uma data de pagamento');
      return;
    }

    const paymentDateISO = createISODate(tempPaymentDate);

    const { error } = await supabase
      .from('invoices')
      .update({
        payment_date: paymentDateISO,
        updated_at: new Date().toISOString(),
      })
      .eq('id', invoiceId);

    if (error) {
      console.error('Error updating payment date:', error);
      alert('Erro ao atualizar data de pagamento');
      return;
    }

    setEditingPaymentDate(null);
    setTempPaymentDate('');
    loadInvoices();
  };

  const handleCancelEditPaymentDate = () => {
    setEditingPaymentDate(null);
    setTempPaymentDate('');
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

  const filteredInvoices = invoices.filter((inv) => {
    if (statusFilter === 'all') return true;
    return inv.payment_status === statusFilter;
  });

  return (
    <div className="space-y-6 max-w-full">
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-4">
          <h2 className="text-xl font-semibold text-slate-800">Controle de Notas Fiscais</h2>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">Todos os Status</option>
            <option value="PAGO">Pago</option>
            <option value="EM ABERTO">Em Aberto</option>
            <option value="ATRASADO">Atrasado</option>
          </select>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowReportModal(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <FileText className="w-5 h-5" />
            <span>Relatório</span>
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
            <span>Nova Nota Fiscal</span>
          </button>
        </div>
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

<div className="bg-white border border-slate-200 rounded-lg overflow-hidden w-full">        
  <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Item</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Unidade</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Estado</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">CNPJ/CPF</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Exercício</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">NF</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Emissão</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Vencimento</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Data Pgto</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Valor</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Documento</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredInvoices.map((invoice) => (
                <tr key={invoice.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700 font-medium">
                    {invoice.item_number}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">{invoice.units?.name || invoice.unit_name}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700">{invoice.estado || '-'}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700">{invoice.cnpj_cpf}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700">
                    {String(invoice.exercise_month).padStart(2, '0')}/{invoice.exercise_year}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700">{invoice.invoice_number}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700">
                    {formatDate(invoice.issue_date)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700">
                    {formatDate(invoice.due_date)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700">
                    {editingPaymentDate === invoice.id ? (
                      <div className="flex items-center space-x-2">
                        <input
                          type="date"
                          value={tempPaymentDate}
                          onChange={(e) => setTempPaymentDate(e.target.value)}
                          className="px-2 py-1 border border-slate-300 rounded text-sm"
                        />
                        <button
                          onClick={() => handleSavePaymentDate(invoice.id)}
                          className="text-green-600 hover:text-green-800 text-xs font-medium"
                        >
                          Salvar
                        </button>
                        <button
                          onClick={handleCancelEditPaymentDate}
                          className="text-red-600 hover:text-red-800 text-xs font-medium"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-2">
                        <span>{formatDate(invoice.payment_date)}</span>
                        {invoice.payment_status === 'PAGO' && (
                          <button
                            onClick={() => handleEditPaymentDate(invoice)}
                            className="text-blue-600 hover:text-blue-800"
                            title="Editar data de pagamento"
                          >
                            <Edit className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    )}
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
                    {invoice.document_url ? (
                      <button
                        onClick={() => viewDocument(invoice.document_url!)}
                        className="flex items-center space-x-1 text-blue-600 hover:text-blue-800 text-sm font-medium"
                      >
                        <Eye className="w-4 h-4" />
                        <span>Ver</span>
                      </button>
                    ) : (
                      <span className="text-slate-400 text-sm">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center space-x-3">
                      <button
                        onClick={() => handleEdit(invoice)}
                        className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleDelete(invoice.id)}
                        className="text-red-600 hover:text-red-800"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredInvoices.length === 0 && (
                <tr>
                  <td colSpan={13} className="px-4 py-8 text-center text-slate-500">
                    Nenhuma nota fiscal encontrada
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
                  <label className="block text-sm font-medium text-slate-700 mb-2">Unidade</label>
                  <select
                    value={formData.unit_id}
                    onChange={(e) => setFormData({ ...formData, unit_id: e.target.value })}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Selecione uma unidade</option>
                    {units.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.name} - {unit.municipality}
                      </option>
                    ))}
                  </select>
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
                  <label className="block text-sm font-medium text-slate-700 mb-2">Estado</label>
                  <select
                    value={formData.estado}
                    onChange={(e) => setFormData({ ...formData, estado: e.target.value })}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="MA">MA</option>
                    <option value="PA">PA</option>
                  </select>
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

              <div className="pt-4">
                <label className="block text-sm font-medium text-slate-700 mb-2">Anexar Documento</label>
                <div className="flex items-center space-x-3">
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                  {selectedFile && (
                    <span className="text-sm text-green-600 flex items-center space-x-1">
                      <Upload className="w-4 h-4" />
                      <span>{selectedFile.name}</span>
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-500">Formatos aceitos: Imagens (JPG, PNG) e PDF</p>
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

      {showReportModal && (
        <ControlePagamentoReport onClose={() => setShowReportModal(false)} />
      )}
    </div>
  );
}
