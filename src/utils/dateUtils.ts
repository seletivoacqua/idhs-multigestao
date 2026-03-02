// ===========================================
// UTILITÁRIO DE DATAS - Corrige fuso horário
// ===========================================

/**
 * Converte uma data do banco (UTC) para exibição no front
 * Sempre mostra a data correta independente do fuso
 */
export function formatDateToDisplay(dateString: string | null): string {
  if (!dateString) return '';
  
  // Extrair apenas a parte da data (YYYY-MM-DD)
  const datePart = dateString.split('T')[0];
  
  if (!datePart) return '';
  
  // Dividir em ano, mês, dia
  const [year, month, day] = datePart.split('-').map(Number);
  
  // Criar data no fuso LOCAL (não UTC)
  // Mês é 0-indexado no JavaScript, por isso month-1
  const localDate = new Date(year, month - 1, day);
  
  // Formatar
  return localDate.toLocaleDateString('pt-BR');
}

/**
 * Converte uma data do front para salvar no banco
 * Garante que seja armazenada como YYYY-MM-DD sem timezone
 */
export function formatDateToDatabase(dateString: string): string {
  // A data já vem no formato YYYY-MM-DD do input type="date"
  // Garantir que seja salva como UTC+0 à meia-noite
  return `${dateString}T00:00:00.000Z`;
}

/**
 * Extrai apenas YYYY-MM-DD de uma data do banco
 */
export function extractDatePart(dateString: string | null): string | null {
  if (!dateString) return null;
  return dateString.split('T')[0];
}

/**
 * Força a exibição de uma data, retornando string vazia se nula
 */
export function forceDateToDisplay(dateString: string | null | undefined): string {
  if (!dateString) return '';
  return formatDateToDisplay(dateString);
}

/**
 * Compara se date1 >= date2 (ambas em formato YYYY-MM-DD)
 */
export function isDateGreaterOrEqual(date1: string | null, date2: string | null): boolean {
  if (!date1 || !date2) return false;
  return date1 >= date2;
}
