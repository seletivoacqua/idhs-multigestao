import { useState, useEffect, useMemo, useCallback } from 'react';
import { X, FileDown, FileSpreadsheet, AlertCircle } from 'lucide-react';
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
}

interface Filters {
  startDate: string;
  endDate: string;
  type: 'all' | 'income' | 'expense';
  documentType: 'all' | 'com_nota' | 'so_recibo';
  category: 'all' | 'despesas_fixas' | 'despesas_variaveis';
  origem: 'all' | 'idhs' | 'geral' | 'nenhuma';
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
  const [error, setError] = useState<string | null>(null);
  
  const [filters, setFilters] = useState<Filters>({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    type: 'all',
    documentType: 'all',
    category: 'all',
    origem: 'all',
  });

  // 🔥 CORREÇÃO: Validar e ajustar datas
  const validateDates = useCallback((): boolean => {
    if (filters.startDate > filters.endDate) {
      setError('Data inicial não pode ser maior que data final');
      return false;
    }
    return true;
  }, [filters.startDate, filters.endDate]);

  // 🔥 CORREÇÃO: Função para ajustar datas para consulta no Supabase
  const getDateRangeForQuery = useCallback(() => {
    // Data inicial: início do dia (00:00:00)
    const startDateTime = `${filters.startDate}T00:00:00`;
    
    // Data final: fim do dia (23:59:59)
    const endDateTime = `${filters.endDate}T23:59:59`;
    
    return { startDateTime, endDateTime };
  }, [filters.startDate, filters.endDate]);

  // Reset de filtros
  const resetFilters = useCallback(() => {
    setFilters({
      startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0],
      type: 'all',
      documentType: 'all',
      category: 'all',
      origem: 'all',
    });
    setError(null);
  }, []);

  // Geração do relatório com datas corrigidas
  const handleGenerateReport = useCallback(async () => {
    if (!user) {
      setError('Usuário não autenticado');
      return;
    }

    if (!validateDates()) return;

    setLoading(true);
    setError(null);

    try {
      const { startDateTime, endDateTime } = getDateRangeForQuery();
      
      console.log('Consultando transações de:', startDateTime, 'até', endDateTime);

      let query = supabase
        .from('cash_flow_transactions')
        .select('*')
        .gte('transaction_date', startDateTime)
        .lte('transaction_date', endDateTime);

      if (filters.type !== 'all') {
        query = query.eq('type', filters.type);
      }

      if (filters.category !== 'all') {
        if (filters.type === 'all' || filters.type === 'expense') {
          query = query.eq('category', filters.category);
        } else {
          setError('Categoria só pode ser aplicada a despesas');
          setLoading(false);
          return;
        }
      }

      if (filters.documentType !== 'all') {
        if (filters.type === 'all' || filters.type === 'expense') {
          query = query.eq(filters.documentType, true);
        } else {
          setError('Tipo de documento só pode ser aplicado a despesas');
          setLoading(false);
          return;
        }
      }

      if (filters.origem !== 'all') {
        if (filters.type === 'all' || filters.type === 'expense') {
          if (filters.origem === 'idhs') {
            query = query.eq('idhs', true);
          } else if (filters.origem === 'geral') {
            query = query.eq('geral', true);
          } else if (filters.origem === 'nenhuma') {
            query = query
              .or('idhs.is.null,idhs.eq.false')
              .or('geral.is.null,geral.eq.false');
          }
        } else {
          setError('Origem só pode ser aplicada a despesas');
          setLoading(false);
          return;
        }
      }

      query = query.order('transaction_date', { ascending: false });

      const { data, error: queryError } = await query;

      if (queryError) {
        console.error('Error loading transactions:', queryError);
        setError('Erro ao carregar transações');
        return;
      }

      console.log('Transações encontradas:', data?.length);
      if (data && data.length > 0) {
        console.log('Primeira transação:', {
          data: data[0].transaction_date,
          esperado_inicio: startDateTime,
          esperado_fim: endDateTime
        });
      }

      const processedData = data?.map(transaction => ({
        ...transaction,
        amount: Number(transaction.amount),
        com_nota: transaction.com_nota === true,
        so_recibo: transaction.so_recibo === true,
        idhs: transaction.idhs === true,
        geral: transaction.geral === true,
      })) || [];

      setTransactions(processedData);
    } catch (error) {
      console.error('Error generating report:', error);
      setError('Erro ao gerar relatório');
    } finally {
      setLoading(false);
    }
  }, [user, filters, validateDates, getDateRangeForQuery]);

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
    
    const balance = income - expense;
    
    return { income, expense, balance };
  }, [transactions]);

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

    return { expensesByCategory, expensesByOrigin };
  }, [transactions]);

  // Validação de dados para exportação
  const validateExportData = useCallback((): boolean => {
    if (transactions.length === 0) {
      alert('Não há dados para exportar');
      return false;
    }
    
    const invalidTransactions = transactions.filter(t => 
      !t.id || !t.type || typeof t.amount !== 'number' || isNaN(t.amount)
    );
    
    if (invalidTransactions.length > 0) {
      console.warn('Transações inválidas encontradas:', invalidTransactions);
      if (!confirm(`${invalidTransactions.length} transação(ões) com dados incompletos. Deseja continuar?`)) {
        return false;
      }
    }
    
    return true;
  }, [transactions]);

  // Função auxiliar para formatar transação para Excel
  const formatTransactionForExcel = useCallback((transaction: Transaction) => {
    const origem = transaction.type === 'expense'
      ? transaction.idhs ? 'IDHS' : transaction.geral ? 'Geral' : '-'
      : '-';

    return {
      Data: formatDisplayDate(transaction.transaction_date),
      Tipo: transaction.type === 'income' ? 'Entrada' : 'Saída',
      Descrição: transaction.description,
      Categoria: transaction.category ? transaction.category.replace('_', ' ') : '-',
      Subcategoria: transaction.subcategoria || '-',
      'Fonte/Fornecedor': transaction.type === 'income' 
        ? transaction.fonte_pagadora || '-' 
        : transaction.fornecedor || '-',
      Origem: origem,
      'Com Nota': transaction.com_nota ? 'Sim' : 'Não',
      'Só Recibo': transaction.so_recibo ? 'Sim' : 'Não',
      Método: transaction.method,
      'Valor (R$)': transaction.amount,
    };
  }, [formatDisplayDate]);

  // Exportação para PDF (com coluna Fornecedor)
  const exportToPDF = useCallback(async () => {
    if (!validateExportData()) return;
    
    setExporting('pdf');
    
    try {
      const doc = new jsPDF({ 
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });
      
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 14;
      
      // 🔥 NOVAS LARGURAS DE COLUNA (incluindo Fornecedor)
      const colWidths = {
        data: 20,
        tipo: 15,
        descricao: 40,
        fornecedor: 30,   // <--- coluna adicionada
        categoria: 25,
        origem: 20,
        documento: 20,
        valor: 30
      };
      
      // Calcular posições das colunas
      let xPos = margin;
      const colPositions = {
        data: xPos,
        tipo: xPos + colWidths.data,
        descricao: xPos + colWidths.data + colWidths.tipo,
        fornecedor: xPos + colWidths.data + colWidths.tipo + colWidths.descricao,
        categoria: xPos + colWidths.data + colWidths.tipo + colWidths.descricao + colWidths.fornecedor,
        origem: xPos + colWidths.data + colWidths.tipo + colWidths.descricao + colWidths.fornecedor + colWidths.categoria,
        documento: xPos + colWidths.data + colWidths.tipo + colWidths.descricao + colWidths.fornecedor + colWidths.categoria + colWidths.origem,
        valor: pageWidth - margin - colWidths.valor
      };
      
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
      doc.text('Relatório de Fluxo de Caixa', pageWidth / 2, 25, { align: 'center' });

      // Período
      doc.setFontSize(11);
      doc.text(
        `Período: ${formatDisplayDate(filters.startDate)} a ${formatDisplayDate(filters.endDate)}`,
        pageWidth / 2,
        32,
        { align: 'center' }
      );

      // Filtros aplicados
      const filtrosAplicados = [];
      if (filters.type !== 'all') filtrosAplicados.push(`Tipo: ${filters.type === 'income' ? 'Receitas' : 'Despesas'}`);
      if (filters.category !== 'all') filtrosAplicados.push(`Categoria: ${filters.category.replace('_', ' ')}`);
      if (filters.origem !== 'all') filtrosAplicados.push(`Origem: ${filters.origem === 'idhs' ? 'IDHS' : filters.origem === 'geral' ? 'Geral' : 'Sem origem'}`);
      if (filters.documentType !== 'all') filtrosAplicados.push(`Documento: ${filters.documentType === 'com_nota' ? 'Com Nota' : 'Só Recibo'}`);

      if (filtrosAplicados.length > 0) {
        doc.setFontSize(9);
        doc.text(`Filtros: ${filtrosAplicados.join(' | ')}`, pageWidth / 2, 38, { align: 'center' });
      }

      // Cabeçalho da tabela
      let yPos = 45;
      doc.setFontSize(8);
      doc.setFont(undefined, 'bold');
      
      doc.text('Data', colPositions.data, yPos);
      doc.text('Tipo', colPositions.tipo, yPos);
      doc.text('Descrição', colPositions.descricao, yPos);
      doc.text('Fornecedor', colPositions.fornecedor, yPos);   // <--- cabeçalho novo
      doc.text('Categoria', colPositions.categoria, yPos);
      doc.text('Origem', colPositions.origem, yPos);
      doc.text('Doc', colPositions.documento, yPos);
      doc.text('Valor', colPositions.valor, yPos);

      yPos += 3;
      doc.line(margin, yPos, pageWidth - margin, yPos);
      yPos += 4;
      
      doc.setFont(undefined, 'normal');

      // Dados da tabela
      transactions.forEach((transaction) => {
        if (yPos > pageHeight - 25) {
          doc.addPage('landscape');
          yPos = 25;
          
          // Recriar cabeçalho na nova página
          doc.setFontSize(8);
          doc.setFont(undefined, 'bold');
          doc.text('Data', colPositions.data, yPos);
          doc.text('Tipo', colPositions.tipo, yPos);
          doc.text('Descrição', colPositions.descricao, yPos);
          doc.text('Fornecedor', colPositions.fornecedor, yPos);
          doc.text('Categoria', colPositions.categoria, yPos);
          doc.text('Origem', colPositions.origem, yPos);
          doc.text('Doc', colPositions.documento, yPos);
          doc.text('Valor', colPositions.valor, yPos);
          yPos += 3;
          doc.line(margin, yPos, pageWidth - margin, yPos);
          yPos += 4;
          doc.setFont(undefined, 'normal');
        }

        const origemTexto = transaction.type === 'expense'
          ? transaction.idhs ? 'IDHS' : transaction.geral ? 'Geral' : '-'
          : '-';

        const documentoTipo = transaction.com_nota ? 'Nota' : transaction.so_recibo ? 'Recibo' : '-';
        const fornecedorTexto = transaction.type === 'income' 
          ? transaction.fonte_pagadora || '-' 
          : transaction.fornecedor || '-';

        // Quebrar descrição longa
        const descricaoLinhas = doc.splitTextToSize(
          transaction.description, 
          colWidths.descricao - 2
        );
        
        // Data formatada
        doc.text(formatDisplayDate(transaction.transaction_date), colPositions.data, yPos);
        
        // Tipo (abreviado)
        doc.text(transaction.type === 'income' ? 'REC' : 'DESP', colPositions.tipo, yPos);
        
        // Descrição (primeira linha)
        doc.text(descricaoLinhas[0] || '', colPositions.descricao, yPos);
        
        // Se descrição tiver mais linhas, ajustar Y para próximas linhas
        let currentYPos = yPos;
        if (descricaoLinhas.length > 1) {
          for (let i = 1; i < descricaoLinhas.length; i++) {
            currentYPos += 4;
            doc.text(descricaoLinhas[i], colPositions.descricao, currentYPos);
          }
        }
        
        // Fornecedor
        doc.text(fornecedorTexto, colPositions.fornecedor, yPos);
        
        // Categoria
        doc.text(transaction.category ? transaction.category.replace('_', ' ') : '-', colPositions.categoria, yPos);
        
        // Origem
        doc.text(origemTexto, colPositions.origem, yPos);
        
        // Documento
        doc.text(documentoTipo, colPositions.documento, yPos);
        
        // Valor
        doc.text(formatCurrencyBR(transaction.amount), colPositions.valor, yPos);

        yPos = currentYPos + 6;
      });

      // Linha de total
      yPos += 2;
      doc.line(margin, yPos, pageWidth - margin, yPos);
      yPos += 5;

      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.text(`Total Entradas: ${formatCurrencyBR(totals.income)}`, margin, yPos);
      yPos += 5;
      doc.text(`Total Saídas: ${formatCurrencyBR(totals.expense)}`, margin, yPos);
      yPos += 5;
      
      const balanceColor = totals.balance >= 0 ? [0, 100, 0] : [255, 0, 0];
      doc.setTextColor(balanceColor[0], balanceColor[1], balanceColor[2]);
      doc.text(`Saldo: ${formatCurrencyBR(totals.balance)}`, margin, yPos);
      
      doc.setTextColor(0, 0, 0);

      doc.save(`relatorio-fluxo-caixa-${filters.startDate}-a-${filters.endDate}.pdf`);
    } catch (error) {
      console.error('Error exporting to PDF:', error);
      alert('Erro ao exportar para PDF. Verifique o console para mais detalhes.');
    } finally {
      setExporting('none');
    }
  }, [transactions, totals, filters, validateExportData, formatDisplayDate]);

  // Exportação para Excel (já possui a coluna "Fonte/Fornecedor")
  const exportToExcel = useCallback(() => {
    if (!validateExportData()) return;
    
    setExporting('excel');
    
    try {
      const incomeData = transactions
        .filter(t => t.type === 'income')
        .map(transaction => formatTransactionForExcel(transaction));
        
      const expenseData = transactions
        .filter(t => t.type === 'expense')
        .map(transaction => formatTransactionForExcel(transaction));
      
      const workbook = XLSX.utils.book_new();
      
      // Aba de Resumo
      const summaryData = [
        ['RELATÓRIO DE FLUXO DE CAIXA'],
        [`Período: ${formatDisplayDate(filters.startDate)} a ${formatDisplayDate(filters.endDate)}`],
        [''],
        ['FILTROS APLICADOS'],
        [`Tipo: ${filters.type === 'all' ? 'Todos' : filters.type === 'income' ? 'Apenas Entradas' : 'Apenas Saídas'}`],
        [`Categoria: ${filters.category === 'all' ? 'Todas' : filters.category.replace('_', ' ')}`],
        [`Origem: ${filters.origem === 'all' ? 'Todas' : filters.origem === 'idhs' ? 'IDHS' : filters.origem === 'geral' ? 'Geral' : 'Sem origem'}`],
        [`Documento: ${filters.documentType === 'all' ? 'Todos' : filters.documentType === 'com_nota' ? 'Com Nota' : 'Só Recibo'}`],
        [''],
        ['RESUMO FINANCEIRO'],
        ['Descrição', 'Valor Formatado', 'Valor Numérico'],
        ['Total Entradas', formatCurrencyBR(totals.income), totals.income],
        ['Total Saídas', formatCurrencyBR(totals.expense), totals.expense],
        ['Saldo', formatCurrencyBR(totals.balance), totals.balance],
        [''],
        ['ESTATÍSTICAS DE DESPESAS'],
        ['Por Origem:'],
        ['IDHS', formatCurrencyBR(statistics.expensesByOrigin.idhs), statistics.expensesByOrigin.idhs],
        ['Geral', formatCurrencyBR(statistics.expensesByOrigin.geral), statistics.expensesByOrigin.geral],
        ['Outras', formatCurrencyBR(statistics.expensesByOrigin.outros), statistics.expensesByOrigin.outros],
        [''],
        ['Por Categoria:'],
        ...Object.entries(statistics.expensesByCategory).map(([cat, val]) => [
          cat.replace('_', ' '),
          formatCurrencyBR(val),
          val
        ]),
      ];
      
      const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
      
      summarySheet['!cols'] = [
        { wch: 30 },
        { wch: 20 },
        { wch: 15 },
      ];
      
      XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumo');
      
      // Aba de Receitas
      if (incomeData.length > 0) {
        const incomeSheet = XLSX.utils.json_to_sheet(incomeData);
        incomeSheet['!cols'] = [
          { wch: 12 }, // Data
          { wch: 10 }, // Tipo
          { wch: 40 }, // Descrição
          { wch: 20 }, // Categoria
          { wch: 20 }, // Subcategoria
          { wch: 25 }, // Fonte/Fornecedor
          { wch: 10 }, // Origem
          { wch: 10 }, // Com Nota
          { wch: 10 }, // Só Recibo
          { wch: 15 }, // Método
          { wch: 15 }, // Valor
        ];
        XLSX.utils.book_append_sheet(workbook, incomeSheet, 'Receitas');
      }
      
      // Aba de Despesas
      if (expenseData.length > 0) {
        const expenseSheet = XLSX.utils.json_to_sheet(expenseData);
        expenseSheet['!cols'] = [
          { wch: 12 }, // Data
          { wch: 10 }, // Tipo
          { wch: 40 }, // Descrição
          { wch: 20 }, // Categoria
          { wch: 20 }, // Subcategoria
          { wch: 25 }, // Fonte/Fornecedor
          { wch: 10 }, // Origem
          { wch: 10 }, // Com Nota
          { wch: 10 }, // Só Recibo
          { wch: 15 }, // Método
          { wch: 15 }, // Valor
        ];
        XLSX.utils.book_append_sheet(workbook, expenseSheet, 'Despesas');
      }
      
      // Aba de Todas Transações
      const allData = transactions.map(transaction => formatTransactionForExcel(transaction));
      if (allData.length > 0) {
        const allSheet = XLSX.utils.json_to_sheet(allData);
        allSheet['!cols'] = [
          { wch: 12 },
          { wch: 10 },
          { wch: 40 },
          { wch: 20 },
          { wch: 20 },
          { wch: 25 },
          { wch: 10 },
          { wch: 10 },
          { wch: 10 },
          { wch: 15 },
          { wch: 15 },
        ];
        XLSX.utils.book_append_sheet(workbook, allSheet, 'Todas Transações');
      }
      
      XLSX.writeFile(workbook, `relatorio-fluxo-caixa-${filters.startDate}-a-${filters.endDate}.xlsx`);
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      alert('Erro ao exportar para Excel. Verifique o console para mais detalhes.');
    } finally {
      setExporting('none');
    }
  }, [transactions, totals, statistics, filters, formatTransactionForExcel, validateExportData, formatDisplayDate]);

  // Renderização condicional de loading
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
          <h3 className="text-xl font-bold text-slate-800">Relatório de Fluxo de Caixa</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
            aria-label="Fechar"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Filtros */}
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

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Data Inicial</label>
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => {
                  setFilters({ ...filters, startDate: e.target.value });
                  setError(null);
                }}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                max={filters.endDate}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Data Final</label>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => {
                  setFilters({ ...filters, endDate: e.target.value });
                  setError(null);
                }}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                min={filters.startDate}
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
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">Todos</option>
                <option value="income">Apenas Entradas</option>
                <option value="expense">Apenas Saídas</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Categoria</label>
              <select
                value={filters.category}
                onChange={(e) => setFilters({ ...filters, category: e.target.value as Filters['category'] })}
                disabled={filters.type === 'income'}
                className={`w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  filters.type === 'income' ? 'bg-slate-100 cursor-not-allowed' : ''
                }`}
              >
                <option value="all">Todas</option>
                <option value="despesas_fixas">Despesas Fixas</option>
                <option value="despesas_variaveis">Despesas Variáveis</option>
              </select>
              {filters.type === 'income' && (
                <p className="text-xs text-slate-500 mt-1">Categoria não se aplica a entradas</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Documento</label>
              <select
                value={filters.documentType}
                onChange={(e) => setFilters({ ...filters, documentType: e.target.value as Filters['documentType'] })}
                disabled={filters.type === 'income'}
                className={`w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  filters.type === 'income' ? 'bg-slate-100 cursor-not-allowed' : ''
                }`}
              >
                <option value="all">Todos</option>
                <option value="com_nota">Com Nota</option>
                <option value="so_recibo">Só Recibo</option>
              </select>
              {filters.type === 'income' && (
                <p className="text-xs text-slate-500 mt-1">Documento não se aplica a entradas</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Origem (IDHS/Geral)</label>
              <select
                value={filters.origem}
                onChange={(e) => setFilters({ ...filters, origem: e.target.value as Filters['origem'] })}
                disabled={filters.type === 'income'}
                className={`w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  filters.type === 'income' ? 'bg-slate-100 cursor-not-allowed' : ''
                }`}
              >
                <option value="all">Todas</option>
                <option value="idhs">IDHS</option>
                <option value="geral">Geral</option>
                <option value="nenhuma">Sem origem</option>
              </select>
              {filters.type === 'income' && (
                <p className="text-xs text-slate-500 mt-1">Origem não se aplica a entradas</p>
              )}
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center space-x-2">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <button
            onClick={handleGenerateReport}
            disabled={loading}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed"
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

        {/* Resultados */}
        {transactions.length > 0 && (
          <>
            <div className="mb-4 flex flex-wrap gap-3">
              <button
                onClick={exportToPDF}
                disabled={exporting !== 'none'}
                className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:bg-red-300 disabled:cursor-not-allowed"
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
                className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:bg-green-300 disabled:cursor-not-allowed"
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

            {/* Cards de resumo */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-sm text-green-600 font-medium">Total Entradas</p>
                <p className="text-2xl font-bold text-green-700">{formatCurrencyBR(totals.income)}</p>
                <p className="text-xs text-green-600 mt-1">{transactions.filter(t => t.type === 'income').length} transações</p>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-600 font-medium">Total Saídas</p>
                <p className="text-2xl font-bold text-red-700">{formatCurrencyBR(totals.expense)}</p>
                <p className="text-xs text-red-600 mt-1">{transactions.filter(t => t.type === 'expense').length} transações</p>
              </div>
              <div className={`${
                totals.balance >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'
              } border rounded-lg p-4`}>
                <p className={`text-sm ${totals.balance >= 0 ? 'text-blue-600' : 'text-orange-600'} font-medium`}>Saldo</p>
                <p className={`text-2xl font-bold ${totals.balance >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
                  {formatCurrencyBR(totals.balance)}
                </p>
              </div>
            </div>

            {/* Estatísticas adicionais */}
            {transactions.some(t => t.type === 'expense') && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                  <p className="text-sm font-medium text-slate-700 mb-2">Despesas por Origem</p>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">IDHS:</span>
                      <span className="font-medium text-purple-700">{formatCurrencyBR(statistics.expensesByOrigin.idhs)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">Geral:</span>
                      <span className="font-medium text-blue-700">{formatCurrencyBR(statistics.expensesByOrigin.geral)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">Outras:</span>
                      <span className="font-medium text-slate-700">{formatCurrencyBR(statistics.expensesByOrigin.outros)}</span>
                    </div>
                  </div>
                </div>
                
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                  <p className="text-sm font-medium text-slate-700 mb-2">Despesas por Categoria</p>
                  <div className="space-y-2 max-h-32 overflow-y-auto">
                    {Object.entries(statistics.expensesByCategory).map(([category, value]) => (
                      <div key={category} className="flex justify-between text-sm">
                        <span className="text-slate-600">{category.replace('_', ' ')}:</span>
                        <span className="font-medium text-slate-700">{formatCurrencyBR(value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Tabela de transações */}
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="overflow-x-auto max-h-96">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Data</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Tipo</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Descrição</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Categoria</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Subcategoria</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Fonte/Fornecedor</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Origem</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Documento</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-slate-600 uppercase">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {transactions.map((transaction) => {
                      const origemExibicao = transaction.type === 'expense'
                        ? transaction.idhs ? 'IDHS' : transaction.geral ? 'Geral' : '-'
                        : '-';

                      const documentoTipo = transaction.com_nota 
                        ? 'Nota' 
                        : transaction.so_recibo 
                          ? 'Recibo' 
                          : '-';

                      return (
                        <tr key={transaction.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700">
                            {formatDisplayDate(transaction.transaction_date)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              transaction.type === 'income' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                            }`}>
                              {transaction.type === 'income' ? 'Entrada' : 'Saída'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-700 max-w-xs truncate" title={transaction.description}>
                            {transaction.description}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700">
                            {transaction.category ? transaction.category.replace('_', ' ') : '-'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700">
                            {transaction.subcategoria || '-'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700">
                            {transaction.type === 'income' 
                              ? transaction.fonte_pagadora || '-' 
                              : transaction.fornecedor || '-'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700">
                            {origemExibicao}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700">
                            {documentoTipo}
                          </td>
                          <td className={`px-4 py-3 whitespace-nowrap text-sm text-right font-medium ${
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
              <div className="bg-slate-50 px-4 py-2 border-t border-slate-200 text-xs text-slate-500">
                Total de {transactions.length} transação(ões) encontrada(s) no período de {formatDisplayDate(filters.startDate)} a {formatDisplayDate(filters.endDate)}
              </div>
            </div>
          </>
        )}

        {!loading && transactions.length === 0 && (
          <div className="text-center py-12 text-slate-500">
            Nenhuma transação encontrada para os filtros selecionados no período de {formatDisplayDate(filters.startDate)} a {formatDisplayDate(filters.endDate)}
          </div>
        )}
      </div>
    </div>
  );
}
