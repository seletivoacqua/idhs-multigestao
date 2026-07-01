import { useState, useEffect, useMemo, useCallback } from 'react';
import { X, FileDown, FileSpreadsheet, AlertCircle, Filter, Calendar, TrendingUp, TrendingDown, DollarSign, RefreshCw, ChevronDown, ChevronUp, BarChart2, Scale } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';
import logoImg from '../../assets/Gemini_Generated_Image_dimyf6dimyf6dimy-removebg-preview.png';
import { formatCurrencyBR } from '../../utils/currencyUtils';

interface Transaction {
  id: string;
  user_id: string;
  type: 'income' | 'expense';
  amount: number;
  method: string;
  category?: string | null;
  subcategoria?: string | null;
  description: string;
  transaction_date: string;
  fonte_pagadora?: string | null;
  fornecedor?: string | null;
  com_nota?: boolean | null;
  so_recibo?: boolean | null;
  idhs?: boolean | null;
  geral?: boolean | null;
  invoice_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

interface TransactionWithBalance extends Transaction {
  saldoLiquido: number;
}

interface Invoice {
  id: string;
  net_value: number;
  issue_date: string;
  due_date: string;
  payment_status: string;
  payment_date: string | null;
  paid_value: number | null;
  invoice_number: string;
  unit_name: string;
}

interface Filters {
  startDate: string;
  endDate: string;
  type: 'all' | 'income' | 'expense';
  documentType: 'all' | 'com_nota' | 'so_recibo';
  category: 'all' | 'despesas_fixas' | 'despesas_variaveis';
  origem: 'all' | 'idhs' | 'geral' | 'nenhuma';
  includeInvoices: boolean;
  includeOrigin: boolean;
}

interface FluxoCaixaReportProps {
  onClose: () => void;
}

type ExportType = 'none' | 'pdf' | 'excel';

export function FluxoCaixaReport({ onClose }: FluxoCaixaReportProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [exporting, setExporting] = useState<ExportType>('none');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(true);
  const [lastQueryTime, setLastQueryTime] = useState<Date | null>(null);

  const [filters, setFilters] = useState<Filters>({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    type: 'all',
    documentType: 'all',
    category: 'all',
    origem: 'all',
    includeInvoices: false,
    includeOrigin: true,
  });

  const validateDates = useCallback((): boolean => {
    if (filters.startDate > filters.endDate) {
      setError('Data inicial não pode ser maior que data final');
      return false;
    }
    return true;
  }, [filters.startDate, filters.endDate]);

  const fetchAllTransactions = useCallback(async (startDate: string, endDate: string) => {
    let allData: Transaction[] = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const from = page * pageSize;
      const to = (page + 1) * pageSize - 1;

      let query = supabase
        .from('cash_flow_transactions')
        .select('*')
        .gte('transaction_date', startDate)
        .lte('transaction_date', endDate)
        .range(from, to)
        .order('transaction_date', { ascending: false });

      if (filters.type !== 'all') query = query.eq('type', filters.type);
      if (filters.category !== 'all' && (filters.type === 'all' || filters.type === 'expense'))
        query = query.eq('category', filters.category);
      if (filters.documentType !== 'all' && (filters.type === 'all' || filters.type === 'expense')) {
        if (filters.documentType === 'com_nota') query = query.eq('com_nota', true);
        else if (filters.documentType === 'so_recibo') query = query.eq('so_recibo', true);
      }
      if (filters.origem !== 'all' && (filters.type === 'all' || filters.type === 'expense')) {
        if (filters.origem === 'idhs') query = query.eq('idhs', true);
        else if (filters.origem === 'geral') query = query.eq('geral', true);
        else if (filters.origem === 'nenhuma')
          query = query.or('idhs.is.null,idhs.eq.false,and(geral.is.null,geral.eq.false)');
      }

      const { data, error: queryError } = await query;
      if (queryError) throw new Error(`Erro ao buscar transações: ${queryError.message}`);

      if (!data || data.length === 0) {
        hasMore = false;
      } else {
        allData = [...allData, ...data];
        page++;
        if (data.length < pageSize) hasMore = false;
      }
    }
    return allData;
  }, [filters]);

  const fetchInvoices = useCallback(async (startDate: string, endDate: string) => {
    if (!filters.includeInvoices) return [];
    const { data, error: invoiceError } = await supabase
      .from('invoices')
      .select('id, net_value, issue_date, due_date, payment_status, payment_date, paid_value, invoice_number, unit_name')
      .gte('issue_date', startDate)
      .lte('issue_date', endDate)
      .order('issue_date', { ascending: false });
    if (invoiceError) return [];
    return data || [];
  }, [filters.includeInvoices]);

  const handleGenerateReport = useCallback(async () => {
    if (!user) { setError('Usuário não autenticado'); return; }
    if (!validateDates()) return;
    setLoading(true);
    setError(null);
    try {
      const transactionsData = await fetchAllTransactions(filters.startDate, filters.endDate);
      const invoicesData = await fetchInvoices(filters.startDate, filters.endDate);
      const processedTransactions = transactionsData.map(t => ({
        ...t,
        amount: Number(t.amount),
        com_nota: t.com_nota === true,
        so_recibo: t.so_recibo === true,
        idhs: t.idhs === true,
        geral: t.geral === true,
      }));
      setTransactions(processedTransactions);
      setInvoices(invoicesData);
      setLastQueryTime(new Date());
      if (processedTransactions.length === 0 && invoicesData.length === 0)
        setError('Nenhuma transação ou nota fiscal encontrada no período selecionado');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Erro ao gerar relatório');
    } finally {
      setLoading(false);
    }
  }, [user, filters, validateDates, fetchAllTransactions, fetchInvoices]);

  const formatDisplayDate = useCallback((dateString: string): string => {
    try {
      const [year, month, day] = dateString.split('T')[0].split('-');
      return `${day}/${month}/${year}`;
    } catch { return dateString; }
  }, []);

  useEffect(() => {
    if (user) handleGenerateReport().finally(() => setInitialLoading(false));
  }, [user, handleGenerateReport]);

  const totals = useMemo(() => {
    const income = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const invoiceTotal = invoices.reduce((s, i) => s + i.net_value, 0);
    return { income, expense, balance: income - expense, invoiceTotal };
  }, [transactions, invoices]);

  // ─── SALDO LÍQUIDO (saldo acumulado transação a transação, em ordem cronológica) ──
  const transactionsWithBalance: TransactionWithBalance[] = useMemo(() => {
    const chronological = [...transactions].sort((a, b) => {
      const byDate = a.transaction_date.localeCompare(b.transaction_date);
      if (byDate !== 0) return byDate;
      return (a.created_at || '').localeCompare(b.created_at || '');
    });

    const balanceById = new Map<string, number>();
    let running = 0;
    for (const t of chronological) {
      running += t.type === 'income' ? t.amount : -t.amount;
      balanceById.set(t.id, running);
    }

    // Mantém a ordenação original (mais recentes primeiro) usada no restante da UI
    return transactions.map(t => ({ ...t, saldoLiquido: balanceById.get(t.id) ?? 0 }));
  }, [transactions]);

  const statistics = useMemo(() => {
    const expensesByCategory = transactions
      .filter(t => t.type === 'expense')
      .reduce((acc, t) => { const c = t.category || 'sem_categoria'; acc[c] = (acc[c] || 0) + t.amount; return acc; }, {} as Record<string, number>);
    const expensesByOrigin = {
      idhs: transactions.filter(t => t.type === 'expense' && t.idhs).reduce((s, t) => s + t.amount, 0),
      geral: transactions.filter(t => t.type === 'expense' && t.geral).reduce((s, t) => s + t.amount, 0),
      outros: transactions.filter(t => t.type === 'expense' && !t.idhs && !t.geral).reduce((s, t) => s + t.amount, 0),
    };
    const expensesByMethod = transactions
      .filter(t => t.type === 'expense')
      .reduce((acc, t) => { acc[t.method] = (acc[t.method] || 0) + t.amount; return acc; }, {} as Record<string, number>);
    return { expensesByCategory, expensesByOrigin, expensesByMethod };
  }, [transactions]);

  const resetFilters = useCallback(() => {
    setFilters({
      startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0],
      type: 'all', documentType: 'all', category: 'all', origem: 'all',
      includeInvoices: false, includeOrigin: true,
    });
    setError(null);
  }, []);

  // ─── PDF EXPORT ───────────────────────────────────────────────────────────────
  const exportToPDF = useCallback(async () => {
    if (transactions.length === 0 && invoices.length === 0) { alert('Não há dados para exportar'); return; }
    setExporting('pdf');
    try {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 10;
      let yPos = 8;

      // ── Função de cabeçalho de página (chamada em cada nova página)
      const drawPageHeader = (isFirstPage: boolean) => {
        // Fundo azul escuro no topo
        doc.setFillColor(13, 18, 33);
        doc.rect(0, 0, pageWidth, isFirstPage ? 40 : 16, 'F');

        if (isFirstPage) {
          // Linha de destaque (assinatura visual do relatório)
          doc.setFillColor(79, 70, 229);
          doc.rect(0, 0, pageWidth, 1.2, 'F');

          // Logo
          try {
            const logoW = 32, logoH = 15;
            doc.addImage(logoImg, 'PNG', margin, 6, logoW, logoH);
          } catch {}

          // Título
          doc.setFontSize(15);
          doc.setTextColor(255, 255, 255);
          doc.setFont(undefined, 'bold');
          doc.text('RELATÓRIO DE FLUXO DE CAIXA', pageWidth / 2, 14, { align: 'center' });

          // Subtítulo / período
          doc.setFontSize(8);
          doc.setFont(undefined, 'normal');
          doc.setTextColor(148, 163, 184);
          doc.text(
            `Período: ${formatDisplayDate(filters.startDate)} — ${formatDisplayDate(filters.endDate)}   |   Gerado em: ${new Date().toLocaleString('pt-BR')}`,
            pageWidth / 2, 21, { align: 'center' }
          );

          // Linha separadora sutil
          doc.setDrawColor(30, 41, 59);
          doc.setLineWidth(0.3);
          doc.line(margin, 25, pageWidth - margin, 25);

          // ── Cards de resumo (4 indicadores, incluindo saldo líquido final)
          const cardY = 28;
          const cardH = 9.5;
          const cardGap = 3;
          const cardW = (pageWidth - margin * 2 - cardGap * 3) / 4;

          const drawCard = (x: number, label: string, value: string, bg: [number, number, number], labelColor: [number, number, number], valueColor: [number, number, number]) => {
            doc.setFillColor(...bg);
            doc.roundedRect(x, cardY, cardW, cardH, 1.6, 1.6, 'F');
            doc.setFontSize(5.8);
            doc.setTextColor(...labelColor);
            doc.setFont(undefined, 'normal');
            doc.text(label, x + 3, cardY + 3.6);
            doc.setFontSize(8);
            doc.setFont(undefined, 'bold');
            doc.setTextColor(...valueColor);
            doc.text(value, x + 3, cardY + 7.8);
          };

          const isPositive = totals.balance >= 0;
          const finalBalance = transactionsWithBalance.length > 0
            ? transactionsWithBalance.reduce((acc, t) => Math.abs(t.saldoLiquido) > Math.abs(acc) ? t.saldoLiquido : acc, 0)
            : 0;

          drawCard(margin, 'ENTRADAS', formatCurrencyBR(totals.income), [20, 83, 45], [134, 239, 172], [220, 252, 231]);
          drawCard(margin + (cardW + cardGap), 'SAÍDAS', formatCurrencyBR(totals.expense), [127, 29, 29], [252, 165, 165], [254, 226, 226]);
          drawCard(
            margin + (cardW + cardGap) * 2, 'SALDO DO PERÍODO', formatCurrencyBR(totals.balance),
            isPositive ? [17, 24, 90] : [120, 53, 15],
            isPositive ? [165, 180, 252] : [253, 230, 138],
            isPositive ? [224, 231, 255] : [254, 240, 138]
          );
          drawCard(
            margin + (cardW + cardGap) * 3, 'SALDO LÍQUIDO ACUMULADO', formatCurrencyBR(totals.balance),
            [49, 46, 129],
            [196, 181, 253],
            [237, 233, 254]
          );

          yPos = 43;
        } else {
          // Páginas seguintes: cabeçalho compacto
          doc.setFontSize(7);
          doc.setTextColor(148, 163, 184);
          doc.setFont(undefined, 'normal');
          doc.text('FLUXO DE CAIXA', margin, 10);
          doc.text(
            `${formatDisplayDate(filters.startDate)} — ${formatDisplayDate(filters.endDate)}`,
            pageWidth / 2, 10, { align: 'center' }
          );
          doc.text(`Pág. ${doc.internal.pages.length - 1}`, pageWidth - margin, 10, { align: 'right' });
          yPos = 19;
        }
      };

      // ── Configuração de colunas (agora incluindo Saldo Líquido)
      const includeOrigin = filters.includeOrigin;
      const tableWidth = pageWidth - margin * 2;
      let colWidths: Record<string, number>;

      if (includeOrigin) {
        colWidths = { data: 19, tipo: 15, descricao: 44, categoria: 21, fonte: 32, origem: 15, valor: 24, liquido: 26 };
      } else {
        colWidths = { data: 21, tipo: 16, descricao: 52, categoria: 24, fonte: 36, valor: 26, liquido: 28 };
      }

      const gap = 1;
      const totalW = Object.values(colWidths).reduce((s: number, w: number) => s + w, 0);
      const totalWithGaps = totalW + (Object.keys(colWidths).length - 1) * gap;
      if (totalWithGaps > tableWidth) {
        const scale = (tableWidth - (Object.keys(colWidths).length - 1) * gap) / totalW;
        Object.keys(colWidths).forEach(k => { colWidths[k] = Math.floor(colWidths[k] * scale); });
      }

      const colPos: Record<string, number> = {};
      let cx = margin;
      Object.keys(colWidths).forEach(k => { colPos[k] = cx; cx += colWidths[k] + gap; });

      // ── Cabeçalho da tabela (repetido em cada página)
      const HEADER_H = 9;
      const drawTableHeader = () => {
        // Fundo do cabeçalho
        doc.setFillColor(30, 41, 59);
        doc.rect(margin, yPos, tableWidth, HEADER_H, 'F');

        const headers = includeOrigin
          ? [
              { k: 'data', l: 'DATA' }, { k: 'tipo', l: 'TIPO' }, { k: 'descricao', l: 'DESCRIÇÃO' },
              { k: 'categoria', l: 'CATEGORIA' }, { k: 'fonte', l: 'FONTE / FORNECEDOR' },
              { k: 'origem', l: 'ORIGEM' }, { k: 'valor', l: 'VALOR (R$)' },
              { k: 'liquido', l: 'SALDO LÍQUIDO' },
            ]
          : [
              { k: 'data', l: 'DATA' }, { k: 'tipo', l: 'TIPO' }, { k: 'descricao', l: 'DESCRIÇÃO' },
              { k: 'categoria', l: 'CATEGORIA' }, { k: 'fonte', l: 'FONTE / FORNECEDOR' },
              { k: 'valor', l: 'VALOR (R$)' },
              { k: 'liquido', l: 'SALDO LÍQUIDO' },
            ];

        doc.setFontSize(6.2);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(148, 163, 184);

        headers.forEach(h => {
          // Linha vertical separadora sutil
          doc.setDrawColor(51, 65, 85);
          doc.setLineWidth(0.2);
          if (h.k !== 'data') doc.line(colPos[h.k] - gap / 2, yPos + 1, colPos[h.k] - gap / 2, yPos + HEADER_H - 1);
          doc.text(h.l, colPos[h.k] + 1.5, yPos + 5.8);
        });

        yPos += HEADER_H;
        doc.setTextColor(0, 0, 0);
        doc.setFont(undefined, 'normal');
        doc.setFontSize(6.5);
      };

      // ── Iniciar primeira página
      drawPageHeader(true);
      drawTableHeader();

      // ── Linhas de dados
      let rowCount = 0;
      for (const t of transactionsWithBalance) {
        const fonte = t.type === 'income' ? t.fonte_pagadora || '—' : t.fornecedor || '—';
        const origemTxt = t.type === 'expense' ? (t.idhs ? 'IDHS' : t.geral ? 'Geral' : '—') : '—';
        const descLines = doc.splitTextToSize(t.description || '—', colWidths.descricao - 3);
        const fonteLines = doc.splitTextToSize(fonte, colWidths.fonte - 3);
        const maxLines = Math.max(descLines.length, fonteLines.length, 1);
        const rowH = Math.max(maxLines * 3.6 + 3, 7);

        // Nova página?
        if (yPos + rowH > pageHeight - 14) {
          // Rodapé da página atual
          doc.setFillColor(13, 18, 33);
          doc.rect(0, pageHeight - 10, pageWidth, 10, 'F');
          doc.setFontSize(6);
          doc.setTextColor(100, 116, 139);
          doc.setFont(undefined, 'normal');
          doc.text(`Entradas: ${formatCurrencyBR(totals.income)}   Saídas: ${formatCurrencyBR(totals.expense)}   Saldo: ${formatCurrencyBR(totals.balance)}`, margin, pageHeight - 4);
          doc.text(`Página ${doc.internal.pages.length - 1}`, pageWidth - margin, pageHeight - 4, { align: 'right' });

          doc.addPage();
          drawPageHeader(false);
          drawTableHeader();
          rowCount = 0;
        }

        // Fundo alternado
        if (rowCount % 2 === 0) {
          doc.setFillColor(248, 250, 252);
        } else {
          doc.setFillColor(255, 255, 255);
        }
        doc.rect(margin, yPos, tableWidth, rowH, 'F');

        // Borda esquerda colorida por tipo
        if (t.type === 'income') {
          doc.setFillColor(22, 163, 74);
        } else {
          doc.setFillColor(220, 38, 38);
        }
        doc.rect(margin, yPos, 1.5, rowH, 'F');

        doc.setFontSize(6.5);
        doc.setFont(undefined, 'normal');

        // DATA
        doc.setTextColor(71, 85, 105);
        doc.text(formatDisplayDate(t.transaction_date), colPos.data + 2, yPos + 4.5);

        // TIPO badge
        if (t.type === 'income') {
          doc.setTextColor(21, 128, 61);
          doc.setFont(undefined, 'bold');
        } else {
          doc.setTextColor(185, 28, 28);
          doc.setFont(undefined, 'bold');
        }
        doc.text(t.type === 'income' ? 'Entrada' : 'Saída', colPos.tipo + 1.5, yPos + 4.5);
        doc.setFont(undefined, 'normal');

        // DESCRIÇÃO
        doc.setTextColor(30, 41, 59);
        doc.text(descLines, colPos.descricao + 1.5, yPos + 4.5);

        // CATEGORIA
        doc.setTextColor(100, 116, 139);
        doc.text(t.category ? t.category.replace('_', ' ') : '—', colPos.categoria + 1.5, yPos + 4.5);

        // FONTE
        doc.setTextColor(71, 85, 105);
        doc.text(fonteLines, colPos.fonte + 1.5, yPos + 4.5);

        // ORIGEM
        if (includeOrigin) {
          doc.setTextColor(99, 102, 241);
          doc.setFont(undefined, origemTxt !== '—' ? 'bold' : 'normal');
          doc.text(origemTxt, colPos.origem + 1.5, yPos + 4.5);
          doc.setFont(undefined, 'normal');
        }

        // VALOR (alinhado à direita)
        const valorStr = formatCurrencyBR(t.amount);
        const valorX = colPos.valor + colWidths.valor - 2;
        if (t.type === 'income') doc.setTextColor(21, 128, 61);
        else doc.setTextColor(185, 28, 28);
        doc.setFont(undefined, 'bold');
        doc.text(valorStr, valorX, yPos + 4.5, { align: 'right' });
        doc.setFont(undefined, 'normal');

        // SALDO LÍQUIDO (saldo acumulado, alinhado à direita)
        const liquidoStr = formatCurrencyBR(t.saldoLiquido);
        const liquidoX = colPos.liquido + colWidths.liquido - 2;
        if (t.saldoLiquido < 0) doc.setTextColor(185, 28, 28);
        else doc.setTextColor(67, 56, 202);
        doc.setFont(undefined, 'bold');
        doc.text(liquidoStr, liquidoX, yPos + 4.5, { align: 'right' });
        doc.setFont(undefined, 'normal');

        // Separador inferior
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.15);
        doc.line(margin, yPos + rowH, pageWidth - margin, yPos + rowH);

        yPos += rowH;
        rowCount++;
      }

      // ── Rodapé da última página
      doc.setFillColor(13, 18, 33);
      doc.rect(0, pageHeight - 10, pageWidth, 10, 'F');
      doc.setFontSize(6.5);
      doc.setFont(undefined, 'bold');

      doc.setTextColor(134, 239, 172);
      doc.text(`Entradas: ${formatCurrencyBR(totals.income)}`, margin + 2, pageHeight - 4);
      doc.setTextColor(252, 165, 165);
      doc.text(`Saídas: ${formatCurrencyBR(totals.expense)}`, margin + 55, pageHeight - 4);
      const isPositive = totals.balance >= 0;
      doc.setTextColor(isPositive ? 196 : 253, isPositive ? 181 : 186, isPositive ? 253 : 12);
      doc.text(`Saldo Líquido: ${formatCurrencyBR(totals.balance)}`, margin + 108, pageHeight - 4);
      doc.setTextColor(100, 116, 139);
      doc.setFont(undefined, 'normal');
      doc.text(`Página ${doc.internal.pages.length - 1}`, pageWidth - margin, pageHeight - 4, { align: 'right' });

      doc.save(`relatorio-fluxo-caixa-${filters.startDate}-a-${filters.endDate}.pdf`);
    } catch (err) {
      console.error('Error exporting to PDF:', err);
      alert('Erro ao exportar para PDF. Verifique o console para mais detalhes.');
    } finally {
      setExporting('none');
    }
  }, [transactions, transactionsWithBalance, totals, filters, formatDisplayDate]);

  // ─── EXCEL EXPORT ─────────────────────────────────────────────────────────────
  const exportToExcel = useCallback(() => {
    if (transactions.length === 0 && invoices.length === 0) { alert('Não há dados para exportar'); return; }
    setExporting('excel');
    try {
      const workbook = XLSX.utils.book_new();
      const summaryData = [
        ['RELATÓRIO DE FLUXO DE CAIXA'],
        [`Data de geração: ${new Date().toLocaleString('pt-BR')}`],
        [`Período: ${formatDisplayDate(filters.startDate)} a ${formatDisplayDate(filters.endDate)}`],
        [''],
        ['RESUMO FINANCEIRO'],
        ['Indicador', 'Valor'],
        ['Total de Entradas', formatCurrencyBR(totals.income)],
        ['Total de Saídas', formatCurrencyBR(totals.expense)],
        ['Saldo do Período', formatCurrencyBR(totals.balance)],
        ['Saldo Líquido Acumulado (final)', formatCurrencyBR(totals.balance)],
        [''],
        ['ESTATÍSTICAS'],
        ['Total de Transações', transactions.length],
        ['Total de Entradas', transactions.filter(t => t.type === 'income').length],
        ['Total de Saídas', transactions.filter(t => t.type === 'expense').length],
        [''],
        ['DESPESAS POR ORIGEM'],
        ['Origem', 'Valor'],
        ['IDHS', formatCurrencyBR(statistics.expensesByOrigin.idhs)],
        ['Geral', formatCurrencyBR(statistics.expensesByOrigin.geral)],
        ['Outras', formatCurrencyBR(statistics.expensesByOrigin.outros)],
        [''],
        ['DESPESAS POR CATEGORIA'],
        ...Object.entries(statistics.expensesByCategory).map(([c, v]) => [c.replace('_', ' '), formatCurrencyBR(v)]),
        [''],
        ['DESPESAS POR MÉTODO'],
        ...Object.entries(statistics.expensesByMethod).map(([m, v]) => [m, formatCurrencyBR(v)]),
      ];
      const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
      summarySheet['!cols'] = [{ wch: 34 }, { wch: 20 }];
      XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumo Executivo');

      const includeOrigin = filters.includeOrigin;
      const transactionsData = transactionsWithBalance.map(t => {
        const base: any = {
          Data: formatDisplayDate(t.transaction_date),
          Tipo: t.type === 'income' ? 'Entrada' : 'Saída',
          Descrição: t.description,
          Categoria: t.category ? t.category.replace('_', ' ') : '-',
          'Fonte/Fornecedor': t.type === 'income' ? t.fonte_pagadora || '-' : t.fornecedor || '-',
          'Valor (R$)': t.amount,
        };
        if (includeOrigin) base.Origem = t.type === 'expense' ? (t.idhs ? 'IDHS' : t.geral ? 'Geral' : '-') : '-';
        base['Valor Líquido (R$)'] = t.saldoLiquido;
        return base;
      });
      const transactionsSheet = XLSX.utils.json_to_sheet(transactionsData);
      transactionsSheet['!cols'] = includeOrigin
        ? [{ wch: 12 }, { wch: 10 }, { wch: 50 }, { wch: 20 }, { wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 18 }]
        : [{ wch: 12 }, { wch: 10 }, { wch: 50 }, { wch: 20 }, { wch: 25 }, { wch: 15 }, { wch: 18 }];
      XLSX.utils.book_append_sheet(workbook, transactionsSheet, 'Transações');

      if (invoices.length > 0 && filters.includeInvoices) {
        const invoicesData = invoices.map(inv => ({
          'Número NF': inv.invoice_number,
          'Unidade': inv.unit_name,
          'Data Emissão': formatDisplayDate(inv.issue_date),
          'Data Vencimento': formatDisplayDate(inv.due_date),
          'Valor (R$)': inv.net_value,
          'Status': inv.payment_status,
          'Data Pagamento': inv.payment_date ? formatDisplayDate(inv.payment_date) : '-',
          'Valor Pago (R$)': inv.paid_value || '-',
        }));
        const invoicesSheet = XLSX.utils.json_to_sheet(invoicesData);
        invoicesSheet['!cols'] = [{ wch: 15 }, { wch: 25 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 15 }];
        XLSX.utils.book_append_sheet(workbook, invoicesSheet, 'Notas Fiscais');
      }
      XLSX.writeFile(workbook, `relatorio-fluxo-caixa-${filters.startDate}-a-${filters.endDate}.xlsx`);
    } catch (err) {
      console.error('Error exporting to Excel:', err);
      alert('Erro ao exportar para Excel.');
    } finally {
      setExporting('none');
    }
  }, [transactions, transactionsWithBalance, invoices, totals, statistics, filters, formatDisplayDate]);

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

  const incomeCount = transactions.filter(t => t.type === 'income').length;
  const expenseCount = transactions.filter(t => t.type === 'expense').length;

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
                <BarChart2 className="w-5 h-5 text-indigo-300" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white leading-tight tracking-tight">Fluxo de Caixa</h3>
                <p className="text-xs text-slate-400 mt-0.5">Movimentações financeiras e saldo líquido do período</p>
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
                <span className="text-sm font-medium text-slate-700">Filtros Avançados</span>
                {Object.values(filters).some(v =>
                  v !== 'all' && v !== false &&
                  !(typeof v === 'string' && (v === filters.startDate || v === filters.endDate))
                ) && (
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
                  {/* Data Inicial */}
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                      <Calendar className="w-3.5 h-3.5" /> Data Inicial
                    </label>
                    <input
                      type="date"
                      value={filters.startDate}
                      onChange={e => { setFilters({ ...filters, startDate: e.target.value }); setError(null); }}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow"
                    />
                  </div>

                  {/* Data Final */}
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                      <Calendar className="w-3.5 h-3.5" /> Data Final
                    </label>
                    <input
                      type="date"
                      value={filters.endDate}
                      onChange={e => { setFilters({ ...filters, endDate: e.target.value }); setError(null); }}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow"
                    />
                  </div>

                  {/* Tipo */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Tipo</label>
                    <select
                      value={filters.type}
                      onChange={e => {
                        setFilters({
                          ...filters,
                          type: e.target.value as Filters['type'],
                          ...(e.target.value === 'income' && { category: 'all', documentType: 'all', origem: 'all' }),
                        });
                        setError(null);
                      }}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    >
                      <option value="all">Todos</option>
                      <option value="income">Apenas Entradas</option>
                      <option value="expense">Apenas Saídas</option>
                    </select>
                  </div>

                  {/* Checkboxes */}
                  <div className="flex flex-col justify-end gap-2.5">
                    <label className="flex items-center gap-2.5 cursor-pointer group">
                      <div className="relative">
                        <input
                          type="checkbox"
                          checked={filters.includeInvoices}
                          onChange={e => setFilters({ ...filters, includeInvoices: e.target.checked })}
                          className="sr-only"
                        />
                        <div className={`w-8 h-4 rounded-full transition-colors ${filters.includeInvoices ? 'bg-indigo-500' : 'bg-slate-300'}`}>
                          <div className={`w-3 h-3 bg-white rounded-full shadow-sm mt-0.5 transition-transform ${filters.includeInvoices ? 'translate-x-4' : 'translate-x-0.5'}`} />
                        </div>
                      </div>
                      <span className="text-sm text-slate-600 group-hover:text-slate-800">Notas Fiscais</span>
                    </label>
                    <label className="flex items-center gap-2.5 cursor-pointer group">
                      <div className="relative">
                        <input
                          type="checkbox"
                          checked={filters.includeOrigin}
                          onChange={e => setFilters({ ...filters, includeOrigin: e.target.checked })}
                          className="sr-only"
                        />
                        <div className={`w-8 h-4 rounded-full transition-colors ${filters.includeOrigin ? 'bg-indigo-500' : 'bg-slate-300'}`}>
                          <div className={`w-3 h-3 bg-white rounded-full shadow-sm mt-0.5 transition-transform ${filters.includeOrigin ? 'translate-x-4' : 'translate-x-0.5'}`} />
                        </div>
                      </div>
                      <span className="text-sm text-slate-600 group-hover:text-slate-800">Incluir Origem</span>
                    </label>
                  </div>
                </div>

                {/* Filtros secundários */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Categoria</label>
                    <select
                      value={filters.category}
                      onChange={e => setFilters({ ...filters, category: e.target.value as Filters['category'] })}
                      disabled={filters.type === 'income'}
                      className={`w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${filters.type === 'income' ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <option value="all">Todas</option>
                      <option value="despesas_fixas">Despesas Fixas</option>
                      <option value="despesas_variaveis">Despesas Variáveis</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Documento</label>
                    <select
                      value={filters.documentType}
                      onChange={e => setFilters({ ...filters, documentType: e.target.value as Filters['documentType'] })}
                      disabled={filters.type === 'income'}
                      className={`w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${filters.type === 'income' ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <option value="all">Todos</option>
                      <option value="com_nota">Com Nota</option>
                      <option value="so_recibo">Só Recibo</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Origem</label>
                    <select
                      value={filters.origem}
                      onChange={e => setFilters({ ...filters, origem: e.target.value as Filters['origem'] })}
                      disabled={filters.type === 'income'}
                      className={`w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${filters.type === 'income' ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <option value="all">Todas</option>
                      <option value="idhs">IDHS</option>
                      <option value="geral">Geral</option>
                      <option value="nenhuma">Sem origem</option>
                    </select>
                  </div>
                </div>

                {/* Erro */}
                {error && (
                  <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
                    <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-600">{error}</p>
                  </div>
                )}

                {/* Ações dos filtros */}
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
            {transactions.length > 0 && (
              <>
                {/* Botões de exportação + timestamp */}
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
                  {lastQueryTime && (
                    <span className="ml-auto text-xs text-slate-400 flex items-center gap-1.5">
                      <RefreshCw className="w-3 h-3" />
                      Atualizado às {lastQueryTime.toLocaleTimeString('pt-BR')}
                    </span>
                  )}
                </div>

                {/* Cards de resumo */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Entradas */}
                  <div className="relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-green-500" />
                    <div className="flex items-start justify-between mb-3 pl-2">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Entradas</p>
                      <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center">
                        <TrendingUp className="w-4 h-4 text-green-600" />
                      </div>
                    </div>
                    <p className="text-2xl font-bold text-slate-800 pl-2">{formatCurrencyBR(totals.income)}</p>
                    <p className="text-xs text-slate-400 mt-2 pl-2">{incomeCount} transaç{incomeCount === 1 ? 'ão' : 'ões'}</p>
                  </div>

                  {/* Saídas */}
                  <div className="relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500" />
                    <div className="flex items-start justify-between mb-3 pl-2">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Saídas</p>
                      <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
                        <TrendingDown className="w-4 h-4 text-red-600" />
                      </div>
                    </div>
                    <p className="text-2xl font-bold text-slate-800 pl-2">{formatCurrencyBR(totals.expense)}</p>
                    <p className="text-xs text-slate-400 mt-2 pl-2">{expenseCount} transaç{expenseCount === 1 ? 'ão' : 'ões'}</p>
                  </div>

                  {/* Saldo do período */}
                  <div className="relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                    <div className={`absolute left-0 top-0 bottom-0 w-1 ${totals.balance >= 0 ? 'bg-blue-500' : 'bg-amber-500'}`} />
                    <div className="flex items-start justify-between mb-3 pl-2">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Saldo do Período</p>
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${totals.balance >= 0 ? 'bg-blue-50' : 'bg-amber-50'}`}>
                        <DollarSign className={`w-4 h-4 ${totals.balance >= 0 ? 'text-blue-600' : 'text-amber-600'}`} />
                      </div>
                    </div>
                    <p className="text-2xl font-bold text-slate-800 pl-2">{formatCurrencyBR(totals.balance)}</p>
                    <p className={`text-xs mt-2 pl-2 ${totals.balance >= 0 ? 'text-blue-500' : 'text-amber-500'}`}>
                      {totals.balance >= 0 ? 'Resultado positivo' : 'Resultado negativo'}
                    </p>
                  </div>

                  {/* Saldo líquido acumulado (final) */}
                  <div className="relative overflow-hidden rounded-2xl border border-indigo-100 bg-indigo-50/40 p-5 shadow-sm">
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500" />
                    <div className="flex items-start justify-between mb-3 pl-2">
                      <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">Saldo Líquido Final</p>
                      <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                        <Scale className="w-4 h-4 text-indigo-600" />
                      </div>
                    </div>
                    <p className="text-2xl font-bold text-indigo-800 pl-2">{formatCurrencyBR(totals.balance)}</p>
                    <p className="text-xs text-indigo-500 mt-2 pl-2">Acumulado até {formatDisplayDate(filters.endDate)}</p>
                  </div>
                </div>

                {/* Estatísticas por origem e categoria */}
                {transactions.some(t => t.type === 'expense') && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-2xl border border-slate-100 bg-white p-5">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Despesas por Origem</p>
                      <div className="space-y-3">
                        {[
                          { label: 'IDHS', value: statistics.expensesByOrigin.idhs, color: 'bg-violet-500' },
                          { label: 'Geral', value: statistics.expensesByOrigin.geral, color: 'bg-blue-500' },
                          { label: 'Outros', value: statistics.expensesByOrigin.outros, color: 'bg-slate-300' },
                        ].map(item => {
                          const pct = totals.expense > 0 ? (item.value / totals.expense) * 100 : 0;
                          return (
                            <div key={item.label}>
                              <div className="flex justify-between items-center mb-1">
                                <span className="text-sm text-slate-600">{item.label}</span>
                                <span className="text-sm font-semibold text-slate-800">{formatCurrencyBR(item.value)}</span>
                              </div>
                              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div className={`h-full ${item.color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-100 bg-white p-5">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Despesas por Categoria</p>
                      <div className="space-y-3 max-h-36 overflow-y-auto pr-1">
                        {Object.entries(statistics.expensesByCategory).map(([cat, val]) => {
                          const pct = totals.expense > 0 ? (val / totals.expense) * 100 : 0;
                          return (
                            <div key={cat}>
                              <div className="flex justify-between items-center mb-1">
                                <span className="text-sm text-slate-600 capitalize">{cat.replace(/_/g, ' ')}</span>
                                <span className="text-sm font-semibold text-slate-800">{formatCurrencyBR(val)}</span>
                              </div>
                              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full bg-rose-400 rounded-full" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* Tabela de transações */}
                <div className="rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                  {/* Cabeçalho da tabela */}
                  <div className="overflow-x-auto" style={{ maxHeight: '420px' }}>
                    <table className="w-full min-w-[880px] text-sm">
                      <thead>
                        <tr className="bg-slate-900 text-slate-300">
                          <th className="sticky top-0 z-10 bg-slate-900 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider whitespace-nowrap">Data</th>
                          <th className="sticky top-0 z-10 bg-slate-900 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider whitespace-nowrap">Tipo</th>
                          <th className="sticky top-0 z-10 bg-slate-900 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">Descrição</th>
                          <th className="sticky top-0 z-10 bg-slate-900 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider whitespace-nowrap">Categoria</th>
                          <th className="sticky top-0 z-10 bg-slate-900 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider whitespace-nowrap">Fonte / Fornecedor</th>
                          {filters.includeOrigin && (
                            <th className="sticky top-0 z-10 bg-slate-900 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider whitespace-nowrap">Origem</th>
                          )}
                          <th className="sticky top-0 z-10 bg-slate-900 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider whitespace-nowrap">Valor</th>
                          <th className="sticky top-0 z-10 bg-slate-900 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider whitespace-nowrap border-l border-slate-700">
                            Valor Líquido
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {transactionsWithBalance.map((t, idx) => {
                          const origem = t.type === 'expense'
                            ? t.idhs ? 'IDHS' : t.geral ? 'Geral' : '—'
                            : '—';
                          return (
                            <tr
                              key={t.id}
                              className={`group hover:bg-indigo-50/40 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}
                            >
                              {/* Borda colorida esquerda via box-shadow no primeiro td */}
                              <td className={`px-4 py-3 whitespace-nowrap text-xs font-mono text-slate-500 border-l-2 ${t.type === 'income' ? 'border-l-green-400' : 'border-l-red-400'}`}>
                                {formatDisplayDate(t.transaction_date)}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold ${
                                  t.type === 'income' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                }`}>
                                  {t.type === 'income' ? '↑ Entrada' : '↓ Saída'}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-sm text-slate-700 max-w-xs">
                                <span className="block truncate" title={t.description}>{t.description}</span>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-500 capitalize">
                                {t.category ? t.category.replace(/_/g, ' ') : '—'}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-600">
                                {t.type === 'income' ? t.fonte_pagadora || '—' : t.fornecedor || '—'}
                              </td>
                              {filters.includeOrigin && (
                                <td className="px-4 py-3 whitespace-nowrap">
                                  {origem !== '—'
                                    ? <span className="px-2 py-0.5 bg-violet-100 text-violet-700 text-xs font-medium rounded-md">{origem}</span>
                                    : <span className="text-xs text-slate-400">—</span>}
                                </td>
                              )}
                              <td className={`px-4 py-3 whitespace-nowrap text-sm text-right font-semibold ${
                                t.type === 'income' ? 'text-green-600' : 'text-red-600'
                              }`}>
                                {formatCurrencyBR(t.amount)}
                              </td>
                              <td className={`px-4 py-3 whitespace-nowrap text-sm text-right font-mono font-semibold border-l border-slate-100 ${
                                t.saldoLiquido >= 0 ? 'text-indigo-700' : 'text-red-600'
                              }`}>
                                {formatCurrencyBR(t.saldoLiquido)}
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
                      <span className="text-slate-200 font-semibold">{transactions.length}</span> transações encontradas
                    </span>
                    <div className="flex items-center gap-4 text-xs">
                      <span className="text-green-400 font-medium">↑ {formatCurrencyBR(totals.income)}</span>
                      <span className="text-red-400 font-medium">↓ {formatCurrencyBR(totals.expense)}</span>
                      <span className={`font-semibold ${totals.balance >= 0 ? 'text-blue-300' : 'text-amber-300'}`}>
                        = {formatCurrencyBR(totals.balance)}
                      </span>
                      <span className="font-semibold text-indigo-300 border-l border-slate-700 pl-4">
                        Líquido: {formatCurrencyBR(totals.balance)}
                      </span>
                      <span className="text-slate-500">
                        {formatDisplayDate(filters.startDate)} — {formatDisplayDate(filters.endDate)}
                      </span>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Empty state */}
            {!loading && transactions.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                  <BarChart2 className="w-8 h-8 text-slate-300" />
                </div>
                <p className="font-semibold text-slate-600 mb-1">Nenhuma transação encontrada</p>
                <p className="text-sm text-slate-400">
                  Para o período {formatDisplayDate(filters.startDate)} — {formatDisplayDate(filters.endDate)}
                </p>
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
