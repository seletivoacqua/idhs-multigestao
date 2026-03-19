import { useState, useEffect, useMemo, useCallback } from 'react';
import { X, FileDown, FileSpreadsheet, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';
import logoImg from '../../assets/image.png';
import { formatCurrencyBR } from '../../utils/currencyUtils';

interface Invoice {
  id: string;
  user_id: string;
  unit_id?: string;
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
  payment_status: 'PAGO' | 'EM ABERTO' | 'ATRASADO' | 'AGENDADO';
  payment_date?: string;
  paid_value?: number;
  data_prevista?: string;
  estado?: string;
  document_url?: string;
  document_name?: string;
  deletion_reason?: string;
  deleted_at?: string;
  created_at?: string;
  updated_at?: string;
}

type DateFilterType = 'issue' | 'due' | 'payment';

interface Filters {
  startDate: string;
  endDate: string;
  dateFilterType: DateFilterType;
  invoiceNumber: string;
  unitName: string;
  status: 'all' | 'PAGO' | 'EM ABERTO' | 'AGENDADO' | 'ATRASADO';
  estado: 'all' | 'MA' | 'PA';
}

interface ControlePagamentoReportProps {
  onClose: () => void;
}

type ExportType = 'none' | 'pdf' | 'excel';

export function ControlePagamentoReport({ onClose }: ControlePagamentoReportProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [exporting, setExporting] = useState<ExportType>('none');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  const [filters, setFilters] = useState<Filters>({
    startDate: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    dateFilterType: 'issue', // Padrão: data de emissão
    invoiceNumber: '',
    unitName: '',
    status: 'all',
    estado: 'all',
  });

  // Função para formatar data de exibição
  const formatDisplayDate = useCallback((dateString?: string): string => {
    if (!dateString) return '-';
    try {
      const datePart = dateString.split('T')[0];
      const [year, month, day] = datePart.split('-');
      return `${day}/${month}/${year}`;
    } catch {
      return dateString;
    }
  }, []);

  // Função para obter data com horário para query
  const getDateForQuery = useCallback((date: string, isEnd: boolean): string => {
    return isEnd ? `${date}T23:59:59` : `${date}T00:00:00`;
  }, []);

  // Validação de datas
  const validateDates = useCallback((): boolean => {
    if (filters.startDate > filters.endDate) {
      setError('Data inicial não pode ser maior que data final');
      return false;
    }
    return true;
  }, [filters.startDate, filters.endDate]);

  // Reset de filtros
  const resetFilters = useCallback(() => {
    setFilters({
      startDate: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0],
      dateFilterType: 'issue',
      invoiceNumber: '',
      unitName: '',
      status: 'all',
      estado: 'all',
    });
    setError(null);
  }, []);

  // Geração do relatório
  const handleGenerateReport = useCallback(async () => {
    if (!user) {
      setError('Usuário não autenticado');
      return;
    }

    if (!validateDates()) return;

    setLoading(true);
    setError(null);

    try {
      let query = supabase
        .from('invoices')
        .select('*')
        .eq('user_id', user.id)
        .is('deleted_at', null);

      // Aplicar filtro de data baseado no tipo selecionado
      const startDateTime = getDateForQuery(filters.startDate, false);
      const endDateTime = getDateForQuery(filters.endDate, true);

      switch (filters.dateFilterType) {
        case 'issue':
          query = query
            .gte('issue_date', startDateTime)
            .lte('issue_date', endDateTime);
          break;
        case 'due':
          query = query
            .gte('due_date', startDateTime)
            .lte('due_date', endDateTime);
          break;
        case 'payment':
          query = query
            .not('payment_date', 'is', null)
            .gte('payment_date', startDateTime)
            .lte('payment_date', endDateTime);
          break;
      }

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

      query = query.order('item_number', { ascending: false });

      const { data, error: queryError } = await query;

      if (queryError) {
        console.error('Error loading invoices:', queryError);
        setError('Erro ao carregar notas fiscais');
        return;
      }

      // Processar dados para garantir tipos numéricos
      const processedData = data?.map(invoice => ({
        ...invoice,
        net_value: Number(invoice.net_value),
        paid_value: invoice.paid_value ? Number(invoice.paid_value) : undefined,
      })) || [];

      setInvoices(processedData);
    } catch (error) {
      console.error('Error generating report:', error);
      setError('Erro ao gerar relatório');
    } finally {
      setLoading(false);
    }
  }, [user, filters, validateDates, getDateForQuery]);

  // Carregar relatório inicial
  useEffect(() => {
    if (user) {
      handleGenerateReport().finally(() => setInitialLoading(false));
    }
  }, [user, handleGenerateReport]);

  // Cálculos com useMemo
  const totals = useMemo(() => {
    const pago = invoices
      .filter(inv => inv.payment_status === 'PAGO')
      .reduce((sum, inv) => sum + (inv.paid_value || inv.net_value), 0);
    
    const emAberto = invoices
      .filter(inv => inv.payment_status === 'EM ABERTO')
      .reduce((sum, inv) => sum + inv.net_value, 0);
    
    const agendado = invoices
      .filter(inv => inv.payment_status === 'AGENDADO')
      .reduce((sum, inv) => sum + inv.net_value, 0);
    
    const atrasado = invoices
      .filter(inv => inv.payment_status === 'ATRASADO')
      .reduce((sum, inv) => sum + inv.net_value, 0);

    const totalGeral = pago + emAberto + agendado + atrasado;

    return { pago, emAberto, agendado, atrasado, totalGeral };
  }, [invoices]);

  // Estatísticas adicionais
  const statistics = useMemo(() => {
    const byEstado = invoices.reduce((acc, inv) => {
      const estado = inv.estado || 'N/I';
      if (!acc[estado]) {
        acc[estado] = {
          total: 0,
          pago: 0,
          emAberto: 0,
        };
      }
      acc[estado].total += inv.net_value;
      if (inv.payment_status === 'PAGO') {
        acc[estado].pago += inv.paid_value || inv.net_value;
      } else {
        acc[estado].emAberto += inv.net_value;
      }
      return acc;
    }, {} as Record<string, { total: number; pago: number; emAberto: number; }>);

    return { byEstado };
  }, [invoices]);

  // Validação de dados para exportação
  const validateExportData = useCallback((): boolean => {
    if (invoices.length === 0) {
      alert('Não há dados para exportar');
      return false;
    }
    return true;
  }, [invoices]);

  // Exportação para PDF
  const exportToPDF = useCallback(() => {
    if (!validateExportData()) return;
    
    setExporting('pdf');
    
    try {
      const doc = new jsPDF({ orientation: 'landscape' });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 14;

      // Logo
      try {
        const logoWidth = 30;
        const logoHeight = 15;
        const logoX = (pageWidth - logoWidth) / 2;
        doc.addImage(logoImg, 'PNG', logoX, 5, logoWidth, logoHeight);
      } catch (imgError) {
        console.warn('Error adding logo to PDF:', imgError);
      }

      // Título
      doc.setFontSize(18);
      doc.text('Relatório de Controle de Pagamento', pageWidth / 2, 25, { align: 'center' });

      // Período e tipo de filtro
      doc.setFontSize(10);
      const tipoDataTexto = {
        issue: 'Data de Emissão',
        due: 'Data de Vencimento',
        payment: 'Data de Pagamento'
      }[filters.dateFilterType];
      
      doc.text(
        `${tipoDataTexto}: ${formatDisplayDate(filters.startDate)} a ${formatDisplayDate(filters.endDate)}`,
        pageWidth / 2,
        32,
        { align: 'center' }
      );

      // Filtros aplicados
      const filtrosAplicados = [];
      if (filters.status !== 'all') filtrosAplicados.push(`Status: ${filters.status}`);
      if (filters.estado !== 'all') filtrosAplicados.push(`Estado: ${filters.estado}`);
      if (filters.unitName) filtrosAplicados.push(`Unidade: ${filters.unitName}`);
      if (filters.invoiceNumber) filtrosAplicados.push(`NF: ${filters.invoiceNumber}`);

      if (filtrosAplicados.length > 0) {
        doc.setFontSize(8);
        doc.text(`Filtros: ${filtrosAplicados.join(' | ')}`, pageWidth / 2, 38, { align: 'center' });
      }

      // Cabeçalho da tabela
      let yPos = 45;
      doc.setFontSize(8);
      doc.setFont(undefined, 'bold');

      const colPositions = {
        item: margin,
        unidade: margin + 15,
        nf: margin + 70,
        emissao: margin + 110,
        vencimento: margin + 140,
        valor: margin + 170,
        status: margin + 200,
      };

      doc.text('Item', colPositions.item, yPos);
      doc.text('Unidade', colPositions.unidade, yPos);
      doc.text('NF', colPositions.nf, yPos);
      doc.text('Emissão', colPositions.emissao, yPos);
      doc.text('Vencimento', colPositions.vencimento, yPos);
      doc.text('Valor', colPositions.valor, yPos);
      doc.text('Status', colPositions.status, yPos);

      yPos += 3;
      doc.line(margin, yPos, pageWidth - margin, yPos);
      yPos += 4;
      
      doc.setFont(undefined, 'normal');

      // Dados
      invoices.forEach((invoice) => {
        if (yPos > pageHeight - 25) {
          doc.addPage('landscape');
          yPos = 25;
          
          // Recriar cabeçalho
          doc.setFontSize(8);
          doc.setFont(undefined, 'bold');
          doc.text('Item', colPositions.item, yPos);
          doc.text('Unidade', colPositions.unidade, yPos);
          doc.text('NF', colPositions.nf, yPos);
          doc.text('Emissão', colPositions.emissao, yPos);
          doc.text('Vencimento', colPositions.vencimento, yPos);
          doc.text('Valor', colPositions.valor, yPos);
          doc.text('Status', colPositions.status, yPos);
          yPos += 3;
          doc.line(margin, yPos, pageWidth - margin, yPos);
          yPos += 4;
          doc.setFont(undefined, 'normal');
        }

        doc.text(invoice.item_number.toString(), colPositions.item, yPos);
        
        const unidade = invoice.unit_name.length > 20 
          ? invoice.unit_name.substring(0, 17) + '...' 
          : invoice.unit_name;
        doc.text(unidade, colPositions.unidade, yPos);
        
        doc.text(invoice.invoice_number, colPositions.nf, yPos);
        doc.text(formatDisplayDate(invoice.issue_date), colPositions.emissao, yPos);
        doc.text(formatDisplayDate(invoice.due_date), colPositions.vencimento, yPos);
        doc.text(formatCurrencyBR(invoice.net_value), colPositions.valor, yPos);
        doc.text(invoice.payment_status, colPositions.status, yPos);

        yPos += 6;
      });

      // Totais
      yPos += 5;
      doc.line(margin, yPos, pageWidth - margin, yPos);
      yPos += 7;

      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.text(`Total Pago: ${formatCurrencyBR(totals.pago)}`, margin, yPos);
      yPos += 5;
      doc.text(`Total Em Aberto: ${formatCurrencyBR(totals.emAberto)}`, margin, yPos);
      yPos += 5;
      doc.text(`Total Agendado: ${formatCurrencyBR(totals.agendado)}`, margin, yPos);
      yPos += 5;
      doc.text(`Total Atrasado: ${formatCurrencyBR(totals.atrasado)}`, margin, yPos);
      yPos += 5;
      doc.text(`Total Geral: ${formatCurrencyBR(totals.totalGeral)}`, margin, yPos);

      doc.save(`relatorio-controle-pagamento-${filters.startDate}-a-${filters.endDate}.pdf`);
    } catch (error) {
      console.error('Error exporting to PDF:', error);
      alert('Erro ao exportar para PDF');
    } finally {
      setExporting('none');
    }
  }, [invoices, totals, filters, formatDisplayDate, validateExportData]);

  // Exportação para Excel
  const exportToExcel = useCallback(() => {
    if (!validateExportData()) return;
    
    setExporting('excel');
    
    try {
      // Dados detalhados
      const data = invoices.map((invoice) => ({
        Item: invoice.item_number,
        Unidade: invoice.unit_name,
        'CNPJ/CPF': invoice.cnpj_cpf,
        'Exercício': `${String(invoice.exercise_month).padStart(2, '0')}/${invoice.exercise_year}`,
        'Tipo Documento': invoice.document_type,
        'Número NF': invoice.invoice_number,
        'Data Emissão': formatDisplayDate(invoice.issue_date),
        'Data Vencimento': formatDisplayDate(invoice.due_date),
        'Data Pagamento': formatDisplayDate(invoice.payment_date),
        'Valor Líquido': invoice.net_value,
        'Valor Pago': invoice.paid_value || 0,
        Status: invoice.payment_status,
        Estado: invoice.estado || '-',
      }));

      // Aba de Resumo
      const summaryData = [
        ['RELATÓRIO DE CONTROLE DE PAGAMENTO'],
        [`Período (${filters.dateFilterType === 'issue' ? 'Emissão' : filters.dateFilterType === 'due' ? 'Vencimento' : 'Pagamento'}): ${formatDisplayDate(filters.startDate)} a ${formatDisplayDate(filters.endDate)}`],
        [''],
        ['RESUMO POR STATUS'],
        ['Status', 'Valor', 'Quantidade'],
        ['PAGO', totals.pago, invoices.filter(i => i.payment_status === 'PAGO').length],
        ['EM ABERTO', totals.emAberto, invoices.filter(i => i.payment_status === 'EM ABERTO').length],
        ['AGENDADO', totals.agendado, invoices.filter(i => i.payment_status === 'AGENDADO').length],
        ['ATRASADO', totals.atrasado, invoices.filter(i => i.payment_status === 'ATRASADO').length],
        ['TOTAL GERAL', totals.totalGeral, invoices.length],
        [''],
        ['RESUMO POR ESTADO'],
        ['Estado', 'Total', 'Pago', 'Em Aberto'],
        ...Object.entries(statistics.byEstado).map(([estado, values]) => [
          estado,
          formatCurrencyBR(values.total),
          formatCurrencyBR(values.pago),
          formatCurrencyBR(values.emAberto),
        ]),
      ];

      const workbook = XLSX.utils.book_new();

      // Aba Resumo
      const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
      summarySheet['!cols'] = [
        { wch: 20 },
        { wch: 20 },
        { wch: 15 },
      ];
      XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumo');

      // Aba Detalhada
      const detailSheet = XLSX.utils.json_to_sheet(data);
      detailSheet['!cols'] = [
        { wch: 8 },  // Item
        { wch: 25 }, // Unidade
        { wch: 18 }, // CNPJ/CPF
        { wch: 10 }, // Exercício
        { wch: 15 }, // Tipo Documento
        { wch: 15 }, // Número NF
        { wch: 12 }, // Data Emissão
        { wch: 12 }, // Data Vencimento
        { wch: 12 }, // Data Pagamento
        { wch: 15 }, // Valor Líquido
        { wch: 15 }, // Valor Pago
        { wch: 12 }, // Status
        { wch: 8 },  // Estado
      ];
      XLSX.utils.book_append_sheet(workbook, detailSheet, 'Detalhado');

      XLSX.writeFile(workbook, `relatorio-controle-pagamento-${filters.startDate}-a-${filters.endDate}.xlsx`);
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      alert('Erro ao exportar para Excel');
    } finally {
      setExporting('none');
    }
  }, [invoices, totals, statistics, filters, formatDisplayDate, validateExportData]);

  if (initialLoading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl shadow-xl p-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-slate-600">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl max-w-7xl w-full p-6 my-8 max-h-[90vh] overflow-y-auto">
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
          <div className="flex justify-between items-center">
            <h4 className="font-medium text-slate-700">Filtros</h4>
            <button
              onClick={resetFilters}
              className="text-sm text-blue-600 hover:text-blue-800 transition-colors"
            >
              Limpar Filtros
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Filtrar por Data
              </label>
              <select
                value={filters.dateFilterType}
                onChange={(e) => setFilters({ 
                  ...filters, 
                  dateFilterType: e.target.value as DateFilterType 
                })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="issue">Data de Emissão</option>
                <option value="due">Data de Vencimento</option>
                <option value="payment">Data de Pagamento</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Data Inicial
              </label>
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => {
                  setFilters({ ...filters, startDate: e.target.value });
                  setError(null);
                }}
                max={filters.endDate}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Data Final
              </label>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => {
                  setFilters({ ...filters, endDate: e.target.value });
                  setError(null);
                }}
                min={filters.startDate}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Número da NF
              </label>
              <input
                type="text"
                placeholder="Buscar por NF"
                value={filters.invoiceNumber}
                onChange={(e) => setFilters({ ...filters, invoiceNumber: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Unidade
              </label>
              <input
                type="text"
                placeholder="Buscar por unidade"
                value={filters.unitName}
                onChange={(e) => setFilters({ ...filters, unitName: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Status
              </label>
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value as Filters['status'] })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">Todos</option>
                <option value="PAGO">PAGO</option>
                <option value="EM ABERTO">EM ABERTO</option>
                <option value="AGENDADO">AGENDADO</option>
                <option value="ATRASADO">ATRASADO</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Estado
              </label>
              <select
                value={filters.estado}
                onChange={(e) => setFilters({ ...filters, estado: e.target.value as Filters['estado'] })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">Todos</option>
                <option value="MA">MA</option>
                <option value="PA">PA</option>
              </select>
            </div>
          </div>

          {/* Mensagem de erro */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center space-x-2">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <button
            onClick={handleGenerateReport}
            disabled={loading}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-slate-300"
          >
            {loading ? (
              <span className="flex items-center justify-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                <span>Gerando...</span>
              </span>
            ) : (
              'Gerar Relatório'
            )}
          </button>
        </div>

        {invoices.length > 0 && (
          <>
            <div className="mb-4 flex space-x-3">
              <button
                onClick={exportToPDF}
                disabled={exporting !== 'none'}
                className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:bg-red-300"
              >
                {exporting === 'pdf' ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Exportando PDF...</span>
                  </>
                ) : (
                  <>
                    <FileDown className="w-5 h-5" />
                    <span>Exportar PDF</span>
                  </>
                )}
              </button>
              <button
                onClick={exportToExcel}
                disabled={exporting !== 'none'}
                className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:bg-green-300"
              >
                {exporting === 'excel' ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Exportando Excel...</span>
                  </>
                ) : (
                  <>
                    <FileSpreadsheet className="w-5 h-5" />
                    <span>Exportar Excel</span>
                  </>
                )}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-sm text-green-600 font-medium">Total Pago</p>
                <p className="text-2xl font-bold text-green-700">{formatCurrencyBR(totals.pago)}</p>
                <p className="text-xs text-green-600 mt-1">
                  {invoices.filter(i => i.payment_status === 'PAGO').length} notas
                </p>
              </div>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-sm text-yellow-600 font-medium">Total Em Aberto</p>
                <p className="text-2xl font-bold text-yellow-700">{formatCurrencyBR(totals.emAberto)}</p>
                <p className="text-xs text-yellow-600 mt-1">
                  {invoices.filter(i => i.payment_status === 'EM ABERTO').length} notas
                </p>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-600 font-medium">Total Agendado</p>
                <p className="text-2xl font-bold text-blue-700">{formatCurrencyBR(totals.agendado)}</p>
                <p className="text-xs text-blue-600 mt-1">
                  {invoices.filter(i => i.payment_status === 'AGENDADO').length} notas
                </p>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-600 font-medium">Total Atrasado</p>
                <p className="text-2xl font-bold text-red-700">{formatCurrencyBR(totals.atrasado)}</p>
                <p className="text-xs text-red-600 mt-1">
                  {invoices.filter(i => i.payment_status === 'ATRASADO').length} notas
                </p>
              </div>
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <p className="text-sm text-purple-600 font-medium">Total Geral</p>
                <p className="text-2xl font-bold text-purple-700">{formatCurrencyBR(totals.totalGeral)}</p>
                <p className="text-xs text-purple-600 mt-1">
                  {invoices.length} notas
                </p>
              </div>
            </div>

            {/* Tabela de notas */}
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="overflow-x-auto max-h-96">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Item</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Unidade</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">NF</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Exercício</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Emissão</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Vencimento</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Pagamento</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-slate-600 uppercase">Valor</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {invoices.map((invoice) => (
                      <tr key={invoice.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700 font-medium">
                          {invoice.item_number}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700 max-w-xs truncate" title={invoice.unit_name}>
                          {invoice.unit_name}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700">
                          {invoice.invoice_number}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700">
                          {String(invoice.exercise_month).padStart(2, '0')}/{invoice.exercise_year}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700">
                          {formatDisplayDate(invoice.issue_date)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700">
                          {formatDisplayDate(invoice.due_date)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700">
                          {formatDisplayDate(invoice.payment_date)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-medium">
                          {formatCurrencyBR(invoice.net_value)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            invoice.payment_status === 'PAGO'
                              ? 'bg-green-100 text-green-700'
                              : invoice.payment_status === 'ATRASADO'
                              ? 'bg-red-100 text-red-700'
                              : invoice.payment_status === 'AGENDADO'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-yellow-100 text-yellow-700'
                          }`}>
                            {invoice.payment_status}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700">
                          {invoice.estado || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {/* Rodapé */}
              <div className="bg-slate-50 px-4 py-2 border-t border-slate-200 text-xs text-slate-500">
                Total de {invoices.length} nota(s) fiscal(is) encontrada(s)
              </div>
            </div>
          </>
        )}

        {!loading && invoices.length === 0 && (
          <div className="text-center py-12 text-slate-500">
            Nenhuma nota fiscal encontrada para os filtros selecionados
          </div>
        )}
      </div>
    </div>
  );
}
