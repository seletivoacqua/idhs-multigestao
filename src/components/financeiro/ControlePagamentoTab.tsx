import { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, AlertCircle, CheckCircle, Clock, Upload, Eye, FileText, Trash2, Edit, RefreshCw, Filter, X, Building2 } from 'lucide-react';
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
  unit_id?: string | null;
  unit_name: string;
  cnpj_cpf: string;
  exercise_month: number;
  exercise_year: number;
  document_type: string;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  net_value: number;
  payment_status: 'PAGO' | 'EM ABERTO' | 'AGENDADO' | 'ATRASADO';
  payment_date?: string | null;
  paid_value?: number | null;
  data_prevista?: string | null;
  document_url?: string | null;
  document_name?: string | null;
  document_type_file?: string | null;
  estado?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  units?: Unit | null;
}

interface FilterState {
  status: 'all' | 'PAGO' | 'EM ABERTO' | 'ATRASADO' | 'AGENDADO';
  unitId: string; // NOVO: filtro por unidade
  month: number;
  year: number;
  startDate: string;
  endDate: string;
  filterType: 'due_date' | 'payment_date' | 'issue_date';
}

interface ControlePagamentoTabProps {
  onInvoicePaid?: (timestamp?: number) => void;
}

export function ControlePagamentoTab({ onInvoicePaid }: ControlePagamentoTabProps) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [editingPaymentDate, setEditingPaymentDate] = useState<string | null>(null);
  const [tempPaymentDate, setTempPaymentDate] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [syncingInvoices, setSyncingInvoices] = useState(false);

  // Estados de filtro unificados
  const [filters, setFilters] = useState<FilterState>(() => {
    // Tentar recuperar filtros salvos no localStorage
    const savedFilters = localStorage.getItem('controlePagamento_filters');
    if (savedFilters) {
      try {
        return JSON.parse(savedFilters);
      } catch (e) {
        console.error('Erro ao carregar filtros salvos:', e);
      }
    }
    
    // Valores padrão
    return {
      status: 'all',
      unitId: 'all', // NOVO: padrão é "todas as unidades"
      month: new Date().getMonth() + 1,
      year: new Date().getFullYear(),
      startDate: '',
      endDate: '',
      filterType: 'due_date'
    };
  });

  const [showFilterPanel, setShowFilterPanel] = useState(false);

  const { user } = useAuth();

  // Salvar filtros no localStorage quando mudarem
  useEffect(() => {
    localStorage.setItem('controlePagamento_filters', JSON.stringify(filters));
  }, [filters]);

  // Função utilitária para formatar datas
  const formatDate = useCallback((dateString: string | undefined | null): string => {
    if (!dateString) return '-';
    const [year, month, day] = dateString.split('T')[0].split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString('pt-BR');
  }, []);

  // Função para formatar valores como moeda
  const formatCurrency = useCallback((value: number | null | undefined): string => {
    if (value === null || value === undefined) return '-';
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  }, []);

  // Função para criar data no formato ISO
  const createISODate = useCallback((dateString: string): string => {
    if (!dateString) return '';
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day, 12, 0, 0).toISOString();
  }, []);

  // Função para criar/atualizar transação no fluxo de caixa
  const createCashFlowTransaction = useCallback(async (
    invoiceId: string,
    invoiceNumber: string,
    unitName: string,
    amount: number,
    paymentDate: string
  ): Promise<boolean> => {
    if (!user) return false;

    try {
      const transactionDate = paymentDate.split('T')[0];

      const { data: existing, error: checkError } = await supabase
        .from('cash_flow_transactions')
        .select('id, amount, transaction_date')
        .eq('invoice_id', invoiceId)
        .maybeSingle();

      if (checkError) {
        console.error('Erro ao verificar transação existente:', checkError);
        return false;
      }

      if (existing) {
        if (Math.abs(existing.amount - amount) > 0.01 || existing.transaction_date !== transactionDate) {
          const { error: updateError } = await supabase
            .from('cash_flow_transactions')
            .update({
              amount: amount,
              transaction_date: transactionDate,
              description: `Pagamento da NF ${invoiceNumber} - ${unitName}`,
              fonte_pagadora: unitName,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id);

          if (updateError) {
            console.error('Erro ao atualizar transação:', updateError);
            return false;
          }
        }
      } else {
        const transactionData = {
          user_id: user.id,
          type: 'income',
          amount: amount,
          method: 'transferencia',
          description: `Pagamento da NF ${invoiceNumber} - ${unitName}`,
          transaction_date: transactionDate,
          fonte_pagadora: unitName,
          com_nota: true,
          invoice_id: invoiceId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const { error: insertError } = await supabase
          .from('cash_flow_transactions')
          .insert([transactionData]);

        if (insertError) {
          console.error('Erro ao criar transação:', insertError);
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error('Erro ao criar/atualizar transação:', error);
      return false;
    }
  }, [user]);

  // Sincronizar notas pagas com fluxo de caixa
  const syncPaidInvoicesWithCashFlow = useCallback(async () => {
    if (!user) return;
    
    setSyncingInvoices(true);
    
    try {
      const { data: paidInvoices, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('user_id', user.id)
        .eq('payment_status', 'PAGO')
        .is('deleted_at', null);

      if (error) {
        console.error('Erro ao buscar notas pagas:', error);
        alert('Erro ao buscar notas pagas para sincronização');
        return;
      }

      let successCount = 0;
      let errorCount = 0;

      for (const invoice of paidInvoices) {
        if (!invoice.payment_date) continue;
        
        const amountToUse = invoice.paid_value || invoice.net_value;
        const success = await createCashFlowTransaction(
          invoice.id,
          invoice.invoice_number,
          invoice.unit_name,
          amountToUse,
          invoice.payment_date
        );

        if (success) {
          successCount++;
        } else {
          errorCount++;
        }
      }

      alert(`Sincronização concluída! ${successCount} notas sincronizadas com sucesso. ${errorCount} falhas.`);
      
      if (onInvoicePaid) {
        onInvoicePaid(Date.now());
      }
    } catch (error) {
      console.error('Erro durante sincronização:', error);
      alert('Erro durante sincronização');
    } finally {
      setSyncingInvoices(false);
    }
  }, [user, createCashFlowTransaction, onInvoicePaid]);

  // Formulário de nota fiscal
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
    payment_status: 'EM ABERTO' as 'PAGO' | 'EM ABERTO' | 'AGENDADO' | 'ATRASADO',
    payment_date: '',
    paid_value: '',
    data_prevista: '',
    estado: 'MA',
  });

  // Carregar dados iniciais
  useEffect(() => {
    if (user) {
      loadUnits();
      updateOverdueInvoices();
    }
  }, [user]);

  useEffect(() => {
    if (user && units.length > 0) {
      loadInvoices();
    }
  }, [units, user]);

  // Atualizar notas atrasadas
  const updateOverdueInvoices = useCallback(async () => {
    if (!user) return;

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
        const [year, month, day] = invoice.due_date.split('T')[0].split('-').map(Number);
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
  }, [user]);

  const loadUnits = useCallback(async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('units')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      console.error('Error loading units:', error);
      return;
    }

    setUnits(data || []);
  }, [user]);

  const loadInvoices = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .order('item_number', { ascending: true });

    if (error) {
      console.error('Error loading invoices:', error);
      setLoading(false);
      return;
    }

    const unitsMap = new Map(units.map(unit => [unit.id, unit]));

    const processedInvoices = (data || []).map(invoice => {
      let unitData = null;
      
      if (invoice.unit_id && unitsMap.has(invoice.unit_id)) {
        unitData = unitsMap.get(invoice.unit_id);
      } else if (invoice.unit_name) {
        unitData = units.find(u => 
          u.name.toLowerCase().trim() === invoice.unit_name.toLowerCase().trim()
        ) || null;
      }

      return {
        ...invoice,
        units: unitData
      };
    });

    setInvoices(processedInvoices);
    setLoading(false);
  }, [user, units]);

  // Função de filtro melhorada com filtro por unidade
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      // Filtro por status
      if (filters.status !== 'all' && inv.payment_status !== filters.status) {
        return false;
      }

      // NOVO: Filtro por unidade
      if (filters.unitId !== 'all') {
        // Verificar se a unidade da nota corresponde à unidade selecionada
        // Pode ser por unit_id ou por unit_name
        const unitMatches = 
          (inv.unit_id && inv.unit_id === filters.unitId) || 
          (inv.unit_name && units.find(u => u.id === filters.unitId)?.name === inv.unit_name);
        
        if (!unitMatches) {
          return false;
        }
      }

      // Filtro por mês/ano (usando a data apropriada)
      if (filters.month !== 0 || filters.year !== 0) {
        let dateToCheck: Date;
        
        switch (filters.filterType) {
          case 'payment_date':
            if (!inv.payment_date) return false;
            dateToCheck = new Date(inv.payment_date.split('T')[0]);
            break;
          case 'issue_date':
            dateToCheck = new Date(inv.issue_date.split('T')[0]);
            break;
          case 'due_date':
          default:
            dateToCheck = new Date(inv.due_date.split('T')[0]);
            break;
        }

        const month = dateToCheck.getMonth() + 1;
        const year = dateToCheck.getFullYear();

        if (filters.month !== 0 && month !== filters.month) return false;
        if (filters.year !== 0 && year !== filters.year) return false;
      }

      // Filtro por período personalizado
      if (filters.startDate && filters.endDate) {
        const start = new Date(filters.startDate);
        const end = new Date(filters.endDate);
        end.setHours(23, 59, 59, 999);

        let dateToCheck: Date;
        
        switch (filters.filterType) {
          case 'payment_date':
            if (!inv.payment_date) return false;
            dateToCheck = new Date(inv.payment_date.split('T')[0]);
            break;
          case 'issue_date':
            dateToCheck = new Date(inv.issue_date.split('T')[0]);
            break;
          case 'due_date':
          default:
            dateToCheck = new Date(inv.due_date.split('T')[0]);
            break;
        }

        return dateToCheck >= start && dateToCheck <= end;
      }

      return true;
    });
  }, [invoices, filters, units]);

  // Calcular totais baseado nas invoices filtradas
  const totals = useMemo(() => {
    const totalPago = filteredInvoices
      .filter(inv => inv.payment_status === 'PAGO')
      .reduce((sum, inv) => sum + Number(inv.paid_value || 0), 0);

    const totalEmAberto = filteredInvoices
      .filter(inv => inv.payment_status === 'EM ABERTO')
      .reduce((sum, inv) => sum + Number(inv.net_value), 0);

    const totalAgendado = filteredInvoices
      .filter(inv => inv.payment_status === 'AGENDADO')
      .reduce((sum, inv) => sum + Number(inv.net_value), 0);

    const totalAtrasado = filteredInvoices
      .filter(inv => inv.payment_status === 'ATRASADO')
      .reduce((sum, inv) => sum + Number(inv.net_value), 0);

    return { totalPago, totalEmAberto, totalAgendado, totalAtrasado };
  }, [filteredInvoices]);

  // Calcular totais gerais (sem filtro)
  const geralTotals = useMemo(() => {
    const totalPago = invoices
      .filter(inv => inv.payment_status === 'PAGO')
      .reduce((sum, inv) => sum + Number(inv.paid_value || 0), 0);

    const totalEmAberto = invoices
      .filter(inv => inv.payment_status === 'EM ABERTO')
      .reduce((sum, inv) => sum + Number(inv.net_value), 0);

    const totalAgendado = invoices
      .filter(inv => inv.payment_status === 'AGENDADO')
      .reduce((sum, inv) => sum + Number(inv.net_value), 0);

    const totalAtrasado = invoices
      .filter(inv => inv.payment_status === 'ATRASADO')
      .reduce((sum, inv) => sum + Number(inv.net_value), 0);

    return { totalPago, totalEmAberto, totalAgendado, totalAtrasado };
  }, [invoices]);

  // Função para limpar todos os filtros
  const clearFilters = useCallback(() => {
    setFilters({
      status: 'all',
      unitId: 'all',
      month: 0,
      year: 0,
      startDate: '',
      endDate: '',
      filterType: 'due_date'
    });
  }, []);

  // Verificar se há filtros ativos
  const hasActiveFilters = useMemo(() => {
    return filters.status !== 'all' || 
           filters.unitId !== 'all' ||
           filters.month !== 0 || 
           filters.year !== 0 || 
           (filters.startDate && filters.endDate);
  }, [filters]);

  // Funções para manipular o formulário
  const uploadDocument = useCallback(async (invoiceId: string): Promise<string | null> => {
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
  }, [selectedFile, user]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    let invoiceId = editingInvoice?.id;
    let shouldUpdateCashFlow = false;
    let cashFlowAmount: number | null = null;
    let cashFlowDate: string | null = null;

    const selectedUnit = units.find(u => u.id === formData.unit_id);

    const unitId = selectedUnit?.id || null;
    const unitName = selectedUnit ? selectedUnit.name : formData.unit_name;

    const issueDateISO = createISODate(formData.issue_date);
    const dueDateISO = createISODate(formData.due_date);
    const paymentDateISO = formData.payment_date ? createISODate(formData.payment_date) : null;
    const dataPrevistaISO = formData.data_prevista ? createISODate(formData.data_prevista) : null;

    if (formData.payment_status === 'PAGO') {
      cashFlowAmount = formData.paid_value ? parseFloat(formData.paid_value) : parseFloat(formData.net_value);
      cashFlowDate = paymentDateISO;
    }

    if (editingInvoice) {
      const previousStatus = editingInvoice.payment_status;
      const newStatus = formData.payment_status;
      const previousPaidValue = editingInvoice.paid_value;
      const newPaidValue = formData.paid_value ? parseFloat(formData.paid_value) : null;

      if (
        (previousStatus !== 'PAGO' && newStatus === 'PAGO') ||
        (newStatus === 'PAGO' && previousPaidValue !== newPaidValue) ||
        (newStatus === 'PAGO' && editingInvoice.payment_date !== paymentDateISO)
      ) {
        shouldUpdateCashFlow = true;
      }

      const { error } = await supabase
        .from('invoices')
        .update({
          unit_id: unitId,
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
          paid_value: newPaidValue,
          data_prevista: dataPrevistaISO,
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
      const { data: itemNumberData, error: rpcError } = await supabase.rpc('get_next_item_number', {
        p_user_id: user.id,
      });

      if (rpcError) {
        console.error('Error getting next item number:', rpcError);
        alert('Erro ao gerar número do item');
        return;
      }

      const { data: newInvoice, error } = await supabase.from('invoices').insert([
        {
          user_id: user.id,
          item_number: itemNumberData || 1,
          unit_id: unitId,
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
          data_prevista: dataPrevistaISO,
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
        if (formData.payment_status === 'PAGO') {
          shouldUpdateCashFlow = true;
        }
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

    if (shouldUpdateCashFlow && cashFlowDate && invoiceId && cashFlowAmount !== null) {
      const success = await createCashFlowTransaction(
        invoiceId,
        formData.invoice_number,
        unitName,
        cashFlowAmount,
        cashFlowDate
      );

      if (success && onInvoicePaid) {
        setTimeout(() => {
          onInvoicePaid(Date.now());
        }, 100);
      }
    }

    resetForm();
    await loadInvoices();
  }, [user, editingInvoice, formData, units, createISODate, uploadDocument, createCashFlowTransaction, onInvoicePaid, loadInvoices]);

  const resetForm = useCallback(() => {
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
      data_prevista: '',
      estado: 'MA',
    });
  }, []);

  const handleEdit = useCallback((invoice: Invoice) => {
    setEditingInvoice(invoice);
    setFormData({
      unit_id: invoice.unit_id || '',
      unit_name: invoice.unit_name || '',
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
      data_prevista: invoice.data_prevista?.split('T')[0] || '',
      estado: invoice.estado || 'MA',
    });
    setShowAddModal(true);
  }, []);

  const handleDelete = useCallback(async (id: string) => {
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

    await loadInvoices();
  }, [loadInvoices]);

  const viewDocument = useCallback((documentUrl: string) => {
    window.open(documentUrl, '_blank');
  }, []);

  const handleEditPaymentDate = useCallback((invoice: Invoice) => {
    setEditingPaymentDate(invoice.id);
    setTempPaymentDate(invoice.payment_date?.split('T')[0] || '');
  }, []);

  const handleSavePaymentDate = useCallback(async (invoiceId: string) => {
    if (!tempPaymentDate) {
      alert('Por favor, selecione uma data de pagamento');
      return;
    }

    try {
      const invoice = invoices.find(i => i.id === invoiceId);

      if (!invoice) {
        alert('Nota fiscal não encontrada');
        return;
      }

      const paymentDateISO = createISODate(tempPaymentDate);
      const paymentDateOnly = paymentDateISO.split('T')[0];
      
      const amountToUse = invoice.paid_value !== null && invoice.paid_value !== undefined 
        ? invoice.paid_value 
        : invoice.net_value;

      const { error: invoiceError } = await supabase
        .from('invoices')
        .update({
          payment_status: 'PAGO',
          payment_date: paymentDateOnly,
          paid_value: amountToUse,
          updated_at: new Date().toISOString(),
        })
        .eq('id', invoiceId);

      if (invoiceError) {
        console.error('Erro ao atualizar invoice:', invoiceError);
        alert('Erro ao atualizar nota fiscal');
        return;
      }

      const success = await createCashFlowTransaction(
        invoiceId,
        invoice.invoice_number,
        invoice.unit_name,
        amountToUse,
        paymentDateOnly
      );

      if (success) {
        setEditingPaymentDate(null);
        setTempPaymentDate('');
        await loadInvoices();
        
        if (onInvoicePaid) {
          onInvoicePaid(Date.now());
        }
        
        alert('Pagamento registrado com sucesso!');
      } else {
        alert('Nota atualizada, mas houve erro ao registrar no fluxo de caixa');
      }
    } catch (error: any) {
      console.error('Erro ao salvar data de pagamento:', error);
      alert(`Erro: ${error?.message || 'Erro desconhecido'}. Verifique o console.`);
    }
  }, [tempPaymentDate, invoices, createISODate, createCashFlowTransaction, onInvoicePaid, loadInvoices]);

  const handleCancelEditPaymentDate = useCallback(() => {
    setEditingPaymentDate(null);
    setTempPaymentDate('');
  }, []);

  const getStatusIcon = useCallback((status: string) => {
    switch (status) {
      case 'PAGO':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'AGENDADO':
        return <AlertCircle className="w-5 h-5 text-blue-600" />;
      case 'ATRASADO':
        return <Clock className="w-5 h-5 text-red-600" />;
      default:
        return <Clock className="w-5 h-5 text-yellow-600" />;
    }
  }, []);

  const getStatusColor = useCallback((status: string) => {
    switch (status) {
      case 'PAGO':
        return 'bg-green-100 text-green-700';
      case 'AGENDADO':
        return 'bg-blue-100 text-blue-700';
      case 'ATRASADO':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-yellow-100 text-yellow-700';
    }
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-full">
      {/* Header com botões principais */}
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-4">
          <h2 className="text-xl font-semibold text-slate-800">Controle de Notas Fiscais</h2>
          
          {/* Botão para abrir painel de filtros */}
          <button
            onClick={() => setShowFilterPanel(!showFilterPanel)}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
              hasActiveFilters 
                ? 'bg-blue-600 text-white hover:bg-blue-700' 
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Filter className="w-5 h-5" />
            <span>Filtros</span>
            {hasActiveFilters && (
              <span className="ml-1 bg-white text-blue-600 rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">
                {filteredInvoices.length}
              </span>
            )}
          </button>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={syncPaidInvoicesWithCashFlow}
            disabled={syncingInvoices}
            className="flex items-center space-x-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-5 h-5 ${syncingInvoices ? 'animate-spin' : ''}`} />
            <span>{syncingInvoices ? 'Sincronizando...' : 'Sincronizar Pagos'}</span>
          </button>
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

      {/* Painel de Filtros */}
      {showFilterPanel && (
        <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-lg">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-slate-800">Filtros</h3>
            <button
              onClick={() => setShowFilterPanel(false)}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Filtro por Status */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Status</label>
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value as any })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Todos os Status</option>
                <option value="PAGO">Pago</option>
                <option value="EM ABERTO">Em Aberto</option>
                <option value="AGENDADO">Agendado</option>
                <option value="ATRASADO">Atrasado</option>
              </select>
            </div>

            {/* NOVO: Filtro por Unidade */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Unidade</label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                <select
                  value={filters.unitId}
                  onChange={(e) => setFilters({ ...filters, unitId: e.target.value })}
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">Todas as Unidades</option>
                  {units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name} - {unit.municipality}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Tipo de Data para Filtro */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Filtrar por</label>
              <select
                value={filters.filterType}
                onChange={(e) => setFilters({ ...filters, filterType: e.target.value as any })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="due_date">Data de Vencimento</option>
                <option value="payment_date">Data de Pagamento</option>
                <option value="issue_date">Data de Emissão</option>
              </select>
            </div>

            {/* Filtro por Mês/Ano */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Mês</label>
                <select
                  value={filters.month}
                  onChange={(e) => setFilters({ ...filters, month: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value={0}>Todos</option>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(month => (
                    <option key={month} value={month}>
                      {new Date(2000, month - 1, 1).toLocaleString('pt-BR', { month: 'long' })}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Ano</label>
                <select
                  value={filters.year}
                  onChange={(e) => setFilters({ ...filters, year: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value={0}>Todos</option>
                  {[2024, 2025, 2026, 2027, 2028].map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Filtro por Período Personalizado */}
          <div className="mt-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">Período Personalizado</label>
            <div className="flex items-center space-x-2">
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Data inicial"
              />
              <span className="text-slate-500">até</span>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Data final"
              />
            </div>
          </div>

          {/* Ações dos Filtros */}
          <div className="flex justify-end space-x-3 mt-4 pt-4 border-t border-slate-200">
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="px-4 py-2 text-red-600 hover:text-red-800 border border-red-300 rounded-lg hover:bg-red-50 transition-colors"
              >
                Limpar Filtros
              </button>
            )}
            <button
              onClick={() => setShowFilterPanel(false)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Aplicar Filtros
            </button>
          </div>
        </div>
      )}

      {/* Indicador de Filtros Ativos */}
      {hasActiveFilters && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-sm text-blue-700 flex-wrap gap-2">
            <span className="font-medium">Filtros ativos:</span>
            {filters.status !== 'all' && (
              <span className="bg-blue-100 px-2 py-1 rounded">
                Status: {filters.status === 'PAGO' ? 'Pago' :
                         filters.status === 'EM ABERTO' ? 'Em Aberto' :
                         filters.status === 'AGENDADO' ? 'Agendado' : 'Atrasado'}
              </span>
            )}
            {/* NOVO: Indicador de filtro por unidade */}
            {filters.unitId !== 'all' && (
              <span className="bg-blue-100 px-2 py-1 rounded flex items-center space-x-1">
                <Building2 className="w-3 h-3" />
                <span>Unidade: {units.find(u => u.id === filters.unitId)?.name || 'Selecionada'}</span>
              </span>
            )}
            {filters.filterType !== 'due_date' && (
              <span className="bg-blue-100 px-2 py-1 rounded">
                Tipo: {filters.filterType === 'payment_date' ? 'Data de Pagamento' : 'Data de Emissão'}
              </span>
            )}
            {filters.month !== 0 && (
              <span className="bg-blue-100 px-2 py-1 rounded">
                Mês: {new Date(2000, filters.month - 1, 1).toLocaleString('pt-BR', { month: 'long' })}
              </span>
            )}
            {filters.year !== 0 && (
              <span className="bg-blue-100 px-2 py-1 rounded">
                Ano: {filters.year}
              </span>
            )}
            {filters.startDate && filters.endDate && (
              <span className="bg-blue-100 px-2 py-1 rounded">
                Período: {formatDate(filters.startDate)} até {formatDate(filters.endDate)}
              </span>
            )}
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-sm text-blue-700 font-medium">
              {filteredInvoices.length} nota(s) encontrada(s)
            </span>
            <button
              onClick={clearFilters}
              className="text-sm text-red-600 hover:text-red-800 font-medium"
            >
              Limpar
            </button>
          </div>
        </div>
      )}

      {/* Cards de Totais */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center space-x-3">
            <CheckCircle className="w-8 h-8 text-green-600" />
            <div>
              <p className="text-sm text-green-600 font-medium">
                {hasActiveFilters ? 'Total Pago (Filtrado)' : 'Total Pago'}
              </p>
              <p className="text-xl font-bold text-green-700">{formatCurrency(totals.totalPago)}</p>
              {hasActiveFilters && (
                <p className="text-xs text-green-500">Geral: {formatCurrency(geralTotals.totalPago)}</p>
              )}
            </div>
          </div>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center space-x-3">
            <Clock className="w-8 h-8 text-yellow-600" />
            <div>
              <p className="text-sm text-yellow-600 font-medium">Em Aberto</p>
              <p className="text-xl font-bold text-yellow-700">{formatCurrency(totals.totalEmAberto)}</p>
            </div>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center space-x-3">
            <Clock className="w-8 h-8 text-blue-600" />
            <div>
              <p className="text-sm text-blue-600 font-medium">Agendado</p>
              <p className="text-xl font-bold text-blue-700">{formatCurrency(totals.totalAgendado)}</p>
            </div>
          </div>
        </div>

        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center space-x-3">
            <AlertCircle className="w-8 h-8 text-red-600" />
            <div>
              <p className="text-sm text-red-600 font-medium">Atrasado</p>
              <p className="text-xl font-bold text-red-700">{formatCurrency(totals.totalAtrasado)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabela de Notas Fiscais */}
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
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Valor NF</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Valor Pago</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Documento</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredInvoices.map((invoice) => {
                const displayUnitName = invoice.units?.name || invoice.unit_name || '-';
                
                return (
                  <tr key={invoice.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700 font-medium">
                      {invoice.item_number}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {displayUnitName}
                      {!invoice.unit_id && invoice.unit_name && (
                        <span className="ml-2 text-xs text-amber-600" title="Nota fiscal de versão anterior">
                          (legado)
                        </span>
                      )}
                    </td>
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
                      {formatCurrency(invoice.net_value)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700 font-medium">
                      {invoice.payment_status === 'PAGO' ? (
                        <span className="text-green-600">
                          {formatCurrency(invoice.paid_value)}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        {getStatusIcon(invoice.payment_status)}
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(invoice.payment_status)}`}>
                          {invoice.payment_status === 'PAGO' ? 'Pago' :
                           invoice.payment_status === 'EM ABERTO' ? 'Em Aberto' :
                           invoice.payment_status === 'AGENDADO' ? 'Agendado' : 'Atrasado'}
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
                );
              })}
              {filteredInvoices.length === 0 && (
                <tr>
                  <td colSpan={14} className="px-4 py-8 text-center text-slate-500">
                    Nenhuma nota fiscal encontrada
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Nova/Editar Nota Fiscal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200">
              <h3 className="text-xl font-bold text-slate-800">
                {editingInvoice ? 'Editar Nota Fiscal' : 'Nova Nota Fiscal'}
              </h3>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-4">
              <form onSubmit={handleSubmit} className="space-y-4" id="invoice-form">
                {/* ... conteúdo do formulário ... */}
              </form>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50">
              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={resetForm}
                  className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-100 transition-colors font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  form="invoice-form"
                  disabled={uploadingFile}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploadingFile ? 'Enviando...' : (editingInvoice ? 'Atualizar' : 'Adicionar')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Relatório */}
      {showReportModal && (
        <ControlePagamentoReport onClose={() => setShowReportModal(false)} />
      )}
    </div>
  );
}
