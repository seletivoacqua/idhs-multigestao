import { useState } from 'react';
import { X, FileDown, FileSpreadsheet } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';
import logoImg from '../../assets/image.png';

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
  estado?: string;
}

interface ControlePagamentoReportProps {
  onClose: () => void;
}

export function ControlePagamentoReport({ onClose }: ControlePagamentoReportProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [filters, setFilters] = useState({
    startDate: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    invoiceNumber: '',
    unitName: '',
    status: 'all',
    estado: 'all',
  });

  const handleGenerateReport = async () => {
    if (!user) return;
    setLoading(true);

    try {
      let query = supabase
        .from('invoices')
        .select('*')
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .gte('issue_date', filters.startDate)
        .lte('issue_date', filters.endDate)
        .order('item_number', { ascending: false });

      if (filters.invoiceNumber) {
        query = query.ilike('invoice_number', `%${filters.invoiceNumber}%`);
      }

      if (filters.unitName) {
        query = query.ilike('unit_name', `%${filters.unitName}%`);
      }

      if (filters.status !== 'all') {
        query = query.eq('payment_status', filters.status);
      }

      if (filters.estado !== 'all') {
        query = query.eq('estado', filters.estado);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error loading invoices:', error);
        alert('Erro ao gerar relatório');
        return;
      }

      setInvoices(data || []);
    } catch (error) {
      console.error('Error generating report:', error);
      alert('Erro ao gerar relatório');
    } finally {
      setLoading(false);
    }
  };

  const exportToPDF = () => {
    const doc = new jsPDF();

    const pageWidth = doc.internal.pageSize.getWidth();
    const logoWidth = 30;
    const logoHeight = 15;
    const logoX = (pageWidth - logoWidth) / 2;
    doc.addImage(logoImg, 'PNG', logoX, 5, logoWidth, logoHeight);

    doc.setFontSize(18);
    doc.text('Relatório de Controle de Pagamento', pageWidth / 2, 25, { align: 'center' });

    doc.setFontSize(11);
    doc.text(`Período: ${new Date(filters.startDate).toLocaleDateString('pt-BR')} a ${new Date(filters.endDate).toLocaleDateString('pt-BR')}`, pageWidth / 2, 32, { align: 'center' });

    let yPos = 45;
    doc.setFontSize(9);

    doc.text('Item', 14, yPos);
    doc.text('Unidade', 30, yPos);
    doc.text('NF', 70, yPos);
    doc.text('Vencimento', 90, yPos);
    doc.text('Valor', 130, yPos);
    doc.text('Status', 160, yPos);

    yPos += 5;
    doc.line(14, yPos, 200, yPos);
    yPos += 5;

    const totalPago = invoices.filter(inv => inv.payment_status === 'PAGO').reduce((sum, inv) => sum + Number(inv.paid_value || 0), 0);
    const totalEmAberto = invoices.filter(inv => inv.payment_status === 'EM ABERTO').reduce((sum, inv) => sum + Number(inv.net_value), 0);
    const totalAtrasado = invoices.filter(inv => inv.payment_status === 'ATRASADO').reduce((sum, inv) => sum + Number(inv.net_value), 0);

    invoices.forEach((invoice) => {
      if (yPos > 270) {
        doc.addPage();
        yPos = 20;
      }

      doc.text(invoice.item_number.toString(), 14, yPos);
      doc.text(invoice.unit_name.substring(0, 20), 30, yPos);
      doc.text(invoice.invoice_number, 70, yPos);
      doc.text(new Date(invoice.due_date).toLocaleDateString('pt-BR'), 90, yPos);
      doc.text(Number(invoice.net_value).toFixed(2), 130, yPos);
      doc.text(invoice.payment_status, 160, yPos);

      yPos += 7;
    });

    yPos += 5;
    doc.line(14, yPos, 200, yPos);
    yPos += 7;

    doc.setFontSize(12);
    doc.text(`Total Pago: R$ ${totalPago.toFixed(2)}`, 14, yPos);
    yPos += 7;
    doc.text(`Total Em Aberto: R$ ${totalEmAberto.toFixed(2)}`, 14, yPos);
    yPos += 7;
    doc.text(`Total Atrasado: R$ ${totalAtrasado.toFixed(2)}`, 14, yPos);

    doc.save('relatorio-controle-pagamento.pdf');
  };

  const exportToExcel = () => {
    const data = invoices.map((invoice) => ({
      Item: invoice.item_number,
      Unidade: invoice.unit_name,
      'CNPJ/CPF': invoice.cnpj_cpf,
      'Exercício': `${String(invoice.exercise_month).padStart(2, '0')}/${invoice.exercise_year}`,
      'Tipo Documento': invoice.document_type,
      'Número NF': invoice.invoice_number,
      'Data Emissão': new Date(invoice.issue_date).toLocaleDateString('pt-BR'),
      'Data Vencimento': new Date(invoice.due_date).toLocaleDateString('pt-BR'),
      'Valor Líquido (R$)': Number(invoice.net_value).toFixed(2),
      Status: invoice.payment_status,
      'Data Pagamento': invoice.payment_date ? new Date(invoice.payment_date).toLocaleDateString('pt-BR') : '-',
      'Valor Pago (R$)': invoice.paid_value ? Number(invoice.paid_value).toFixed(2) : '-',
    }));

    const totalPago = invoices.filter(inv => inv.payment_status === 'PAGO').reduce((sum, inv) => sum + Number(inv.paid_value || 0), 0);
    const totalEmAberto = invoices.filter(inv => inv.payment_status === 'EM ABERTO').reduce((sum, inv) => sum + Number(inv.net_value), 0);
    const totalAtrasado = invoices.filter(inv => inv.payment_status === 'ATRASADO').reduce((sum, inv) => sum + Number(inv.net_value), 0);

    data.push({
      Item: '' as any,
      Unidade: '',
      'CNPJ/CPF': '',
      'Exercício': '',
      'Tipo Documento': '',
      'Número NF': '',
      'Data Emissão': '',
      'Data Vencimento': '',
      'Valor Líquido (R$)': '',
      Status: '',
      'Data Pagamento': 'Total Pago:',
      'Valor Pago (R$)': totalPago.toFixed(2),
    });

    data.push({
      Item: '' as any,
      Unidade: '',
      'CNPJ/CPF': '',
      'Exercício': '',
      'Tipo Documento': '',
      'Número NF': '',
      'Data Emissão': '',
      'Data Vencimento': '',
      'Valor Líquido (R$)': '',
      Status: '',
      'Data Pagamento': 'Total Em Aberto:',
      'Valor Pago (R$)': totalEmAberto.toFixed(2),
    });

    data.push({
      Item: '' as any,
      Unidade: '',
      'CNPJ/CPF': '',
      'Exercício': '',
      'Tipo Documento': '',
      'Número NF': '',
      'Data Emissão': '',
      'Data Vencimento': '',
      'Valor Líquido (R$)': '',
      Status: '',
      'Data Pagamento': 'Total Atrasado:',
      'Valor Pago (R$)': totalAtrasado.toFixed(2),
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Controle de Pagamento');
    XLSX.writeFile(workbook, 'relatorio-controle-pagamento.xlsx');
  };

  const totalPago = invoices.filter(inv => inv.payment_status === 'PAGO').reduce((sum, inv) => sum + Number(inv.paid_value || 0), 0);
  const totalEmAberto = invoices.filter(inv => inv.payment_status === 'EM ABERTO').reduce((sum, inv) => sum + Number(inv.net_value), 0);
  const totalAtrasado = invoices.filter(inv => inv.payment_status === 'ATRASADO').reduce((sum, inv) => sum + Number(inv.net_value), 0);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl max-w-6xl w-full p-6 my-8 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-slate-800">Relatório de Controle de Pagamento</h3>
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
              <label className="block text-sm font-medium text-slate-700 mb-2">Número da NF</label>
              <input
                type="text"
                placeholder="Buscar por NF"
                value={filters.invoiceNumber}
                onChange={(e) => setFilters({ ...filters, invoiceNumber: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Unidade</label>
              <input
                type="text"
                placeholder="Buscar por unidade"
                value={filters.unitName}
                onChange={(e) => setFilters({ ...filters, unitName: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Status</label>
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">Todos</option>
                <option value="PAGO">PAGO</option>
                <option value="EM ABERTO">EM ABERTO</option>
                <option value="ATRASADO">ATRASADO</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Estado</label>
              <select
                value={filters.estado}
                onChange={(e) => setFilters({ ...filters, estado: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">Todos</option>
                <option value="MA">MA</option>
                <option value="PA">PA</option>
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

        {invoices.length > 0 && (
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
                <p className="text-sm text-green-600 font-medium">Total Pago</p>
                <p className="text-2xl font-bold text-green-700">R$ {totalPago.toFixed(2)}</p>
              </div>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-sm text-yellow-600 font-medium">Total Em Aberto</p>
                <p className="text-2xl font-bold text-yellow-700">R$ {totalEmAberto.toFixed(2)}</p>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-600 font-medium">Total Atrasado</p>
                <p className="text-2xl font-bold text-red-700">R$ {totalAtrasado.toFixed(2)}</p>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Item</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Unidade</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">NF</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Exercício</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Emissão</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Vencimento</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Valor</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {invoices.map((invoice) => (
                      <tr key={invoice.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700 font-medium">
                          {invoice.item_number}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700">{invoice.unit_name}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700">{invoice.invoice_number}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700">
                          {String(invoice.exercise_month).padStart(2, '0')}/{invoice.exercise_year}
                        </td>
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
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            invoice.payment_status === 'PAGO'
                              ? 'bg-green-100 text-green-700'
                              : invoice.payment_status === 'ATRASADO'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-yellow-100 text-yellow-700'
                          }`}>
                            {invoice.payment_status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {invoices.length === 0 && !loading && (
          <div className="text-center py-12 text-slate-500">
            Clique em "Gerar Relatório" para visualizar os dados
          </div>
        )}
      </div>
    </div>
  );
}
