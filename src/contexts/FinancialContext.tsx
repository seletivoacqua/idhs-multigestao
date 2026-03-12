// contexts/FinancialContext.tsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

// Tipos baseados no schema
interface CashFlowTransaction {
  id: string;
  user_id: string;
  type: 'income' | 'expense';
  amount: number;
  method: 'pix' | 'transferencia' | 'dinheiro' | 'boleto' | 'cartao_debito' | 'cartao_credito';
  category?: 'despesas_fixas' | 'despesas_variaveis' | null;
  description?: string;
  transaction_date: string;
  created_at?: string;
  fonte_pagadora?: string;
  com_nota?: boolean;
  so_recibo?: boolean;
  subcategoria?: string;
  fornecedor?: string;
  idhs?: boolean;
  geral?: boolean;
  invoice_id?: string; // Campo adicional para referência (não está no schema, mas podemos adicionar depois)
}

interface Invoice {
  id: string;
  user_id: string;
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
  payment_date?: string | null;
  paid_value?: number | null;
  document_url?: string | null;
  document_name?: string | null;
  estado?: string | null;
  unit_id?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

interface Unit {
  id: string;
  name: string;
  municipality: string;
  user_id: string;
}

interface FixedExpense {
  id: string;
  user_id: string;
  name: string;
  amount: number;
  method: 'boleto' | 'pix' | 'transferencia';
  description?: string;
  active: boolean;
  pagamento_realizado: boolean;
  created_at?: string;
}

interface InitialBalance {
  id: string;
  user_id: string;
  month: number;
  year: number;
  balance: number;
  created_at?: string;
  updated_at?: string;
}

interface FinancialContextData {
  // Dados
  transactions: CashFlowTransaction[];
  invoices: Invoice[];
  units: Unit[];
  fixedExpenses: FixedExpense[];
  loading: boolean;
  
  // Ações
  refreshData: (month?: string) => Promise<void>;
  addTransaction: (transaction: Omit<CashFlowTransaction, 'id' | 'user_id' | 'created_at'>) => Promise<void>;
  updateInvoiceStatus: (invoiceId: string, status: 'PAGO', paymentDate: string, paidValue: number) => Promise<void>;
  
  // Cálculos mensais
  getMonthlyTotals: (month: string) => {
    income: number;
    expense: number;
    pendingInvoices: number;
    initialBalance: number;
    finalBalance: number;
  };
  
  // Saldo inicial
  loadInitialBalance: (year: number, month: number) => Promise<number>;
  saveInitialBalance: (year: number, month: number, balance: number) => Promise<void>;
}

const FinancialContext = createContext<FinancialContextData>({} as FinancialContextData);

export function FinancialProvider({ children }: { children: React.ReactNode }) {
  const [transactions, setTransactions] = useState<CashFlowTransaction[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [fixedExpenses, setFixedExpenses] = useState<FixedExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  // Carregar unidades (para referência)
  const loadUnits = useCallback(async () => {
    if (!user) return;
    
    const { data } = await supabase
      .from('units')
      .select('*')
      .eq('user_id', user.id)
      .order('name');

    if (data) setUnits(data);
  }, [user]);

  // Carregar transações do mês
  const loadTransactions = useCallback(async (year: number, month: number) => {
    if (!user) return [];
    
    const monthPadded = month.toString().padStart(2, '0');
    const startDate = `${year}-${monthPadded}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${monthPadded}-${lastDay.toString().padStart(2, '0')}`;

    const { data } = await supabase
      .from('cash_flow_transactions')
      .select('*')
      .eq('user_id', user.id)
      .gte('transaction_date', startDate)
      .lte('transaction_date', endDate)
      .order('transaction_date', { ascending: false });

    return data || [];
  }, [user]);

  // Carregar invoices não deletadas
  const loadInvoices = useCallback(async () => {
    if (!user) return [];
    
    const { data } = await supabase
      .from('invoices')
      .select('*')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .order('due_date', { ascending: true });

    return data || [];
  }, [user]);

  // Carregar despesas fixas
  const loadFixedExpenses = useCallback(async () => {
    if (!user) return [];
    
    const { data } = await supabase
      .from('fixed_expenses')
      .select('*')
      .eq('user_id', user.id)
      .order('name');

    return data || [];
  }, [user]);

  // Carregar saldo inicial
  const loadInitialBalance = useCallback(async (year: number, month: number) => {
    if (!user) return 0;
    
    const { data } = await supabase
      .from('initial_balances')
      .select('balance')
      .eq('user_id', user.id)
      .eq('year', year)
      .eq('month', month)
      .maybeSingle();

    return data?.balance || 0;
  }, [user]);

  // Salvar saldo inicial
  const saveInitialBalance = useCallback(async (year: number, month: number, balance: number) => {
    if (!user) return;

    const { error } = await supabase
      .from('initial_balances')
      .upsert({
        user_id: user.id,
        year,
        month,
        balance,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,year,month'
      });

    if (error) {
      console.error('Error saving initial balance:', error);
      throw error;
    }
  }, [user]);

  // Adicionar transação
  const addTransaction = async (transaction: Omit<CashFlowTransaction, 'id' | 'user_id' | 'created_at'>) => {
    if (!user) return;

    const { error } = await supabase
      .from('cash_flow_transactions')
      .insert([{
        ...transaction,
        user_id: user.id
      }]);

    if (error) {
      console.error('Error adding transaction:', error);
      throw error;
    }

    // Recarregar dados do mês atual
    const today = new Date();
    const transactions = await loadTransactions(today.getFullYear(), today.getMonth() + 1);
    setTransactions(transactions);
  };

  // Atualizar status da invoice e criar transação
  const updateInvoiceStatus = async (
    invoiceId: string, 
    status: 'PAGO', 
    paymentDate: string, 
    paidValue: number
  ) => {
    if (!user) return;

    // Buscar a invoice para obter os detalhes
    const { data: invoice, error: fetchError } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .single();

    if (fetchError || !invoice) {
      console.error('Error fetching invoice:', fetchError);
      throw new Error('Invoice not found');
    }

    // 1. Atualizar status da invoice
    const { error: invoiceError } = await supabase
      .from('invoices')
      .update({
        payment_status: status,
        payment_date: paymentDate.split('T')[0], // Salvar apenas YYYY-MM-DD
        paid_value: paidValue,
        updated_at: new Date().toISOString()
      })
      .eq('id', invoiceId);

    if (invoiceError) {
      console.error('Error updating invoice:', invoiceError);
      throw invoiceError;
    }

    // 2. Criar transação de receita no fluxo de caixa
    const paymentYear = new Date(paymentDate).getFullYear();
    const paymentMonth = new Date(paymentDate).getMonth() + 1;

    const transaction = {
      type: 'income' as const,
      amount: paidValue,
      method: 'transferencia' as const, // Método padrão para pagamentos de notas
      description: `Pagamento da NF ${invoice.invoice_number} - ${invoice.unit_name}`,
      transaction_date: paymentDate.split('T')[0],
      fonte_pagadora: invoice.unit_name,
      com_nota: true, // Indicar que veio de uma nota fiscal
      // Campos opcionais
      category: null,
      so_recibo: false,
      fornecedor: null,
      idhs: false,
      geral: false
    };

    const { error: transactionError } = await supabase
      .from('cash_flow_transactions')
      .insert([{
        ...transaction,
        user_id: user.id
      }]);

    if (transactionError) {
      console.error('Error creating transaction:', transactionError);
      // Se falhar ao criar transação, podemos reverter o status da invoice?
      throw transactionError;
    }

    // 3. Recarregar dados
    await refreshData();
  };

  // Refresh completo dos dados
  const refreshData = useCallback(async (month?: string) => {
    setLoading(true);
    
    try {
      await Promise.all([
        loadUnits(),
        loadFixedExpenses().then(data => setFixedExpenses(data))
      ]);
      
      // Carregar invoices
      const invoicesData = await loadInvoices();
      setInvoices(invoicesData);

      // Se tiver mês selecionado, carregar transações do mês
      if (month) {
        const [year, monthNum] = month.split('-').map(Number);
        const transactionsData = await loadTransactions(year, monthNum);
        setTransactions(transactionsData);
      } else {
        // Se não, carregar do mês atual
        const today = new Date();
        const transactionsData = await loadTransactions(today.getFullYear(), today.getMonth() + 1);
        setTransactions(transactionsData);
      }
    } catch (error) {
      console.error('Error refreshing data:', error);
    } finally {
      setLoading(false);
    }
  }, [loadUnits, loadFixedExpenses, loadInvoices, loadTransactions]);

  // Calcular totais do mês
  const getMonthlyTotals = (month: string) => {
    const [year, monthNum] = month.split('-').map(Number);
    
    // Filtrar transações do mês
    const monthlyTransactions = transactions.filter(t => {
      const [tYear, tMonth] = t.transaction_date.split('-').map(Number);
      return tYear === year && tMonth === monthNum;
    });

    // Filtrar invoices pagas no mês (para garantir consistência)
    const paidInvoicesThisMonth = invoices.filter(i => {
      if (i.payment_status !== 'PAGO' || !i.payment_date) return false;
      const [pYear, pMonth] = i.payment_date.split('-').map(Number);
      return pYear === year && pMonth === monthNum;
    });

    const income = monthlyTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const expense = monthlyTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const pendingInvoices = invoices
      .filter(i => i.payment_status !== 'PAGO')
      .reduce((sum, i) => sum + Number(i.net_value), 0);

    return { 
      income, 
      expense, 
      pendingInvoices,
      initialBalance: 0, // Será calculado separadamente
      finalBalance: 0
    };
  };

  // Efeito inicial
  useEffect(() => {
    if (user) {
      refreshData();
    }
  }, [user, refreshData]);

  return (
    <FinancialContext.Provider value={{
      transactions,
      invoices,
      units,
      fixedExpenses,
      loading,
      refreshData,
      addTransaction,
      updateInvoiceStatus,
      getMonthlyTotals,
      loadInitialBalance,
      saveInitialBalance
    }}>
      {children}
    </FinancialContext.Provider>
  );
}

export const useFinancial = () => useContext(FinancialContext);
