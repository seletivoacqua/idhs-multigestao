// ===========================================
// FUNÇÕES UTILITÁRIAS PARA MANIPULAÇÃO DE DATAS
// ===========================================

/**
 * Formata uma data ISO (YYYY-MM-DD) para exibição (DD/MM/AAAA)
 */
export function formatDateToDisplay(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  
  // Se já estiver no formato DD/MM/AAAA, retorna como está
  if (dateStr.includes('/')) {
    return dateStr;
  }
  
  // Converte YYYY-MM-DD para DD/MM/AAAA
  const parts = dateStr.split('T')[0].split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts;
    return `${day}/${month}/${year}`;
  }
  
  return dateStr;
}

/**
 * Força a conversão de qualquer formato para DD/MM/AAAA
 */
export function forceDateToDisplay(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  
  // Se já estiver no formato DD/MM/AAAA, retorna como está
  if (dateStr.includes('/')) {
    return dateStr;
  }
  
  // Tenta converter de ISO
  const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [_, year, month, day] = isoMatch;
    return `${day}/${month}/${year}`;
  }
  
  return dateStr;
}

/**
 * Formata uma data para o banco de dados (YYYY-MM-DD)
 */
export function formatDateToDatabase(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  
  // Se já estiver no formato ISO, retorna como está
  if (dateStr.includes('-') && dateStr.length >= 10) {
    return dateStr.split('T')[0];
  }
  
  // Converte DD/MM/AAAA para YYYY-MM-DD
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const [day, month, year] = parts;
    return `${year}-${month}-${day}`;
  }
  
  return dateStr;
}

/**
 * Extrai apenas a parte da data (YYYY-MM-DD) de uma string ISO
 */
export function extractDatePart(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  
  // Se for ISO com hora
  if (dateStr.includes('T')) {
    return dateStr.split('T')[0];
  }
  
  // Se for apenas YYYY-MM-DD
  if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return dateStr;
  }
  
  // Se for DD/MM/AAAA, converte para YYYY-MM-DD
  if (dateStr.includes('/')) {
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      const [day, month, year] = parts;
      return `${year}-${month}-${day}`;
    }
  }
  
  return dateStr;
}

/**
 * Verifica se data1 é maior ou igual a data2
 */
export function isDateGreaterOrEqual(date1: string, date2: string): boolean {
  const d1 = extractDatePart(date1);
  const d2 = extractDatePart(date2);
  
  if (!d1 || !d2) return false;
  
  return d1 >= d2;
}

// ===========================================
// NOVAS FUNÇÕES PARA INPUT MANUAL DE DATAS
// ===========================================

/**
 * Formata a data enquanto o usuário digita (máscara DD/MM/AAAA)
 */
export function formatDateInput(value: string): string {
  // Remove tudo que não é número
  const numbers = value.replace(/\D/g, '');
  
  // Aplica a máscara DD/MM/AAAA
  if (numbers.length <= 2) {
    return numbers;
  } else if (numbers.length <= 4) {
    return `${numbers.slice(0, 2)}/${numbers.slice(2)}`;
  } else {
    return `${numbers.slice(0, 2)}/${numbers.slice(2, 4)}/${numbers.slice(4, 8)}`;
  }
}

/**
 * Converte data do formato DD/MM/AAAA para YYYY-MM-DD (banco de dados)
 */
export function parseDateInput(dateStr: string): string {
  if (!dateStr) return '';
  
  // Se já estiver no formato ISO, retorna como está
  if (dateStr.includes('-') && dateStr.length === 10) {
    return dateStr;
  }
  
  // Converte DD/MM/AAAA para YYYY-MM-DD
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const [day, month, year] = parts;
    // Valida se tem 2 dígitos para dia e mês, 4 para ano
    if (day.length === 2 && month.length === 2 && year.length === 4) {
      return `${year}-${month}-${day}`;
    }
  }
  
  return dateStr;
}

/**
 * Converte data do formato YYYY-MM-DD para DD/MM/AAAA (exibição)
 */
export function formatDateForInput(dateStr: string): string {
  if (!dateStr) return '';
  
  // Se estiver no formato DD/MM/AAAA, retorna como está
  if (dateStr.includes('/')) {
    return dateStr;
  }
  
  // Converte YYYY-MM-DD para DD/MM/AAAA
  const parts = dateStr.split('T')[0].split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts;
    // Garante que dia e mês tenham 2 dígitos
    return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
  }
  
  return dateStr;
}

/**
 * Valida se a data está no formato DD/MM/AAAA e é uma data válida
 */
export function isValidDate(dateStr: string): boolean {
  if (!dateStr) return false;
  
  // Verifica se está no formato DD/MM/AAAA
  const pattern = /^(\d{2})\/(\d{2})\/(\d{4})$/;
  if (!pattern.test(dateStr)) return false;
  
  const [_, day, month, year] = dateStr.match(pattern) || [];
  const dayNum = parseInt(day, 10);
  const monthNum = parseInt(month, 10);
  const yearNum = parseInt(year, 10);
  
  // Verifica se é uma data válida
  const date = new Date(yearNum, monthNum - 1, dayNum);
  return date.getDate() === dayNum && 
         date.getMonth() === monthNum - 1 && 
         date.getFullYear() === yearNum;
}

/**
 * Compara duas datas no formato DD/MM/AAAA
 * Retorna: -1 se date1 < date2, 0 se igual, 1 se date1 > date2
 */
export function compareDates(date1: string, date2: string): number {
  const d1 = parseDateInput(date1).replace(/-/g, '');
  const d2 = parseDateInput(date2).replace(/-/g, '');
  
  if (d1 < d2) return -1;
  if (d1 > d2) return 1;
  return 0;
}

/**
 * Verifica se uma data está dentro de um intervalo
 */
export function isDateInRange(date: string, startDate: string, endDate: string): boolean {
  return compareDates(date, startDate) >= 0 && compareDates(date, endDate) <= 0;
}

/**
 * Obtém a data atual no formato DD/MM/AAAA
 */
export function getCurrentDateFormatted(): string {
  const today = new Date();
  const day = today.getDate().toString().padStart(2, '0');
  const month = (today.getMonth() + 1).toString().padStart(2, '0');
  const year = today.getFullYear();
  
  return `${day}/${month}/${year}`;
}

/**
 * Converte uma data do formato DD/MM/AAAA para objeto Date
 */
export function parseDateToObject(dateStr: string): Date | null {
  if (!isValidDate(dateStr)) return null;
  
  const [day, month, year] = dateStr.split('/').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Formata um objeto Date para DD/MM/AAAA
 */
export function formatDateObjectToInput(date: Date): string {
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  
  return `${day}/${month}/${year}`;
}

export function getEADAccessStatus(
  access_date_1: string | null, 
  access_date_2: string | null, 
  access_date_3: string | null
): { 
  isApproved: boolean; 
  lastAccessDate: string | null;
  totalAccesses: number;
  message: string;
} {
  const totalAccesses = [access_date_1, access_date_2, access_date_3].filter(Boolean).length;
  const lastAccessDate = access_date_3 || access_date_2 || access_date_1 || null;
  const isApproved = !!access_date_3; // Aprovado apenas se tiver o 3º acesso
  
  let message = '';
  if (isApproved) {
    message = '✅ Aprovado - Concluiu o curso';
  } else if (access_date_2) {
    message = '⏳ Em andamento - Falta o último acesso';
  } else if (access_date_1) {
    message = '⏳ Em andamento - Faltam 2 acessos';
  } else {
    message = '⏳ Sem acessos registrados';
  }
  
  return {
    isApproved,
    lastAccessDate,
    totalAccesses,
    message
  };
}
