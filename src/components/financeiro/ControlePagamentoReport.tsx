import { useState, useEffect, useMemo, useCallback } from 'react';
import { X, FileDown, FileSpreadsheet, AlertCircle, Filter, Calendar, Search, RefreshCw, ChevronDown, ChevronUp, Wallet, Clock, CalendarClock, AlertTriangle, Layers } from 'lucide-react';
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

// Valor efetivamente pago (líquido) de uma nota: usa paid_value quando existe,
// e cai para net_value apenas quando a nota já está marcada como PAGA sem esse dado preenchido.
const getValorLiquidoPago = (invoice: Invoice): number | null => {
  if (invoice.paid_value !== undefined && invoice.paid_value !== null) return invoice.paid_value;
  if (invoice.payment_status === 'PAGO') return invoice.net_value;
  return null;
};

const STATUS_STYLES: Record<Invoice['payment_status'], { badge: string; bar: string }> = {
  PAGO: { badge: 'bg-green-100 text-green-700', bar: 'border-l-green-400' },
  ATRASADO: { badge: 'bg-red-100 text-red-700', bar: 'border-l-red-400' },
  AGENDADO: { badge: 'bg-blue-100 text-blue-700', bar: 'border-l-blue-400' },
  'EM ABERTO': { badge: 'bg-amber-100 text-amber-700', bar: 'border-l-amber-400' },
};

export function ControlePagamentoReport({ onClose }: ControlePagamentoReportProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [exporting, setExporting] = useState<ExportType>('none');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(true);

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

  // Função para obter data com horário para query (retorna null se vazia)
  const getDateForQuery = useCallback((date: string, isEnd: boolean): string | null => {
    if (!date) return null;
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

    // Validar datas preenchidas
    if (!filters.startDate || !filters.endDate) {
      setError('Selecione as datas inicial e final');
      return;
    }

    if (!validateDates()) return;

    setLoading(true);
    setError(null);

    try {
      let query = supabase
        .from('invoices')
        .select('*')
        .is('deleted_at', null);

      // Aplicar filtro de data baseado no tipo selecionado
      const startDateTime = getDateForQuery(filters.startDate, false);
      const endDateTime = getDateForQuery(filters.endDate, true);

      // Só aplica filtros se as datas forem válidas
      if (startDateTime) {
        switch (filters.dateFilterType) {
          case 'issue':
            query = query.gte('issue_date', startDateTime);
            break;
          case 'due':
            query = query.gte('due_date', startDateTime);
            break;
          case 'payment':
            query = query.not('payment_date', 'is', null).gte('payment_date', startDateTime);
            break;
        }
      }

      if (endDateTime) {
        switch (filters.dateFilterType) {
          case 'issue':
            query = query.lte('issue_date', endDateTime);
            break;
          case 'due':
            query = query.lte('due_date', endDateTime);
            break;
          case 'payment':
            query = query.lte('payment_date', endDateTime);
            break;
        }
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
        setInvoices([]);
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
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, [user, filters, validateDates, getDateForQuery]);

  // Carregar relatório inicial (apenas uma vez, quando o modal abrir)
  useEffect(() => {
    if (user) {
      handleGenerateReport().finally(() => setInitialLoading(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]); // Executa apenas quando user muda (ou na montagem)

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

  // ─── PDF EXPORT ───────────────────────────────────────────────────────────────
  const exportToPDF = useCallback(() => {
    if (!validateExportData()) return;

    setExporting('pdf');

    try {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 10;
      let yPos = 8;

      const tipoDataTexto = {
        issue: 'Data de Emissão',
        due: 'Data de Vencimento',
        payment: 'Data de Pagamento',
      }[filters.dateFilterType];

      const filtrosAplicados: string[] = [];
      if (filters.status !== 'all') filtrosAplicados.push(`Status: ${filters.status}`);
      if (filters.estado !== 'all') filtrosAplicados.push(`Estado: ${filters.estado}`);
      if (filters.unitName) filtrosAplicados.push(`Unidade: ${filters.unitName}`);
      if (filters.invoiceNumber) filtrosAplicados.push(`NF: ${filters.invoiceNumber}`);

      // ── Cabeçalho de página
      const drawPageHeader = (isFirstPage: boolean) => {
        doc.setFillColor(13, 18, 33);
        doc.rect(0, 0, pageWidth, isFirstPage ? 42 : 16, 'F');

        if (isFirstPage) {
          doc.setFillColor(79, 70, 229);
          doc.rect(0, 0, pageWidth, 1.2, 'F');

          try {
            doc.addImage(logoImg, 'PNG', margin, 6, 32, 15);
          } catch {}

          doc.setFontSize(15);
          doc.setTextColor(255, 255, 255);
          doc.setFont(undefined, 'bold');
          doc.text('RELATÓRIO DE CONTROLE DE PAGAMENTO', pageWidth / 2, 14, { align: 'center' });

          doc.setFontSize(8);
          doc.setFont(undefined, 'normal');
          doc.setTextColor(148, 163, 184);
          doc.text(
            `${tipoDataTexto}: ${formatDisplayDate(filters.startDate)} — ${formatDisplayDate(filters.endDate)}   |   Gerado em: ${new Date().toLocaleString('pt-BR')}`,
            pageWidth / 2, 21, { align: 'center' }
          );

          if (filtrosAplicados.length > 0) {
            doc.setFontSize(7);
            doc.setTextColor(129, 140, 248);
            doc.text(`Filtros ativos: ${filtrosAplicados.join('   •   ')}`, pageWidth / 2, 26.5, { align: 'center' });
          }

          doc.setDrawColor(30, 41, 59);
          doc.setLineWidth(0.3);
          doc.line(margin, 29.5, pageWidth - margin, 29.5);

          // ── Cards de resumo (5 indicadores)
          const cardY = 32.5;
          const cardH = 8.2;
          const cardGap = 2.5;
          const cardW = (pageWidth - margin * 2 - cardGap * 4) / 5;

          const drawCard = (
            x: number, label: string, value: string,
            bg: [number, number, number], labelColor: [number, number, number], valueColor: [number, number, number]
          ) => {
            doc.setFillColor(...bg);
            doc.roundedRect(x, cardY, cardW, cardH, 1.4, 1.4, 'F');
            doc.setFontSize(5.6);
            doc.setTextColor(...labelColor);
            doc.setFont(undefined, 'normal');
            doc.text(label, x + 2.8, cardY + 3.2);
            doc.setFontSize(7.6);
            doc.setFont(undefined, 'bold');
            doc.setTextColor(...valueColor);
            doc.text(value, x + 2.8, cardY + 6.8);
          };

          drawCard(margin, 'PAGO', formatCurrencyBR(totals.pago), [20, 83, 45], [134, 239, 172], [220, 252, 231]);
          drawCard(margin + (cardW + cardGap), 'EM ABERTO', formatCurrencyBR(totals.emAberto), [120, 85, 8], [253, 224, 138], [254, 243, 199]);
          drawCard(margin + (cardW + cardGap) * 2, 'AGENDADO', formatCurrencyBR(totals.agendado), [30, 58, 138], [147, 197, 253], [219, 234, 254]);
          drawCard(margin + (cardW + cardGap) * 3, 'ATRASADO', formatCurrencyBR(totals.atrasado), [127, 29, 29], [252, 165, 165], [254, 226, 226]);
          drawCard(margin + (cardW + cardGap) * 4, 'TOTAL GERAL', formatCurrencyBR(totals.totalGeral), [49, 46, 129], [196, 181, 253], [237, 233, 254]);

          yPos = 45;
        } else {
          doc.setFontSize(7);
          doc.setTextColor(148, 163, 184);
          doc.setFont(undefined, 'normal');
          doc.text('CONTROLE DE PAGAMENTO', margin, 10);
          doc.text(
            `${formatDisplayDate(filters.startDate)} — ${formatDisplayDate(filters.endDate)}`,
            pageWidth / 2, 10, { align: 'center' }
          );
          doc.text(`Pág. ${doc.internal.pages.length - 1}`, pageWidth - margin, 10, { align: 'right' });
          yPos = 19;
        }
      };

      // ── Colunas da tabela (agora com Data de Pagamento e Valor Líquido Pago)
      const tableWidth = pageWidth - margin * 2;
      const colWidths: Record<string, number> = {
        item: 10, unidade: 44, nf: 22, emissao: 20, vencimento: 20,
        pagamento: 20, valor: 24, valorPago: 26, status: 22, estado: 12,
      };
      const gap = 1;
      const totalW = Object.values(colWidths).reduce((s, w) => s + w, 0);
      const totalWithGaps = totalW + (Object.keys(colWidths).length - 1) * gap;
      if (totalWithGaps > tableWidth) {
        const scale = (tableWidth - (Object.keys(colWidths).length - 1) * gap) / totalW;
        Object.keys(colWidths).forEach(k => { colWidths[k] = colWidths[k] * scale; });
      }
      const colPos: Record<string, number> = {};
      let cx = margin;
      Object.keys(colWidths).forEach(k => { colPos[k] = cx; cx += colWidths[k] + gap; });

      const HEADER_H = 9;
      const drawTableHeader = () => {
        doc.setFillColor(30, 41, 59);
        doc.rect(margin, yPos, tableWidth, HEADER_H, 'F');

        const headers = [
          { k: 'item', l: 'ITEM' }, { k: 'unidade', l: 'UNIDADE' }, { k: 'nf', l: 'NF' },
          { k: 'emissao', l: 'EMISSÃO' }, { k: 'vencimento', l: 'VENCIMENTO' },
          { k: 'pagamento', l: 'DATA PGTO' }, { k: 'valor', l: 'VALOR LÍQUIDO' },
          { k: 'valorPago', l: 'VALOR PAGO' }, { k: 'status', l: 'STATUS' }, { k: 'estado', l: 'UF' },
        ];

        doc.setFontSize(5.8);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(148, 163, 184);
        headers.forEach(h => {
          doc.setDrawColor(51, 65, 85);
          doc.setLineWidth(0.2);
          if (h.k !== 'item') doc.line(colPos[h.k] - gap / 2, yPos + 1, colPos[h.k] - gap / 2, yPos + HEADER_H - 1);
          doc.text(h.l, colPos[h.k] + 1.3, yPos + 5.8);
        });

        yPos += HEADER_H;
        doc.setTextColor(0, 0, 0);
        doc.setFont(undefined, 'normal');
        doc.setFontSize(6.3);
      };

      const statusColor = (status: Invoice['payment_status']): [number, number, number] => {
        switch (status) {
          case 'PAGO': return [21, 128, 61];
          case 'ATRASADO': return [185, 28, 28];
          case 'AGENDADO': return [37, 99, 235];
          default: return [180, 130, 8];
        }
      };

      const barColor = (status: Invoice['payment_status']): [number, number, number] => {
        switch (status) {
          case 'PAGO': return [34, 197, 94];
          case 'ATRASADO': return [239, 68, 68];
          case 'AGENDADO': return [59, 130, 246];
          default: return [245, 158, 11];
        }
      };

      drawPageHeader(true);
      drawTableHeader();

      let rowCount = 0;
      const ROW_H = 6.8;
      for (const invoice of invoices) {
        if (yPos + ROW_H > pageHeight - 14) {
          doc.setFillColor(13, 18, 33);
          doc.rect(0, pageHeight - 10, pageWidth, 10, 'F');
          doc.setFontSize(6);
          doc.setTextColor(100, 116, 139);
          doc.setFont(undefined, 'normal');
          doc.text(
            `Pago: ${formatCurrencyBR(totals.pago)}   Em Aberto: ${formatCurrencyBR(totals.emAberto)}   Agendado: ${formatCurrencyBR(totals.agendado)}   Atrasado: ${formatCurrencyBR(totals.atrasado)}`,
            margin, pageHeight - 4
          );
          doc.text(`Página ${doc.internal.pages.length - 1}`, pageWidth - margin, pageHeight - 4, { align: 'right' });

          doc.addPage();
          drawPageHeader(false);
          drawTableHeader();
          rowCount = 0;
        }

        doc.setFillColor(rowCount % 2 === 0 ? 248 : 255, rowCount % 2 === 0 ? 250 : 255, rowCount % 2 === 0 ? 252 : 255);
        doc.rect(margin, yPos, tableWidth, ROW_H, 'F');

        doc.setFillColor(...barColor(invoice.payment_status));
        doc.rect(margin, yPos, 1.3, ROW_H, 'F');

        doc.setFontSize(6.3);
        doc.setFont(undefined, 'normal');

        doc.setTextColor(71, 85, 105);
        doc.text(String(invoice.item_number), colPos.item + 1.8, yPos + 4.4);

        const unidadeTxt = invoice.unit_name.length > 26 ? invoice.unit_name.substring(0, 24) + '…' : invoice.unit_name;
        doc.setTextColor(30, 41, 59);
        doc.text(unidadeTxt, colPos.unidade + 1.5, yPos + 4.4);

        doc.setTextColor(71, 85, 105);
        doc.text(invoice.invoice_number, colPos.nf + 1.5, yPos + 4.4);
        doc.text(formatDisplayDate(invoice.issue_date), colPos.emissao + 1.5, yPos + 4.4);
        doc.text(formatDisplayDate(invoice.due_date), colPos.vencimento + 1.5, yPos + 4.4);
        doc.text(formatDisplayDate(invoice.payment_date), colPos.pagamento + 1.5, yPos + 4.4);

        // VALOR LÍQUIDO (net_value)
        doc.setTextColor(51, 65, 85);
        doc.setFont(undefined, 'bold');
        doc.text(formatCurrencyBR(invoice.net_value), colPos.valor + colWidths.valor - 2, yPos + 4.4, { align: 'right' });

        // VALOR LÍQUIDO PAGO
        const valorPago = getValorLiquidoPago(invoice);
        doc.setTextColor(...(valorPago !== null ? [21, 128, 61] : [148, 163, 184]));
        doc.text(
          valorPago !== null ? formatCurrencyBR(valorPago) : '—',
          colPos.valorPago + colWidths.valorPago - 2, yPos + 4.4, { align: 'right' }
        );
        doc.setFont(undefined, 'normal');

        doc.setTextColor(...statusColor(invoice.payment_status));
        doc.setFont(undefined, 'bold');
        doc.text(invoice.payment_status, colPos.status + 1.5, yPos + 4.4);
        doc.setFont(undefined, 'normal');

        doc.setTextColor(71, 85, 105);
        doc.text(invoice.estado || '—', colPos.estado + 1.5, yPos + 4.4);

        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.15);
        doc.line(margin, yPos + ROW_H, pageWidth - margin, yPos + ROW_H);

        yPos += ROW_H;
        rowCount++;
      }

      // ── Rodapé final
      doc.setFillColor(13, 18, 33);
      doc.rect(0, pageHeight - 10, pageWidth, 10, 'F');
      doc.setFontSize(6.3);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(134, 239, 172);
      doc.text(`Pago: ${formatCurrencyBR(totals.pago)}`, margin + 2, pageHeight - 4);
      doc.setTextColor(253, 224, 138);
      doc.text(`Em Aberto: ${formatCurrencyBR(totals.emAberto)}`, margin + 52, pageHeight - 4);
      doc.setTextColor(147, 197, 253);
      doc.text(`Agendado: ${formatCurrencyBR(totals.agendado)}`, margin + 102, pageHeight - 4);
      doc.setTextColor(252, 165, 165);
      doc.text(`Atrasado: ${formatCurrencyBR(totals.atrasado)}`, margin + 150, pageHeight - 4);
      doc.setTextColor(196, 181, 253);
      doc.text(`Total: ${formatCurrencyBR(totals.totalGeral)}`, margin + 198, pageHeight - 4);
      doc.setTextColor(100, 116, 139);
      doc.setFont(undefined, 'normal');
      doc.text(`Página ${doc.internal.pages.length - 1}`, pageWidth - margin, pageHeight - 4, { align: 'right' });

      doc.save(`relatorio-controle-pagamento-${filters.startDate}-a-${filters.endDate}.pdf`);
    } catch (error) {
      console.error('Error exporting to PDF:', error);
      alert('Erro ao exportar para PDF');
    } finally {
      setExporting('none');
    }
  }, [invoices, totals, filters, formatDisplayDate, validateExportData]);

  // ─── EXCEL EXPORT ─────────────────────────────────────────────────────────────
  const exportToExcel = useCallback(() => {
    if (!validateExportData()) return;

    setExporting('excel');

    try {
      // Dados detalhados
      const data = invoices.map((invoice) => {
        const valorPago = getValorLiquidoPago(invoice);
        return {
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
          'Valor Líquido Pago': valorPago !== null ? valorPago : '-',
          Status: invoice.payment_status,
          Estado: invoice.estado || '-',
        };
      });

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
        { wch: 17 }, // Valor Líquido Pago
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

  // ─── LOADING INICIAL ─────────────────────────────────────────────────────────
  if (initialLoading) {
    return (
      <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl shadow-2xl p-10 flex flex-col items-center gap-4">
          <div className="w-14 h-14 rounded-full border-4 border-indigo-100 border-t-indigo-600 animate-spin" />
          <p className="text-slate-600 font-medium text-sm">Carregando relatório…</p>
        </div>
      </div>
    );
  }

  // ─── RENDER ───────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl my-6 flex flex-col max-h-[92vh] overflow-hidden">

        {/* ── HEADER ── */}
        <div className="relative flex-shrink-0 bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 px-6 py-5">
          <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-indigo-500 via-violet-500 to-indigo-500" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-400/20 flex items-center justify-center">
                <Wallet className="w-5 h-5 text-indigo-300" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white leading-tight tracking-tight">Controle de Pagamento</h3>
                <p className="text-xs text-slate-400 mt-0.5">Situação de pagamento das notas fiscais por período</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── BODY (scrollable) ── */}
        <div className="flex-1 overflow-y-auto">

          {/* ── FILTROS ── */}
          <div className="border-b border-slate-100">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="w-full px-6 py-3.5 flex items-center justify-between hover:bg-slate-50 transition-colors group"
            >
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-slate-400 group-hover:text-indigo-500 transition-colors" />
                <span className="text-sm font-medium text-slate-700">Filtros</span>
                {(filters.status !== 'all' || filters.estado !== 'all' || filters.invoiceNumber || filters.unitName) && (
                  <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs rounded-full font-medium">
                    Ativos
                  </span>
                )}
              </div>
              {showFilters
                ? <ChevronUp className="w-4 h-4 text-slate-400" />
                : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </button>

            {showFilters && (
              <div className="px-6 pt-2 pb-6 space-y-4 bg-slate-50/60">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                      <CalendarClock className="w-3.5 h-3.5" /> Filtrar por Data
                    </label>
                    <select
                      value={filters.dateFilterType}
                      onChange={(e) => setFilters({
                        ...filters,
                        dateFilterType: e.target.value as DateFilterType
                      })}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow"
                    >
                      <option value="issue">Data de Emissão</option>
                      <option value="due">Data de Vencimento</option>
                      <option value="payment">Data de Pagamento</option>
                    </select>
                  </div>

                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                      <Calendar className="w-3.5 h-3.5" /> Data Inicial
                    </label>
                    <input
                      type="date"
                      value={filters.startDate}
                      onChange={(e) => {
                        setFilters({ ...filters, startDate: e.target.value });
                        setError(null);
                      }}
                      max={filters.endDate}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow"
                    />
                  </div>

                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                      <Calendar className="w-3.5 h-3.5" /> Data Final
                    </label>
                    <input
                      type="date"
                      value={filters.endDate}
                      onChange={(e) => {
                        setFilters({ ...filters, endDate: e.target.value });
                        setError(null);
                      }}
                      min={filters.startDate}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow"
                    />
                  </div>

                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                      <Search className="w-3.5 h-3.5" /> Número da NF
                    </label>
                    <input
                      type="text"
                      placeholder="Buscar por NF"
                      value={filters.invoiceNumber}
                      onChange={(e) => setFilters({ ...filters, invoiceNumber: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Unidade</label>
                    <input
                      type="text"
                      placeholder="Buscar por unidade"
                      value={filters.unitName}
                      onChange={(e) => setFilters({ ...filters, unitName: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Status</label>
                    <select
                      value={filters.status}
                      onChange={(e) => setFilters({ ...filters, status: e.target.value as Filters['status'] })}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    >
                      <option value="all">Todos</option>
                      <option value="PAGO">PAGO</option>
                      <option value="EM ABERTO">EM ABERTO</option>
                      <option value="AGENDADO">AGENDADO</option>
                      <option value="ATRASADO">ATRASADO</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Estado</label>
                    <select
                      value={filters.estado}
                      onChange={(e) => setFilters({ ...filters, estado: e.target.value as Filters['estado'] })}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    >
                      <option value="all">Todos</option>
                      <option value="MA">MA</option>
                      <option value="PA">PA</option>
                    </select>
                  </div>
                </div>

                {error && (
                  <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
                    <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-600">{error}</p>
                  </div>
                )}

                <div className="flex gap-3 pt-1">
                  <button
                    onClick={handleGenerateReport}
                    disabled={loading}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-sm shadow-indigo-200"
                  >
                    {loading
                      ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /><span>Gerando…</span></>
                      : <><RefreshCw className="w-4 h-4" /><span>Gerar Relatório</span></>}
                  </button>
                  <button
                    onClick={resetFilters}
                    className="px-4 py-2.5 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-100 transition-all"
                  >
                    Limpar
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── RESULTADOS ── */}
          <div className="p-6 space-y-6">
            {invoices.length > 0 && (
              <>
                {/* Botões de exportação */}
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={exportToPDF}
                    disabled={exporting !== 'none'}
                    className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium rounded-xl transition-all disabled:opacity-60 shadow-sm shadow-rose-200"
                  >
                    {exporting === 'pdf'
                      ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /><span>Exportando…</span></>
                      : <><FileDown className="w-4 h-4" /><span>Exportar PDF</span></>}
                  </button>
                  <button
                    onClick={exportToExcel}
                    disabled={exporting !== 'none'}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-xl transition-all disabled:opacity-60 shadow-sm shadow-emerald-200"
                  >
                    {exporting === 'excel'
                      ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /><span>Exportando…</span></>
                      : <><FileSpreadsheet className="w-4 h-4" /><span>Exportar Excel</span></>}
                  </button>
                </div>

                {/* Cards de resumo */}
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  <div className="relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-green-500" />
                    <div className="flex items-start justify-between mb-3 pl-2">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pago</p>
                      <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center">
                        <Wallet className="w-4 h-4 text-green-600" />
                      </div>
                    </div>
                    <p className="text-xl font-bold text-slate-800 pl-2">{formatCurrencyBR(totals.pago)}</p>
                    <p className="text-xs text-slate-400 mt-2 pl-2">
                      {invoices.filter(i => i.payment_status === 'PAGO').length} notas
                    </p>
                  </div>

                  <div className="relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500" />
                    <div className="flex items-start justify-between mb-3 pl-2">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Em Aberto</p>
                      <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
                        <Clock className="w-4 h-4 text-amber-600" />
                      </div>
                    </div>
                    <p className="text-xl font-bold text-slate-800 pl-2">{formatCurrencyBR(totals.emAberto)}</p>
                    <p className="text-xs text-slate-400 mt-2 pl-2">
                      {invoices.filter(i => i.payment_status === 'EM ABERTO').length} notas
                    </p>
                  </div>

                  <div className="relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500" />
                    <div className="flex items-start justify-between mb-3 pl-2">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Agendado</p>
                      <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                        <CalendarClock className="w-4 h-4 text-blue-600" />
                      </div>
                    </div>
                    <p className="text-xl font-bold text-slate-800 pl-2">{formatCurrencyBR(totals.agendado)}</p>
                    <p className="text-xs text-slate-400 mt-2 pl-2">
                      {invoices.filter(i => i.payment_status === 'AGENDADO').length} notas
                    </p>
                  </div>

                  <div className="relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500" />
                    <div className="flex items-start justify-between mb-3 pl-2">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Atrasado</p>
                      <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
                        <AlertTriangle className="w-4 h-4 text-red-600" />
                      </div>
                    </div>
                    <p className="text-xl font-bold text-slate-800 pl-2">{formatCurrencyBR(totals.atrasado)}</p>
                    <p className="text-xs text-slate-400 mt-2 pl-2">
                      {invoices.filter(i => i.payment_status === 'ATRASADO').length} notas
                    </p>
                  </div>

                  <div className="relative overflow-hidden rounded-2xl border border-indigo-100 bg-indigo-50/40 p-5 shadow-sm">
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500" />
                    <div className="flex items-start justify-between mb-3 pl-2">
                      <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">Total Geral</p>
                      <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                        <Layers className="w-4 h-4 text-indigo-600" />
                      </div>
                    </div>
                    <p className="text-xl font-bold text-indigo-800 pl-2">{formatCurrencyBR(totals.totalGeral)}</p>
                    <p className="text-xs text-indigo-500 mt-2 pl-2">{invoices.length} notas</p>
                  </div>
                </div>

                {/* Tabela de notas */}
                <div className="rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                  <div className="overflow-x-auto" style={{ maxHeight: '440px' }}>
                    <table className="w-full min-w-[1180px] text-sm">
                      <thead>
                        <tr className="bg-slate-900 text-slate-300">
                          <th className="sticky top-0 z-10 bg-slate-900 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider whitespace-nowrap">Item</th>
                          <th className="sticky top-0 z-10 bg-slate-900 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">Unidade</th>
                          <th className="sticky top-0 z-10 bg-slate-900 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider whitespace-nowrap">NF</th>
                          <th className="sticky top-0 z-10 bg-slate-900 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider whitespace-nowrap">Exercício</th>
                          <th className="sticky top-0 z-10 bg-slate-900 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider whitespace-nowrap">Emissão</th>
                          <th className="sticky top-0 z-10 bg-slate-900 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider whitespace-nowrap">Vencimento</th>
                          <th className="sticky top-0 z-10 bg-slate-900 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider whitespace-nowrap">Data Pagamento</th>
                          <th className="sticky top-0 z-10 bg-slate-900 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider whitespace-nowrap">Valor Líquido</th>
                          <th className="sticky top-0 z-10 bg-slate-900 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider whitespace-nowrap border-l border-slate-700">Valor Líquido Pago</th>
                          <th className="sticky top-0 z-10 bg-slate-900 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider whitespace-nowrap">Status</th>
                          <th className="sticky top-0 z-10 bg-slate-900 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider whitespace-nowrap">Estado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {invoices.map((invoice, idx) => {
                          const valorPago = getValorLiquidoPago(invoice);
                          const style = STATUS_STYLES[invoice.payment_status];
                          return (
                            <tr
                              key={invoice.id}
                              className={`group hover:bg-indigo-50/40 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}
                            >
                              <td className={`px-4 py-3 whitespace-nowrap text-sm text-slate-700 font-medium border-l-2 ${style.bar}`}>
                                {invoice.item_number}
                              </td>
                              <td className="px-4 py-3 text-sm text-slate-700 max-w-xs truncate" title={invoice.unit_name}>
                                {invoice.unit_name}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-600">
                                {invoice.invoice_number}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-500">
                                {String(invoice.exercise_month).padStart(2, '0')}/{invoice.exercise_year}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-xs font-mono text-slate-500">
                                {formatDisplayDate(invoice.issue_date)}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-xs font-mono text-slate-500">
                                {formatDisplayDate(invoice.due_date)}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-xs font-mono text-slate-500">
                                {formatDisplayDate(invoice.payment_date)}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-semibold text-slate-700">
                                {formatCurrencyBR(invoice.net_value)}
                              </td>
                              <td className={`px-4 py-3 whitespace-nowrap text-sm text-right font-mono font-semibold border-l border-slate-100 ${
                                valorPago !== null ? 'text-green-700' : 'text-slate-300'
                              }`}>
                                {valorPago !== null ? formatCurrencyBR(valorPago) : '—'}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${style.badge}`}>
                                  {invoice.payment_status}
                                </span>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-500">
                                {invoice.estado || '-'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Footer da tabela */}
                  <div className="bg-slate-900 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-slate-400">
                      <span className="text-slate-200 font-semibold">{invoices.length}</span> nota(s) fiscal(is) encontrada(s)
                    </span>
                    <div className="flex items-center gap-4 text-xs">
                      <span className="text-green-400 font-medium">Pago: {formatCurrencyBR(totals.pago)}</span>
                      <span className="text-amber-400 font-medium">Aberto: {formatCurrencyBR(totals.emAberto)}</span>
                      <span className="text-blue-400 font-medium">Agendado: {formatCurrencyBR(totals.agendado)}</span>
                      <span className="text-red-400 font-medium">Atrasado: {formatCurrencyBR(totals.atrasado)}</span>
                      <span className="font-semibold text-indigo-300 border-l border-slate-700 pl-4">
                        Total: {formatCurrencyBR(totals.totalGeral)}
                      </span>
                    </div>
                  </div>
                </div>
              </>
            )}

            {!loading && invoices.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                  <Wallet className="w-8 h-8 text-slate-300" />
                </div>
                <p className="font-semibold text-slate-600 mb-1">Nenhuma nota fiscal encontrada</p>
                <p className="text-sm text-slate-400">Para os filtros selecionados</p>
                <button
                  onClick={resetFilters}
                  className="mt-5 px-4 py-2 text-sm text-indigo-600 hover:text-indigo-700 font-medium border border-indigo-200 rounded-xl hover:bg-indigo-50 transition-all"
                >
                  Limpar filtros
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
