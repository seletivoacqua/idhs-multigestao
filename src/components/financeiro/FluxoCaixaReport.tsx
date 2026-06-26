import { useState, useEffect, useMemo, useCallback } from 'react';
import { X, FileDown, FileSpreadsheet, AlertCircle, Filter, Calendar, TrendingUp, TrendingDown, DollarSign, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';
import logoImg from '../../assets/image.png';
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
  includeOrigin: boolean; // Novo campo
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
    includeOrigin: true, // Valor padrão: true para manter compatibilidade
  });

  // Validar e ajustar datas
  const validateDates = useCallback((): boolean => {
    if (filters.startDate > filters.endDate) {
      setError('Data inicial não pode ser maior que data final');
      return false;
    }
    return true;
  }, [filters.startDate, filters.endDate]);

  // Buscar transações com paginação e sem limites
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

      if (filters.type !== 'all') {
        query = query.eq('type', filters.type);
      }

      if (filters.category !== 'all' && (filters.type === 'all' || filters.type === 'expense')) {
        query = query.eq('category', filters.category);
      }

      if (filters.documentType !== 'all' && (filters.type === 'all' || filters.type === 'expense')) {
        if (filters.documentType === 'com_nota') {
          query = query.eq('com_nota', true);
        } else if (filters.documentType === 'so_recibo') {
          query = query.eq('so_recibo', true);
        }
      }

      if (filters.origem !== 'all' && (filters.type === 'all' || filters.type === 'expense')) {
        if (filters.origem === 'idhs') {
          query = query.eq('idhs', true);
        } else if (filters.origem === 'geral') {
          query = query.eq('geral', true);
        } else if (filters.origem === 'nenhuma') {
          query = query.or('idhs.is.null,idhs.eq.false,and(geral.is.null,geral.eq.false)');
        }
      }

      const { data, error: queryError } = await query;

      if (queryError) {
        console.error('Error fetching transactions:', queryError);
        throw new Error(`Erro ao buscar transações: ${queryError.message}`);
      }

      if (!data || data.length === 0) {
        hasMore = false;
      } else {
        allData = [...allData, ...data];
        page++;
        
        if (data.length < pageSize) {
          hasMore = false;
        }
      }
    }

    return allData;
  }, [filters]);

  // Buscar notas fiscais relacionadas
  const fetchInvoices = useCallback(async (startDate: string, endDate: string) => {
    if (!filters.includeInvoices) return [];

    const { data, error: invoiceError } = await supabase
      .from('invoices')
      .select('id, net_value, issue_date, due_date, payment_status, payment_date, paid_value, invoice_number, unit_name')
      .gte('issue_date', startDate)
      .lte('issue_date', endDate)
      .order('issue_date', { ascending: false });

    if (invoiceError) {
      console.error('Error fetching invoices:', invoiceError);
      return [];
    }

    return data || [];
  }, [filters.includeInvoices]);

  // Geração do relatório com busca completa
  const handleGenerateReport = useCallback(async () => {
    if (!user) {
      setError('Usuário não autenticado');
      return;
    }

    if (!validateDates()) return;

    setLoading(true);
    setError(null);

    try {
      const startDate = filters.startDate;
      const endDate = filters.endDate;
      
      console.log('📊 Buscando transações de:', startDate, 'até', endDate);
      console.log('📋 Filtros aplicados:', filters);

      const transactionsData = await fetchAllTransactions(startDate, endDate);
      
      console.log(`✅ Encontradas ${transactionsData.length} transações`);

      const invoicesData = await fetchInvoices(startDate, endDate);
      
      if (invoicesData.length > 0) {
        console.log(`📄 Encontradas ${invoicesData.length} notas fiscais`);
      }

      const processedTransactions = transactionsData.map(transaction => ({
        ...transaction,
        amount: Number(transaction.amount),
        com_nota: transaction.com_nota === true,
        so_recibo: transaction.so_recibo === true,
        idhs: transaction.idhs === true,
        geral: transaction.geral === true,
      }));

      setTransactions(processedTransactions);
      setInvoices(invoicesData);
      setLastQueryTime(new Date());
      
      if (processedTransactions.length === 0 && invoicesData.length === 0) {
        setError('Nenhuma transação ou nota fiscal encontrada no período selecionado');
      }
    } catch (error) {
      console.error('❌ Erro ao gerar relatório:', error);
      setError(error instanceof Error ? error.message : 'Erro ao gerar relatório');
    } finally {
      setLoading(false);
    }
  }, [user, filters, validateDates, fetchAllTransactions, fetchInvoices]);

  // Formatação de data
  const formatDisplayDate = useCallback((dateString: string): string => {
    try {
      const datePart = dateString.split('T')[0];
      const [year, month, day] = datePart.split('-');
      return `${day}/${month}/${year}`;
    } catch (error) {
      console.error('Error formatting date:', error);
      return dateString;
    }
  }, []);

  // Carregar relatório inicial
  useEffect(() => {
    if (user) {
      handleGenerateReport().finally(() => setInitialLoading(false));
    }
  }, [user, handleGenerateReport]);

  // Cálculos com useMemo
  const totals = useMemo(() => {
    const income = transactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);
    
    const expense = transactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);
    
    const invoiceTotal = invoices.reduce((sum, inv) => sum + inv.net_value, 0);
    
    const balance = income - expense;
    
    return { income, expense, balance, invoiceTotal };
  }, [transactions, invoices]);

  const statistics = useMemo(() => {
    const expensesByCategory = transactions
      .filter(t => t.type === 'expense')
      .reduce((acc, t) => {
        const category = t.category || 'sem_categoria';
        acc[category] = (acc[category] || 0) + t.amount;
        return acc;
      }, {} as Record<string, number>);

    const expensesByOrigin = {
      idhs: transactions.filter(t => t.type === 'expense' && t.idhs).reduce((sum, t) => sum + t.amount, 0),
      geral: transactions.filter(t => t.type === 'expense' && t.geral).reduce((sum, t) => sum + t.amount, 0),
      outros: transactions.filter(t => t.type === 'expense' && !t.idhs && !t.geral).reduce((sum, t) => sum + t.amount, 0),
    };

    const expensesByMethod = transactions
      .filter(t => t.type === 'expense')
      .reduce((acc, t) => {
        acc[t.method] = (acc[t.method] || 0) + t.amount;
        return acc;
      }, {} as Record<string, number>);

    return { expensesByCategory, expensesByOrigin, expensesByMethod };
  }, [transactions]);

  // Reset de filtros
  const resetFilters = useCallback(() => {
    setFilters({
      startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0],
      type: 'all',
      documentType: 'all',
      category: 'all',
      origem: 'all',
      includeInvoices: false,
      includeOrigin: true,
    });
    setError(null);
  }, []);

  // Exportação para PDF com 8 ou 7 colunas dependendo do checkbox
// Exportação para PDF com 8 ou 7 colunas dependendo do checkbox
const exportToPDF = useCallback(async () => {
  if (transactions.length === 0 && invoices.length === 0) {
    alert('Não há dados para exportar');
    return;
  }
  
  setExporting('pdf');
  
  try {
    const doc = new jsPDF({ 
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });
    
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 8;
    let yPos = 20;
    
    // Adicionar logo
    try {
      const logoWidth = 35;
      const logoHeight = 17;
      const logoX = (pageWidth - logoWidth) / 2;
      doc.addImage(logoImg, 'PNG', logoX, 5, logoWidth, logoHeight);
      yPos = 28;
    } catch (imgError) {
      console.warn('Error adding logo to PDF:', imgError);
      yPos = 20;
    }

    // Título
    doc.setFontSize(18);
    doc.setTextColor(33, 33, 33);
    doc.setFont(undefined, 'bold');
    doc.text('RELATÓRIO DE FLUXO DE CAIXA', pageWidth / 2, yPos, { align: 'center' });
    yPos += 7;

    // Período
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.setFont(undefined, 'normal');
    doc.text(
      `Período: ${formatDisplayDate(filters.startDate)} a ${formatDisplayDate(filters.endDate)}`,
      pageWidth / 2,
      yPos,
      { align: 'center' }
    );
    yPos += 6;

    // Data da geração
    doc.setFontSize(8);
    doc.text(
      `Gerado em: ${new Date().toLocaleString('pt-BR')}`,
      pageWidth - margin,
      10,
      { align: 'right' }
    );

    // Cards de resumo
    const cardWidth = (pageWidth - (margin * 2) - 8) / 3;
    const cardHeight = 20;
    const cardSpacing = 4;
    
    // Card Entradas
    doc.setFillColor(220, 255, 220);
    doc.rect(margin, yPos, cardWidth, cardHeight, 'F');
    doc.setFontSize(9);
    doc.setTextColor(0, 100, 0);
    doc.setFont(undefined, 'bold');
    doc.text('Total Entradas', margin + 3, yPos + 6);
    doc.setFontSize(11);
    doc.text(formatCurrencyBR(totals.income), margin + 3, yPos + 15);
    
    // Card Saídas
    doc.setFillColor(255, 220, 220);
    doc.rect(margin + cardWidth + cardSpacing, yPos, cardWidth, cardHeight, 'F');
    doc.setTextColor(200, 0, 0);
    doc.setFontSize(9);
    doc.text('Total Saídas', margin + cardWidth + cardSpacing + 3, yPos + 6);
    doc.setFontSize(11);
    doc.text(formatCurrencyBR(totals.expense), margin + cardWidth + cardSpacing + 3, yPos + 15);
    
    // Card Saldo
    const balanceColor = totals.balance >= 0 ? [0, 100, 0] : [200, 0, 0];
    doc.setFillColor(totals.balance >= 0 ? 230 : 255, totals.balance >= 0 ? 255 : 230, totals.balance >= 0 ? 230 : 230);
    doc.rect(margin + (cardWidth + cardSpacing) * 2, yPos, cardWidth, cardHeight, 'F');
    doc.setTextColor(balanceColor[0], balanceColor[1], balanceColor[2]);
    doc.setFontSize(9);
    doc.text('Saldo', margin + (cardWidth + cardSpacing) * 2 + 3, yPos + 6);
    doc.setFontSize(11);
    doc.text(formatCurrencyBR(totals.balance), margin + (cardWidth + cardSpacing) * 2 + 3, yPos + 15);
    
    yPos += cardHeight + 10;
    
    // Configuração das colunas - DINÂMICO baseado no includeOrigin
    const includeOrigin = filters.includeOrigin;
    const tableWidth = pageWidth - (margin * 2);
    
    // Definir larguras das colunas - AJUSTADAS para caber na página
    let colWidths: any;
    
    if (includeOrigin) {
      // 8 colunas (com origem) - AJUSTADO
      colWidths = {
        data: 20,
        tipo: 16,
        descricao: 45,
        categoria: 22,
        fonte: 32,
        origem: 16,
        metodo: 20,
        valor: 26
      };
    } else {
      // 7 colunas (sem origem) - AJUSTADO
      colWidths = {
        data: 22,
        tipo: 18,
        descricao: 52,
        categoria: 26,
        fonte: 36,
        metodo: 22,
        valor: 28
      };
    }

    // Verificar se a soma das larguras não excede a largura da tabela
    const totalWidth = Object.values(colWidths).reduce((sum: number, w: number) => sum + w, 0);
    const gap = 1.5; // Reduzido o gap
    const totalWithGaps = totalWidth + (Object.keys(colWidths).length - 1) * gap;
    
    // Se exceder, ajustar proporcionalmente
    if (totalWithGaps > tableWidth) {
      const scaleFactor = (tableWidth - (Object.keys(colWidths).length - 1) * gap) / totalWidth;
      Object.keys(colWidths).forEach(key => {
        colWidths[key] = Math.floor(colWidths[key] * scaleFactor);
      });
    }
    
    // Calcular posições das colunas
    const colPositions: any = {};
    let currentX = margin;
    Object.keys(colWidths).forEach((key, index) => {
      colPositions[key] = currentX;
      currentX += colWidths[key] + gap;
    });

    // Função para desenhar cabeçalho
    const drawTableHeader = () => {
      doc.setFillColor(37, 99, 235);
      doc.setTextColor(255, 255, 255);
      doc.setFont(undefined, 'bold');
      doc.setFontSize(7);

      const headers = includeOrigin ? [
        { key: 'data', label: 'DATA' },
        { key: 'tipo', label: 'TIPO' },
        { key: 'descricao', label: 'DESCRIÇÃO' },
        { key: 'categoria', label: 'CATEGORIA' },
        { key: 'fonte', label: 'FONTE/FORNECEDOR' },
        { key: 'origem', label: 'ORIGEM' },
        { key: 'metodo', label: 'MÉTODO' },
        { key: 'valor', label: 'VALOR (R$)' },
      ] : [
        { key: 'data', label: 'DATA' },
        { key: 'tipo', label: 'TIPO' },
        { key: 'descricao', label: 'DESCRIÇÃO' },
        { key: 'categoria', label: 'CATEGORIA' },
        { key: 'fonte', label: 'FONTE/FORNECEDOR' },
        { key: 'metodo', label: 'MÉTODO' },
        { key: 'valor', label: 'VALOR (R$)' },
      ];

      const headerHeight = 8;
      headers.forEach((header) => {
        const x = colPositions[header.key];
        const width = colWidths[header.key];

        doc.rect(x, yPos, width, headerHeight, 'F');
        doc.text(
          header.label,
          x + 1,
          yPos + 5.5
        );
      });

      yPos += headerHeight;
      doc.setTextColor(0, 0, 0);
      doc.setFont(undefined, 'normal');
      doc.setFontSize(6.5);
    };

    drawTableHeader();

    // Dados da tabela
    let rowCount = 0;

    for (const transaction of transactions) {
      // Nova página
      if (yPos > pageHeight - 15) {
        doc.addPage();
        yPos = 15;
        drawTableHeader();
      }

      const origemTexto =
        transaction.type === 'expense'
          ? transaction.idhs
            ? 'IDHS'
            : transaction.geral
            ? 'Geral'
            : '-'
          : '-';

      const fonteTexto =
        transaction.type === 'income'
          ? transaction.fonte_pagadora || '-'
          : transaction.fornecedor || '-';

      const tipoTexto =
        transaction.type === 'income'
          ? 'Entrada'
          : 'Saída';

      const categoriaTexto =
        transaction.category
          ? transaction.category.replace('_', ' ')
          : '-';

      // Quebra de linhas - AJUSTADO para textos mais longos
      const descricaoLines = doc.splitTextToSize(
        transaction.description || '-',
        colWidths.descricao - 3
      );

      const fonteLines = doc.splitTextToSize(
        fonteTexto,
        colWidths.fonte - 3
      );

      const maxLines = Math.max(
        descricaoLines.length,
        fonteLines.length,
        1
      );

      const rowHeight = Math.max((maxLines * 3.5) + 3, 6);

      // Fundo alternado
      if (rowCount % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(
          margin,
          yPos - 2,
          tableWidth,
          rowHeight,
          'F'
        );
      }

      // DATA
      doc.text(
        formatDisplayDate(transaction.transaction_date),
        colPositions.data + 1,
        yPos + 3
      );

      // TIPO
      if (transaction.type === 'expense') {
        doc.setTextColor(220, 38, 38);
      } else {
        doc.setTextColor(22, 163, 74);
      }
      doc.text(
        tipoTexto,
        colPositions.tipo + 1,
        yPos + 3
      );
      doc.setTextColor(0, 0, 0);

      // DESCRIÇÃO
      doc.text(
        descricaoLines,
        colPositions.descricao + 1,
        yPos + 3
      );

      // CATEGORIA
      doc.text(
        categoriaTexto,
        colPositions.categoria + 1,
        yPos + 3
      );

      // FONTE/FORNECEDOR
      doc.text(
        fonteLines,
        colPositions.fonte + 1,
        yPos + 3
      );

      // ORIGEM (se incluído)
      if (includeOrigin) {
        doc.text(
          origemTexto,
          colPositions.origem + 1,
          yPos + 3
        );
      }

      // MÉTODO
      doc.text(
        transaction.method || '-',
        colPositions.metodo + 1,
        yPos + 3
      );

      // VALOR
      if (transaction.type === 'expense') {
        doc.setTextColor(220, 38, 38);
      } else {
        doc.setTextColor(22, 163, 74);
      }
      const valorStr = formatCurrencyBR(transaction.amount);
      const valorX = colPositions.valor + colWidths.valor - doc.getStringUnitWidth(valorStr) * 6.5 / doc.internal.scaleFactor - 1;
      doc.text(
        valorStr,
        valorX,
        yPos + 3
      );
      doc.setTextColor(0, 0, 0);

      // Borda inferior
      doc.setDrawColor(230, 230, 230);
      doc.line(
        margin,
        yPos + rowHeight - 1,
        pageWidth - margin,
        yPos + rowHeight - 1
      );

      yPos += rowHeight;
      rowCount++;
    }
    
    // Rodapé com totais
    yPos += 3;
    doc.setDrawColor(100, 100, 100);
    doc.line(margin, yPos, pageWidth - margin, yPos);
    
    yPos += 3;
    doc.setFontSize(8);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(0, 100, 0);
    doc.text(`Total Entradas: ${formatCurrencyBR(totals.income)}`, margin, yPos + 4);
    
    doc.setTextColor(200, 0, 0);
    doc.text(`Total Saídas: ${formatCurrencyBR(totals.expense)}`, margin + 60, yPos + 4);
    
    doc.setTextColor(totals.balance >= 0 ? 0 : 200, totals.balance >= 0 ? 100 : 0, 0);
    doc.text(`Saldo: ${formatCurrencyBR(totals.balance)}`, margin + 115, yPos + 4);
    
    doc.save(`relatorio-fluxo-caixa-${filters.startDate}-a-${filters.endDate}.pdf`);
  } catch (error) {
    console.error('Error exporting to PDF:', error);
    alert('Erro ao exportar para PDF. Verifique o console para mais detalhes.');
  } finally {
    setExporting('none');
  }
}, [transactions, totals, filters, formatDisplayDate]);

  // Exportação para Excel - DINÂMICO baseado no includeOrigin
  const exportToExcel = useCallback(() => {
    if (transactions.length === 0 && invoices.length === 0) {
      alert('Não há dados para exportar');
      return;
    }
    
    setExporting('excel');
    
    try {
      const workbook = XLSX.utils.book_new();
      
      // Aba de Resumo Executivo
      const summaryData = [
        ['RELATÓRIO DE FLUXO DE CAIXA'],
        [`Data de geração: ${new Date().toLocaleString('pt-BR')}`],
        [`Período: ${formatDisplayDate(filters.startDate)} a ${formatDisplayDate(filters.endDate)}`],
        [''],
        ['RESUMO FINANCEIRO'],
        ['Indicador', 'Valor'],
        ['Total de Entradas', formatCurrencyBR(totals.income)],
        ['Total de Saídas', formatCurrencyBR(totals.expense)],
        ['Saldo', formatCurrencyBR(totals.balance)],
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
        ...Object.entries(statistics.expensesByCategory).map(([cat, val]) => [cat.replace('_', ' '), formatCurrencyBR(val)]),
        [''],
        ['DESPESAS POR MÉTODO'],
        ...Object.entries(statistics.expensesByMethod).map(([method, value]) => [method, formatCurrencyBR(value)]),
      ];
      
      const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
      summarySheet['!cols'] = [{ wch: 30 }, { wch: 20 }];
      XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumo Executivo');
      
      // Aba de Transações - DINÂMICA
      const includeOrigin = filters.includeOrigin;
      
      const transactionsData = transactions.map(transaction => {
        const baseData: any = {
          Data: formatDisplayDate(transaction.transaction_date),
          Tipo: transaction.type === 'income' ? 'Entrada' : 'Saída',
          Descrição: transaction.description,
          Categoria: transaction.category ? transaction.category.replace('_', ' ') : '-',
          'Fonte/Fornecedor': transaction.type === 'income' ? transaction.fonte_pagadora || '-' : transaction.fornecedor || '-',
          Método: transaction.method,
          'Valor (R$)': transaction.amount,
        };

        // Adicionar origem apenas se incluído
        if (includeOrigin) {
          baseData.Origem = transaction.type === 'expense' 
            ? (transaction.idhs ? 'IDHS' : transaction.geral ? 'Geral' : '-') 
            : '-';
        }

        return baseData;
      });
      
      const transactionsSheet = XLSX.utils.json_to_sheet(transactionsData);
      
      // Definir larguras das colunas baseado no includeOrigin
      const colWidths = includeOrigin ? [
        { wch: 12 }, // Data
        { wch: 10 }, // Tipo
        { wch: 50 }, // Descrição
        { wch: 20 }, // Categoria
        { wch: 25 }, // Fonte/Fornecedor
        { wch: 10 }, // Origem
        { wch: 15 }, // Método
        { wch: 15 }  // Valor
      ] : [
        { wch: 12 }, // Data
        { wch: 10 }, // Tipo
        { wch: 50 }, // Descrição
        { wch: 20 }, // Categoria
        { wch: 25 }, // Fonte/Fornecedor
        { wch: 15 }, // Método
        { wch: 15 }  // Valor
      ];
      
      transactionsSheet['!cols'] = colWidths;
      XLSX.utils.book_append_sheet(workbook, transactionsSheet, 'Transações');
      
      // Aba de Notas Fiscais
      if (invoices.length > 0 && filters.includeInvoices) {
        const invoicesData = invoices.map(invoice => ({
          'Número NF': invoice.invoice_number,
          'Unidade': invoice.unit_name,
          'Data Emissão': formatDisplayDate(invoice.issue_date),
          'Data Vencimento': formatDisplayDate(invoice.due_date),
          'Valor (R$)': invoice.net_value,
          'Status': invoice.payment_status,
          'Data Pagamento': invoice.payment_date ? formatDisplayDate(invoice.payment_date) : '-',
          'Valor Pago (R$)': invoice.paid_value || '-',
        }));
        
        const invoicesSheet = XLSX.utils.json_to_sheet(invoicesData);
        invoicesSheet['!cols'] = [
          { wch: 15 }, { wch: 25 }, { wch: 12 }, { wch: 12 }, 
          { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 15 }
        ];
        XLSX.utils.book_append_sheet(workbook, invoicesSheet, 'Notas Fiscais');
      }
      
      XLSX.writeFile(workbook, `relatorio-fluxo-caixa-${filters.startDate}-a-${filters.endDate}.xlsx`);
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      alert('Erro ao exportar para Excel. Verifique o console para mais detalhes.');
    } finally {
      setExporting('none');
    }
  }, [transactions, invoices, totals, statistics, filters, formatDisplayDate]);

  if (initialLoading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-slate-600 font-medium">Carregando relatório...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-7xl w-full my-8 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-white rounded-t-2xl border-b border-slate-200 px-6 py-4 flex-shrink-0">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Fluxo de Caixa
              </h3>
              <p className="text-sm text-slate-500 mt-1">
                Relatório completo de movimentações financeiras
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-xl transition-all duration-200"
              aria-label="Fechar"
            >
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>
        </div>

        {/* Conteúdo rolável */}
        <div className="flex-1 overflow-y-auto">
          {/* Filtros */}
          <div className="border-b border-slate-200">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="w-full px-6 py-3 flex justify-between items-center hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-slate-500" />
                <span className="font-medium text-slate-700">Filtros Avançados</span>
                {Object.values(filters).some(v => v !== 'all' && v !== false && 
                  !(typeof v === 'string' && (v === filters.startDate || v === filters.endDate))) && (
                  <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
                    Filtros ativos
                  </span>
                )}
              </div>
              {showFilters ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </button>
            
            {showFilters && (
              <div className="px-6 pb-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-slate-400" />
                      Data Inicial
                    </label>
                    <input
                      type="date"
                      value={filters.startDate}
                      onChange={(e) => {
                        setFilters({ ...filters, startDate: e.target.value });
                        setError(null);
                      }}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-slate-400" />
                      Data Final
                    </label>
                    <input
                      type="date"
                      value={filters.endDate}
                      onChange={(e) => {
                        setFilters({ ...filters, endDate: e.target.value });
                        setError(null);
                      }}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Tipo</label>
                    <select
                      value={filters.type}
                      onChange={(e) => {
                        setFilters({ 
                          ...filters, 
                          type: e.target.value as Filters['type'],
                          ...(e.target.value === 'income' && {
                            category: 'all',
                            documentType: 'all',
                            origem: 'all'
                          })
                        });
                        setError(null);
                      }}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="all">Todos</option>
                      <option value="income">Apenas Entradas</option>
                      <option value="expense">Apenas Saídas</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filters.includeInvoices}
                        onChange={(e) => setFilters({ ...filters, includeInvoices: e.target.checked })}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm text-slate-700">Incluir Notas Fiscais</span>
                    </label>
                    
                    {/* NOVO CHECKBOX: Incluir Origem */}
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filters.includeOrigin}
                        onChange={(e) => setFilters({ ...filters, includeOrigin: e.target.checked })}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm text-slate-700">Incluir Origem</span>
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Categoria</label>
                    <select
                      value={filters.category}
                      onChange={(e) => setFilters({ ...filters, category: e.target.value as Filters['category'] })}
                      disabled={filters.type === 'income'}
                      className={`w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        filters.type === 'income' ? 'bg-slate-50 text-slate-500' : ''
                      }`}
                    >
                      <option value="all">Todas</option>
                      <option value="despesas_fixas">Despesas Fixas</option>
                      <option value="despesas_variaveis">Despesas Variáveis</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Documento</label>
                    <select
                      value={filters.documentType}
                      onChange={(e) => setFilters({ ...filters, documentType: e.target.value as Filters['documentType'] })}
                      disabled={filters.type === 'income'}
                      className={`w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        filters.type === 'income' ? 'bg-slate-50 text-slate-500' : ''
                      }`}
                    >
                      <option value="all">Todos</option>
                      <option value="com_nota">Com Nota</option>
                      <option value="so_recibo">Só Recibo</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Origem</label>
                    <select
                      value={filters.origem}
                      onChange={(e) => setFilters({ ...filters, origem: e.target.value as Filters['origem'] })}
                      disabled={filters.type === 'income'}
                      className={`w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        filters.type === 'income' ? 'bg-slate-50 text-slate-500' : ''
                      }`}
                    >
                      <option value="all">Todas</option>
                      <option value="idhs">IDHS</option>
                      <option value="geral">Geral</option>
                      <option value="nenhuma">Sem origem</option>
                    </select>
                  </div>
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm text-red-600">{error}</p>
                    </div>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={handleGenerateReport}
                    disabled={loading}
                    className="flex-1 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                        <span>Gerando...</span>
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        <RefreshCw className="w-4 h-4" />
                        <span>Gerar Relatório</span>
                      </span>
                    )}
                  </button>
                  
                  <button
                    onClick={resetFilters}
                    className="px-4 py-2.5 border border-slate-300 text-slate-700 rounded-xl hover:bg-slate-50 transition-all duration-200"
                  >
                    Limpar
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Resultados */}
          <div className="p-6">
            {transactions.length > 0 && (
              <div className="space-y-6">
                {/* Ações */}
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={exportToPDF}
                    disabled={exporting !== 'none'}
                    className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                  >
                    {exporting === 'pdf' ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                        <span>Exportando...</span>
                      </>
                    ) : (
                      <>
                        <FileDown className="w-4 h-4" />
                        <span>Exportar PDF</span>
                      </>
                    )}
                  </button>
                  <button
                    onClick={exportToExcel}
                    disabled={exporting !== 'none'}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                  >
                    {exporting === 'excel' ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                        <span>Exportando...</span>
                      </>
                    ) : (
                      <>
                        <FileSpreadsheet className="w-4 h-4" />
                        <span>Exportar Excel</span>
                      </>
                    )}
                  </button>
                  
                  {lastQueryTime && (
                    <div className="ml-auto text-xs text-slate-400 flex items-center">
                      Última atualização: {lastQueryTime.toLocaleTimeString('pt-BR')}
                    </div>
                  )}
                </div>

                {/* Cards de resumo */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-2xl p-5">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium text-green-700">Total Entradas</p>
                      <TrendingUp className="w-5 h-5 text-green-600" />
                    </div>
                    <p className="text-2xl font-bold text-green-700">{formatCurrencyBR(totals.income)}</p>
                    <p className="text-xs text-green-600 mt-2">
                      {transactions.filter(t => t.type === 'income').length} transações
                    </p>
                  </div>
                  
                  <div className="bg-gradient-to-br from-red-50 to-red-100 border border-red-200 rounded-2xl p-5">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium text-red-700">Total Saídas</p>
                      <TrendingDown className="w-5 h-5 text-red-600" />
                    </div>
                    <p className="text-2xl font-bold text-red-700">{formatCurrencyBR(totals.expense)}</p>
                    <p className="text-xs text-red-600 mt-2">
                      {transactions.filter(t => t.type === 'expense').length} transações
                    </p>
                  </div>
                  
                  <div className={`bg-gradient-to-br ${
                    totals.balance >= 0 ? 'from-blue-50 to-blue-100 border-blue-200' : 'from-orange-50 to-orange-100 border-orange-200'
                  } border rounded-2xl p-5`}>
                    <div className="flex items-center justify-between mb-2">
                      <p className={`text-sm font-medium ${totals.balance >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
                        Saldo
                      </p>
                      <DollarSign className={`w-5 h-5 ${totals.balance >= 0 ? 'text-blue-600' : 'text-orange-600'}`} />
                    </div>
                    <p className={`text-2xl font-bold ${totals.balance >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
                      {formatCurrencyBR(totals.balance)}
                    </p>
                  </div>
                </div>

                {/* Estatísticas */}
                {transactions.some(t => t.type === 'expense') && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200">
                      <p className="text-sm font-semibold text-slate-700 mb-3">Despesas por Origem</p>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-slate-600">IDHS</span>
                          <span className="font-medium text-purple-700">{formatCurrencyBR(statistics.expensesByOrigin.idhs)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-slate-600">Geral</span>
                          <span className="font-medium text-blue-700">{formatCurrencyBR(statistics.expensesByOrigin.geral)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-slate-600">Outras</span>
                          <span className="font-medium text-slate-700">{formatCurrencyBR(statistics.expensesByOrigin.outros)}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200">
                      <p className="text-sm font-semibold text-slate-700 mb-3">Despesas por Categoria</p>
                      <div className="space-y-2 max-h-32 overflow-y-auto">
                        {Object.entries(statistics.expensesByCategory).map(([category, value]) => (
                          <div key={category} className="flex justify-between items-center text-sm">
                            <span className="text-slate-600">{category.replace('_', ' ')}</span>
                            <span className="font-medium text-slate-700">{formatCurrencyBR(value)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Tabela de transações - DINÂMICA */}
                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                  <div className="overflow-x-auto max-h-[400px]">
                    <table className="w-full min-w-[1000px]">
                      <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Data</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Tipo</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Descrição</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Categoria</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Fonte/Fornecedor</th>
                          {filters.includeOrigin && (
                            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Origem</th>
                          )}
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Método</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">Valor</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {transactions.map((transaction, index) => {
                          const origemExibicao = transaction.type === 'expense'
                            ? transaction.idhs ? 'IDHS' : transaction.geral ? 'Geral' : '-'
                            : '-';

                          return (
                            <tr key={transaction.id} className={`hover:bg-slate-50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700 font-mono">
                                {formatDisplayDate(transaction.transaction_date)}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <span className={`inline-flex px-2 py-1 rounded-lg text-xs font-medium ${
                                  transaction.type === 'income' 
                                    ? 'bg-green-100 text-green-700' 
                                    : 'bg-red-100 text-red-700'
                                }`}>
                                  {transaction.type === 'income' ? 'Entrada' : 'Saída'}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-sm text-slate-700 max-w-xs truncate" title={transaction.description}>
                                {transaction.description}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-600">
                                {transaction.category ? transaction.category.replace('_', ' ') : '-'}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-600">
                                {transaction.type === 'income' 
                                  ? transaction.fonte_pagadora || '-' 
                                  : transaction.fornecedor || '-'}
                              </td>
                              {filters.includeOrigin && (
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-600">
                                  {origemExibicao}
                                </td>
                              )}
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-600">
                                {transaction.method}
                              </td>
                              <td className={`px-4 py-3 whitespace-nowrap text-sm text-right font-semibold ${
                                transaction.type === 'income' ? 'text-green-600' : 'text-red-600'
                              }`}>
                                {formatCurrencyBR(transaction.amount)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="bg-slate-50 px-4 py-3 border-t border-slate-200 text-xs text-slate-500 flex justify-between items-center">
                    <span>Total de {transactions.length} transações encontradas</span>
                    <span>Período: {formatDisplayDate(filters.startDate)} a {formatDisplayDate(filters.endDate)}</span>
                  </div>
                </div>
              </div>
            )}

            {!loading && transactions.length === 0 && (
              <div className="text-center py-12">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-slate-100 rounded-2xl mb-4">
                  <AlertCircle className="w-8 h-8 text-slate-400" />
                </div>
                <p className="text-slate-500 font-medium">Nenhuma transação encontrada</p>
                <p className="text-sm text-slate-400 mt-1">
                  Para o período de {formatDisplayDate(filters.startDate)} a {formatDisplayDate(filters.endDate)}
                </p>
                <button
                  onClick={resetFilters}
                  className="mt-4 px-4 py-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
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
