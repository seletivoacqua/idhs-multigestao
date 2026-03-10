import { useState, useEffect, useRef } from 'react';
import { Filter, FileSpreadsheet, FileText, FileBarChart, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import logoImg from '../../assets/image.png';
import { SyntheticReportModal } from './SyntheticReportModal';
import { 
  formatDateToDisplay, 
  forceDateToDisplay, 
  formatDateToDatabase, 
  extractDatePart, 
  isDateGreaterOrEqual,
  formatDateInput,
  parseDateInput,
  formatDateForInput,
  isValidDate,
  compareDates,
  isDateInRange
} from '../../utils/dateUtils';

interface Unit {
  id: string;
  name: string;
  municipality: string;
}

interface Cycle {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: 'active' | 'closed';
}

interface Class {
  id: string;
  name: string;
  day_of_week: string;
  class_time: string;
  total_classes: number;
  modality: string;
}

interface ReportData {
  unitId: string;
  unitName: string;
  studentName: string;
  studentCpf: string;
  className: string;
  classId: string;
  cycleName: string;
  cycleId: string;
  modality: string;
  classesAttended: number;
  totalClassesConsidered: number;
  ultimoAcesso: string;
  frequency: string;
  frequencyValue: number;
  situacao: 'FREQUENTE' | 'INCOMPLETO';
  totalAccesses: number;
  isFrequente?: boolean;
  accessDates?: string[];
  enrollmentDate?: string;
  enrollmentType?: 'regular' | 'exceptional';
}

export function ReportsTab() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [reportData, setReportData] = useState<ReportData[]>([]);
  const [filteredReportData, setFilteredReportData] = useState<ReportData[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    cycleId: '',
    classId: '',
    unitId: '',
    modality: 'all',
    studentName: '',
    situacao: 'all',
  });
  
  // Controle para gerar relatório apenas quando necessário
  const [shouldGenerateReport, setShouldGenerateReport] = useState(true);
  
  const { user } = useAuth();
  const reportRef = useRef<HTMLDivElement>(null);
  const [isSyntheticModalOpen, setIsSyntheticModalOpen] = useState(false);

  const [stats, setStats] = useState({
    totalStudents: 0,
    frequentes: 0,
    incompletos: 0,
    totalEAD: 0,
    totalVideoconferencia: 0,
  });

  // Função auxiliar para extrair data
  const extractDatePart = (dateStr: string | null | undefined): string | null => {
    if (!dateStr) return null;
    return dateStr.split('T')[0];
  };

  // Função para formatar data no padrão brasileiro
  const formatDateBR = (dateStr: string | null | undefined): string => {
    if (!dateStr) return '-';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('pt-BR');
    } catch {
      return '-';
    }
  };

  // Função para encontrar a data mais recente entre os acessos
  const getMostRecentDate = (dates: (string | null)[]): string | null => {
    const validDates = dates.filter(d => d !== null) as string[];
    if (validDates.length === 0) return null;
    
    const dateObjects = validDates.map(d => new Date(d));
    const mostRecent = new Date(Math.max(...dateObjects.map(d => d.getTime())));
    return mostRecent.toISOString().split('T')[0];
  };

  // Carregar dados iniciais apenas uma vez
  useEffect(() => {
    if (user) {
      loadUnits();
      loadCycles();
      loadClasses();
    }
  }, [user]);

  // Gerar relatório apenas quando shouldGenerateReport for true
  useEffect(() => {
    if (user && shouldGenerateReport) {
      generateReport();
    }
  }, [shouldGenerateReport, user]);

  // Aplicar filtros localmente sem recarregar do banco
  useEffect(() => {
    if (reportData.length > 0) {
      applyFilters();
    }
  }, [filters, reportData]);

  const loadUnits = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('units')
      .select('id, name, municipality')
      .order('name');
    setUnits(data || []);
  };

  const loadCycles = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('cycles')
      .select('id, name, start_date, end_date, status')
      .order('created_at', { ascending: false });
    setCycles(data || []);
  };

  const loadClasses = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('classes')
      .select('id, name, day_of_week, class_time, total_classes, modality')
      .order('name');
    setClasses(data || []);
  };

  // Aplicar filtros localmente
  const applyFilters = () => {
    let filtered = [...reportData];

    // Filtrar por ciclo
    if (filters.cycleId) {
      filtered = filtered.filter(item => item.cycleId === filters.cycleId);
    }

    // Filtrar por turma
    if (filters.classId) {
      filtered = filtered.filter(item => item.classId === filters.classId);
    }

    // Filtrar por unidade
    if (filters.unitId) {
      filtered = filtered.filter(item => item.unitId === filters.unitId);
    }

    // Filtrar por modalidade
    if (filters.modality !== 'all') {
      filtered = filtered.filter(item => 
        filters.modality === 'EAD' 
          ? item.modality.includes('EAD')
          : item.modality.includes('Videoconferência')
      );
    }

    // Filtrar por nome
    if (filters.studentName) {
      const search = filters.studentName.toLowerCase();
      filtered = filtered.filter(item => 
        item.studentName.toLowerCase().includes(search)
      );
    }

    // Filtrar por situação
    if (filters.situacao !== 'all') {
      filtered = filtered.filter(item => 
        item.situacao === (filters.situacao === 'frequentes' ? 'FREQUENTE' : 'INCOMPLETO')
      );
    }

    // Filtrar por período (datas)
    if (filters.startDate || filters.endDate) {
      filtered = filtered.filter(item => {
        // Extrair data do último acesso
        const ultimoAcessoParts = item.ultimoAcesso.split('/');
        if (ultimoAcessoParts.length === 3) {
          const ultimoAcessoISO = `${ultimoAcessoParts[2]}-${ultimoAcessoParts[1]}-${ultimoAcessoParts[0]}`;
          
          if (filters.startDate && ultimoAcessoISO < filters.startDate) return false;
          if (filters.endDate && ultimoAcessoISO > filters.endDate) return false;
        }
        return true;
      });
    }

    setFilteredReportData(filtered);
    calculateStats(filtered);
  };

  // Calcular estatísticas
  const calculateStats = (data: ReportData[]) => {
    setStats({
      totalStudents: data.length,
      frequentes: data.filter(d => d.situacao === 'FREQUENTE').length,
      incompletos: data.filter(d => d.situacao === 'INCOMPLETO').length,
      totalEAD: data.filter(d => d.modality.includes('EAD')).length,
      totalVideoconferencia: data.filter(d => d.modality.includes('Videoconferência')).length,
    });
  };

  // Gerar relatório completo
  const generateReport = async () => {
    if (!user) return;
    
    setLoading(true);
    setInitialLoading(false);

    try {
      console.log('🔄 Gerando relatório...');
      
      // Buscar todas as turmas
      let classesQuery = supabase
        .from('classes')
        .select(`
          id,
          name,
          modality,
          total_classes,
          cycle_id,
          courses (name, modality),
          cycles (id, name, start_date, end_date, status)
        `);

      // Aplicar filtro de ciclo se selecionado
      if (filters.cycleId) {
        classesQuery = classesQuery.eq('cycle_id', filters.cycleId);
      }

      const { data: classes, error: classesError } = await classesQuery;

      if (classesError) {
        console.error('Erro ao carregar turmas:', classesError);
        throw classesError;
      }

      console.log(`📚 Total de turmas: ${classes?.length || 0}`);

      const allReportData: ReportData[] = [];

      // Para cada turma, buscar alunos matriculados
      for (const cls of classes || []) {
        const { data: classStudents, error: studentsError } = await supabase
          .from('class_students')
          .select(`
            id,
            student_id,
            enrollment_date,
            enrollment_type,
            current_status,
            students (
              id,
              full_name,
              cpf,
              unit_id,
              units (
                id,
                name,
                municipality
              )
            )
          `)
          .eq('class_id', cls.id);

        if (studentsError) {
          console.error(`Erro ao carregar alunos da turma ${cls.name}:`, studentsError);
          continue;
        }

        if (!classStudents || classStudents.length === 0) continue;

        console.log(`👥 Turma ${cls.name}: ${classStudents.length} alunos`);

        // Para cada aluno, buscar dados específicos da modalidade
        for (const cs of classStudents) {
          // Dados da unidade
          let unitName = 'Não informado';
          let unitId = cs.students?.unit_id || '';

          if (cs.students?.units) {
            unitName = cs.students.units.name;
            unitId = cs.students.units.id;
          }

          // Dados de matrícula
          const enrollmentDate = extractDatePart(cs.enrollment_date);
          const enrollmentType = cs.enrollment_type;

          // Variáveis para armazenar os dados calculados
          let classesAttended = 0;
          let totalClassesConsidered = 0;
          let ultimoAcesso = '-';
          let frequency = '';
          let frequencyValue = 0;
          let situacao: 'FREQUENTE' | 'INCOMPLETO' = 'INCOMPLETO';
          let totalAccesses = 0;
          let isFrequente = false;

          if (cls.modality === 'VIDEOCONFERENCIA') {
            // ===========================================
            // VIDEOCONFERÊNCIA: Calcular frequência real
            // ===========================================
            
            // Buscar todas as frequências do aluno
            const { data: attendanceData } = await supabase
              .from('attendance')
              .select('class_number, class_date, present')
              .eq('class_id', cls.id)
              .eq('student_id', cs.student_id)
              .order('class_number');

            if (attendanceData && attendanceData.length > 0) {
              // Filtrar por data de matrícula (se for matrícula excepcional)
              const relevantAttendance = attendanceData.filter(att => {
                if (enrollmentType !== 'exceptional' || !enrollmentDate) return true;
                const attDate = extractDatePart(att.class_date);
                return attDate && attDate >= enrollmentDate;
              });

              // Contar presenças
              classesAttended = relevantAttendance.filter(a => a.present).length;
              
              // Contar aulas únicas realizadas (para este aluno)
              const uniqueClasses = new Set(relevantAttendance.map(a => a.class_number));
              totalClassesConsidered = uniqueClasses.size;

              // 🔥 REGRA CORRETA: FREQUENTE se ≥60%
              frequencyValue = totalClassesConsidered > 0 
                ? (classesAttended / totalClassesConsidered) * 100 
                : 0;
              frequency = `${frequencyValue.toFixed(1)}%`;
              
              situacao = frequencyValue >= 60 ? 'FREQUENTE' : 'INCOMPLETO';

              // Último acesso (data mais recente com presença ou registro)
              if (relevantAttendance.length > 0) {
                const dates = relevantAttendance.map(a => a.class_date);
                const mostRecent = getMostRecentDate(dates);
                ultimoAcesso = mostRecent ? formatDateBR(mostRecent) : '-';
              }
            } else {
              // Aluno sem nenhuma frequência registrada
              classesAttended = 0;
              totalClassesConsidered = 0;
              frequency = '0.0%';
              frequencyValue = 0;
              situacao = 'INCOMPLETO';
              ultimoAcesso = '-';
            }

          } else {
            // ===========================================
            // EAD: Usar frequência manual do professor
            // ===========================================
            
            // Buscar dados de acesso EAD
            const { data: accessData } = await supabase
              .from('ead_access')
              .select('access_date_1, access_date_2, access_date_3, is_frequente')
              .eq('class_id', cls.id)
              .eq('student_id', cs.student_id)
              .maybeSingle();

            // 🔥 REGRA EAD: Situação baseada no campo is_frequente (manual)
            isFrequente = accessData?.is_frequente === true;

            // Contar acessos registrados (apenas para informação)
            const allAccesses = [
              accessData?.access_date_1,
              accessData?.access_date_2,
              accessData?.access_date_3,
            ];

            const validAccesses = allAccesses.filter(date => date !== null) as string[];
            totalAccesses = validAccesses.length;
            
            // Para EAD, consideramos 3 como total possível de acessos
            totalClassesConsidered = 3;
            classesAttended = totalAccesses;
            
            // Calcular percentual (apenas informativo, não usado para aprovação)
            frequencyValue = (totalAccesses / 3) * 100;
            frequency = `${frequencyValue.toFixed(1)}%`;
            
            // Último acesso
            if (validAccesses.length > 0) {
              const mostRecent = getMostRecentDate(validAccesses);
              ultimoAcesso = mostRecent ? formatDateBR(mostRecent) : '-';
            }

            // 🔥 DECISÃO: Baseada APENAS no is_frequente
            situacao = isFrequente ? 'FREQUENTE' : 'INCOMPLETO';
          }

          // Adicionar ao relatório
          allReportData.push({
            unitId,
            unitName,
            studentName: cs.students?.full_name || 'Nome não informado',
            studentCpf: cs.students?.cpf || '',
            className: cls.name,
            classId: cls.id,
            cycleName: cls.cycles?.name || 'Sem ciclo',
            cycleId: cls.cycles?.id || '',
            modality: cls.modality === 'VIDEOCONFERENCIA' ? 'Videoconferência' : 'EAD 24h',
            classesAttended,
            totalClassesConsidered,
            ultimoAcesso,
            frequency,
            frequencyValue,
            situacao,
            totalAccesses,
            isFrequente: cls.modality === 'EAD' ? isFrequente : undefined,
            enrollmentDate: enrollmentDate || undefined,
            enrollmentType,
          });
        }
      }

      console.log(`📊 Total de registros: ${allReportData.length}`);
      
      // Ordenar por nome do aluno
      allReportData.sort((a, b) => a.studentName.localeCompare(b.studentName));

      setReportData(allReportData);
      applyFilters(); // Aplicar filtros após carregar

    } catch (error) {
      console.error('❌ Erro ao gerar relatório:', error);
      alert('Erro ao carregar dados. Tente novamente.');
    } finally {
      setLoading(false);
      setShouldGenerateReport(false);
    }
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  // Recarregar relatório manualmente
  const handleRefreshReport = () => {
    setShouldGenerateReport(true);
  };

  // Exportar para XLSX
  const exportToXLSX = () => {
    if (filteredReportData.length === 0) return;

    const headers = [
      'UNIDADE', 
      'ALUNO', 
      'CPF', 
      'TURMA', 
      'CICLO', 
      'MODALIDADE', 
      'TIPO MATRÍCULA', 
      'DATA MATRÍCULA',
      'AULAS/ACESSOS', 
      'ÚLTIMO ACESSO', 
      'FREQUÊNCIA', 
      'STATUS MANUAL (EAD)', 
      'SITUAÇÃO'
    ];

    const rows = filteredReportData.map((row) => [
      row.unitName,
      row.studentName,
      row.studentCpf,
      row.className,
      row.cycleName,
      row.modality,
      row.enrollmentType === 'exceptional' ? 'Excepcional' : 'Regular',
      row.enrollmentDate ? formatDateBR(row.enrollmentDate) : '-',
      row.modality.includes('EAD') 
        ? `${row.totalAccesses}/3 acessos` 
        : `${row.classesAttended}/${row.totalClassesConsidered} aulas`,
      row.ultimoAcesso,
      row.frequency,
      row.modality.includes('EAD') 
        ? (row.isFrequente ? 'FREQUENTE (manual)' : 'NÃO FREQUENTE (manual)')
        : 'N/A',
      row.situacao,
    ]);

    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);

    const colWidths = headers.map((_, idx) => {
      const maxLength = Math.max(
        headers[idx].length,
        ...rows.map(row => (row[idx]?.toString() || '').length)
      );
      return { wch: Math.min(maxLength + 2, 50) };
    });
    worksheet['!cols'] = colWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Relatório Acadêmico');
    XLSX.writeFile(workbook, `relatorio_academico_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // Exportar para PDF
  const exportToPDF = async () => {
    if (!reportRef.current || filteredReportData.length === 0) return;

    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 10;
    const contentWidth = pageWidth - 2 * margin;

    // Criar elemento para a tabela
    const createTableElement = (startRow: number, endRow: number) => {
      const tableElement = document.createElement('table');
      tableElement.style.width = '100%';
      tableElement.style.borderCollapse = 'collapse';
      tableElement.style.fontSize = '8px';
      tableElement.style.fontFamily = 'Arial, sans-serif';

      const thead = document.createElement('thead');
      const headerRow = document.createElement('tr');
      
      const headers = [
        'UNIDADE', 'ALUNO', 'TURMA', 'CICLO', 'MODALIDADE', 
        'MATRÍCULA', 'AULAS/ACESSOS', 'ÚLTIMO ACESSO', 'FREQ.', 'SITUAÇÃO'
      ];

      headers.forEach(headerText => {
        const th = document.createElement('th');
        th.textContent = headerText;
        th.style.padding = '4px 2px';
        th.style.backgroundColor = '#1e293b';
        th.style.color = 'white';
        th.style.border = '1px solid #334155';
        th.style.textAlign = 'left';
        th.style.fontWeight = 'bold';
        th.style.fontSize = '8px';
        headerRow.appendChild(th);
      });
      thead.appendChild(headerRow);
      tableElement.appendChild(thead);

      const tbody = document.createElement('tbody');
      for (let i = startRow; i < endRow && i < filteredReportData.length; i++) {
        const row = filteredReportData[i];
        const tr = document.createElement('tr');
        
        const enrollmentInfo = row.enrollmentType === 'exceptional' 
          ? `Exc: ${formatDateBR(row.enrollmentDate)}` 
          : `Reg: ${formatDateBR(row.enrollmentDate)}`;

        const cells = [
          row.unitName.substring(0, 20),
          row.studentName.substring(0, 25),
          row.className.substring(0, 15),
          row.cycleName.substring(0, 15),
          row.modality.includes('EAD') ? 'EAD' : 'VC',
          enrollmentInfo,
          row.modality.includes('EAD') 
            ? `${row.totalAccesses}/3` 
            : `${row.classesAttended}/${row.totalClassesConsidered}`,
          row.ultimoAcesso,
          row.frequency,
          row.situacao,
        ];

        cells.forEach((cellText, idx) => {
          const td = document.createElement('td');
          td.textContent = cellText;
          td.style.padding = '3px 2px';
          td.style.border = '1px solid #cbd5e1';
          td.style.fontSize = '7px';
          td.style.backgroundColor = i % 2 === 0 ? '#ffffff' : '#f8fafc';
          
          // Cor de fundo baseada na situação (última coluna)
          if (idx === 9) {
            td.style.backgroundColor = row.situacao === 'FREQUENTE' ? '#dcfce7' : '#fee2e2';
            td.style.color = row.situacao === 'FREQUENTE' ? '#166534' : '#991b1b';
            td.style.fontWeight = 'bold';
            td.style.textAlign = 'center';
          }
          
          tr.appendChild(td);
        });
        
        tbody.appendChild(tr);
      }
      tableElement.appendChild(tbody);

      return tableElement;
    };

    const rowsPerPage = 18;
    const totalPages = Math.ceil(filteredReportData.length / rowsPerPage);

    for (let page = 0; page < totalPages; page++) {
      if (page > 0) pdf.addPage();

      try {
        pdf.addImage(logoImg, 'PNG', margin, margin, 25, 10);
      } catch (e) {
        console.warn('Logo não pôde ser carregada');
      }

      pdf.setFontSize(16);
      pdf.setTextColor(30, 41, 59);
      pdf.setFont('helvetica', 'bold');
      pdf.text('RELATÓRIO ACADÊMICO', pageWidth / 2, margin + 12, { align: 'center' });

      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(71, 85, 105);
      pdf.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, pageWidth / 2, margin + 18, { align: 'center' });

      pdf.setDrawColor(203, 213, 225);
      pdf.line(margin, margin + 20, pageWidth - margin, margin + 20);

      let yPos = margin + 26;
      pdf.setFontSize(9);
      pdf.setTextColor(51, 65, 85);
      
      const filterInfo: string[] = [];
      
      const selectedCycle = cycles.find(c => c.id === filters.cycleId);
      if (selectedCycle) filterInfo.push(`Ciclo: ${selectedCycle.name}`);
      
      const selectedUnit = units.find(u => u.id === filters.unitId);
      if (selectedUnit) filterInfo.push(`Unidade: ${selectedUnit.name}`);
      
      const selectedClass = classes.find(c => c.id === filters.classId);
      if (selectedClass) filterInfo.push(`Turma: ${selectedClass.name}`);
      
      if (filters.modality !== 'all') {
        filterInfo.push(`Modalidade: ${filters.modality === 'VIDEOCONFERENCIA' ? 'Videoconferência' : 'EAD'}`);
      }
      
      if (filters.startDate && filters.endDate) {
        filterInfo.push(`Período: ${new Date(filters.startDate).toLocaleDateString('pt-BR')} a ${new Date(filters.endDate).toLocaleDateString('pt-BR')}`);
      }
      
      if (filters.studentName) filterInfo.push(`Busca: ${filters.studentName}`);

      pdf.text(filterInfo.join(' • ') || 'Todos os filtros', margin, yPos);

      yPos += 8;
      
      // Cards de estatísticas
      pdf.setFillColor(59, 130, 246);
      pdf.roundedRect(margin, yPos, 40, 14, 2, 2, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(8);
      pdf.text('Total', margin + 5, yPos + 5);
      pdf.setFontSize(10);
      pdf.text(stats.totalStudents.toString(), margin + 5, yPos + 11);
      
      pdf.setFillColor(34, 197, 94);
      pdf.roundedRect(margin + 50, yPos, 40, 14, 2, 2, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(8);
      pdf.text('Freq≥60%', margin + 55, yPos + 5);
      pdf.setFontSize(10);
      pdf.text(stats.frequentes.toString(), margin + 55, yPos + 11);
      
      pdf.setFillColor(239, 68, 68);
      pdf.roundedRect(margin + 100, yPos, 40, 14, 2, 2, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(8);
      pdf.text('Incomp', margin + 105, yPos + 5);
      pdf.setFontSize(10);
      pdf.text(stats.incompletos.toString(), margin + 105, yPos + 11);

      // Informação adicional sobre EAD
      pdf.setTextColor(100, 116, 139);
      pdf.setFontSize(8);
      pdf.text(`EAD: ${stats.totalEAD} | VC: ${stats.totalVideoconferencia}`, margin + 150, yPos + 8);

      yPos += 20;

      const tableStartY = yPos;
      const startRow = page * rowsPerPage;
      const endRow = Math.min(startRow + rowsPerPage, filteredReportData.length);
      
      if (startRow < filteredReportData.length) {
        const tableElement = createTableElement(startRow, endRow);
        
        const tempDiv = document.createElement('div');
        tempDiv.style.position = 'absolute';
        tempDiv.style.left = '-9999px';
        tempDiv.style.top = '0';
        tempDiv.style.width = `${contentWidth * 3.78}px`;
        tempDiv.appendChild(tableElement);
        document.body.appendChild(tempDiv);

        const canvas = await html2canvas(tableElement, {
          scale: 2,
          logging: false,
          backgroundColor: '#ffffff',
        });

        const imgData = canvas.toDataURL('image/png');
        const imgHeight = (canvas.height * contentWidth) / canvas.width;
        
        pdf.addImage(imgData, 'PNG', margin, tableStartY, contentWidth, imgHeight);
        
        document.body.removeChild(tempDiv);
      }

      pdf.setFontSize(8);
      pdf.setTextColor(148, 163, 184);
      pdf.text(
        `Página ${page + 1} de ${totalPages} • Total de registros: ${filteredReportData.length}`,
        pageWidth / 2,
        pageHeight - 5,
        { align: 'center' }
      );
    }

    pdf.save(`relatorio_academico_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  // Usar filteredReportData para exibição
  const displayData = filteredReportData;

  // Calcular porcentagens para os cards
  const frequentesPercentage = stats.totalStudents > 0
    ? (stats.frequentes / stats.totalStudents) * 100
    : 0;
  const incompletosPercentage = stats.totalStudents > 0
    ? (stats.incompletos / stats.totalStudents) * 100
    : 0;

  return (
    <div className="space-y-6" ref={reportRef}>
      {/* Header com botões */}
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <img src={logoImg} alt="Logo" className="h-10 w-auto" />
          <h2 className="text-xl font-semibold text-slate-800">Relatório Acadêmico</h2>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleRefreshReport}
            disabled={loading}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Carregando...' : 'Atualizar Dados'}</span>
          </button>
          <button
            onClick={() => setIsSyntheticModalOpen(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
          >
            <FileBarChart className="w-5 h-5" />
            <span>Relatório Sintético</span>
          </button>
          <button
            onClick={exportToXLSX}
            disabled={displayData.length === 0 || loading}
            className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            <FileSpreadsheet className="w-5 h-5" />
            <span>Exportar XLSX</span>
          </button>
          <button
            onClick={exportToPDF}
            disabled={displayData.length === 0 || loading}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            <FileText className="w-5 h-5" />
            <span>Gerar PDF</span>
          </button>
        </div>
      </div>

      <SyntheticReportModal
        isOpen={isSyntheticModalOpen}
        onClose={() => setIsSyntheticModalOpen(false)}
      />

      {/* Filtros */}
      <div className="bg-white border border-slate-200 rounded-lg p-6">
        <div className="flex items-center space-x-2 mb-4">
          <Filter className="w-5 h-5 text-slate-600" />
          <h3 className="font-semibold text-slate-800">Filtros</h3>
          {loading && <span className="text-sm text-blue-600 ml-2">(Atualizando...)</span>}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Ciclo</label>
            <select
              value={filters.cycleId}
              onChange={(e) => handleFilterChange('cycleId', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500"
            >
              <option value="">Todos os ciclos</option>
              {cycles.map((cycle) => (
                <option key={cycle.id} value={cycle.id}>
                  {cycle.name} {cycle.status === 'closed' ? '(Encerrado)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Turma</label>
            <select
              value={filters.classId}
              onChange={(e) => handleFilterChange('classId', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500"
            >
              <option value="">Todas as turmas</option>
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name} ({cls.modality})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Unidade</label>
            <select
              value={filters.unitId}
              onChange={(e) => handleFilterChange('unitId', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500"
            >
              <option value="">Todas as unidades</option>
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name} - {unit.municipality}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Modalidade</label>
            <select
              value={filters.modality}
              onChange={(e) => handleFilterChange('modality', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500"
            >
              <option value="all">Todas</option>
              <option value="VIDEOCONFERENCIA">Videoconferência</option>
              <option value="EAD">EAD 24h</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Situação</label>
            <select
              value={filters.situacao}
              onChange={(e) => handleFilterChange('situacao', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500"
            >
              <option value="all">Todas</option>
              <option value="frequentes">Apenas Frequentes</option>
              <option value="incompletos">Apenas Incompletos</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Data Início</label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => handleFilterChange('startDate', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Data Fim</label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => handleFilterChange('endDate', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-2">Buscar Aluno</label>
            <input
              type="text"
              placeholder="Digite o nome do aluno..."
              value={filters.studentName}
              onChange={(e) => handleFilterChange('studentName', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500"
            />
          </div>
        </div>

        {displayData.length > 0 && (
          <div className="mt-4 text-sm text-slate-600">
            Mostrando {displayData.length} de {reportData.length} registros
          </div>
        )}
      </div>

      {/* Cards de Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-600 font-medium">Total de Alunos</p>
          <p className="text-2xl font-bold text-blue-700">{stats.totalStudents}</p>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-sm text-green-600 font-medium">Frequentes (≥60%)</p>
          <p className="text-2xl font-bold text-green-700">{stats.frequentes}</p>
          <p className="text-xs text-green-600 mt-1">{frequentesPercentage.toFixed(1)}% do total</p>
        </div>

        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-600 font-medium">Incompletos (&lt;60%)</p>
          <p className="text-2xl font-bold text-red-700">{stats.incompletos}</p>
          <p className="text-xs text-red-600 mt-1">{incompletosPercentage.toFixed(1)}% do total</p>
        </div>

        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <p className="text-sm text-purple-600 font-medium">EAD</p>
          <p className="text-2xl font-bold text-purple-700">{stats.totalEAD}</p>
          <p className="text-xs text-purple-600 mt-1">Decisão manual do professor</p>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <p className="text-sm text-amber-600 font-medium">Videoconferência</p>
          <p className="text-2xl font-bold text-amber-700">{stats.totalVideoconferencia}</p>
          <p className="text-xs text-amber-600 mt-1">Mínimo 60% de presença</p>
        </div>
      </div>

      {/* Barra de distribuição */}
      {stats.totalStudents > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-slate-700">Distribuição por Situação</h4>
            <div className="flex space-x-4 text-xs">
              <span className="text-green-600 font-medium">
                Frequentes: {stats.frequentes} ({frequentesPercentage.toFixed(1)}%)
              </span>
              <span className="text-red-600 font-medium">
                Incompletos: {stats.incompletos} ({incompletosPercentage.toFixed(1)}%)
              </span>
            </div>
          </div>
          
          <div className="w-full h-10 bg-slate-200 rounded-lg overflow-hidden flex shadow-inner">
            <div
              className="bg-green-500 h-full flex items-center justify-center text-white text-xs font-medium transition-all duration-500 ease-out"
              style={{ width: `${frequentesPercentage}%` }}
            >
              {frequentesPercentage > 8 && (
                <span className="drop-shadow-md">
                  {frequentesPercentage.toFixed(0)}%
                </span>
              )}
            </div>
            
            <div
              className="bg-red-500 h-full flex items-center justify-center text-white text-xs font-medium transition-all duration-500 ease-out"
              style={{ width: `${incompletosPercentage}%` }}
            >
              {incompletosPercentage > 8 && (
                <span className="drop-shadow-md">
                  {incompletosPercentage.toFixed(0)}%
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tabela de Resultados */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-800 text-white">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">
                  TURMA
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">
                  CICLO
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">
                  MODALIDADE
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">
                  MATRÍCULA
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider">
                  AULAS/ACESSOS
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider">
                  ÚLTIMO ACESSO
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider">
                  FREQ.
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider">
                  STATUS EAD
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider">
                  SITUAÇÃO
                </th>
              </tr>
            </thead>
           <tbody className="divide-y divide-slate-200">
  {displayData.map((row, index) => (
    <tr key={`${row.studentCpf}-${row.classId}-${index}`} className={`hover:bg-slate-50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
      <td className="px-4 py-2 text-sm text-slate-700">{row.className}</td>
      <td className="px-4 py-2 text-sm text-slate-700">{row.cycleName}</td>
      <td className="px-4 py-2 text-sm text-slate-700">{row.modality}</td>
      <td className="px-4 py-2 text-sm">
        <div className="flex flex-col">
          <span className={`text-xs font-medium ${
            row.enrollmentType === 'exceptional' ? 'text-amber-600' : 'text-blue-600'
          }`}>
            {row.enrollmentType === 'exceptional' ? 'Excepcional' : 'Regular'}
          </span>
          <span className="text-xs text-slate-500">
            {row.enrollmentDate ? formatDateBR(row.enrollmentDate) : '-'}
          </span>
        </div>
      </td>
      <td className="px-4 py-2 text-sm text-center font-medium">
        {row.modality.includes('EAD') 
          ? `${row.totalAccesses}/3 acessos` 
          : `${row.classesAttended}/${row.totalClassesConsidered} aulas`}
      </td>
      <td className="px-4 py-2 text-sm text-center text-slate-600">
        {row.ultimoAcesso}
      </td>
      <td className="px-4 py-2 text-sm text-center font-medium">
        <span className={
          row.modality.includes('EAD')
            ? 'text-slate-600'
            : row.frequencyValue >= 60 
              ? 'text-green-600' 
              : 'text-red-600'
        }>
          {row.frequency}
        </span>
      </td>
      
      {/* COLUNA STATUS EAD */}
      {row.modality.includes('EAD') ? (
        <td className="px-4 py-2 text-sm text-center">
          <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
            row.isFrequente 
              ? 'bg-green-100 text-green-800 border border-green-300' 
              : 'bg-slate-100 text-slate-600 border border-slate-300'
          }`}>
            {row.isFrequente ? '✅ FREQUENTE' : '⚪ NÃO FREQUENTE'}
          </span>
        </td>
      ) : (
        <td className="px-4 py-2 text-sm text-center">
          <span className="text-xs text-slate-400">-</span>
        </td>
      )}
      
      {/* COLUNA SITUAÇÃO */}
      <td className="px-4 py-2 text-sm text-center">
        <div className="flex flex-col items-center">
          <span className={`inline-flex px-3 py-1 rounded-full text-xs font-bold ${
            row.situacao === 'FREQUENTE' 
              ? 'bg-green-500 text-white shadow-md' 
              : 'bg-red-500 text-white shadow-md'
          }`}>
            {row.situacao}
          </span>
          {!row.modality.includes('EAD') && row.situacao === 'INCOMPLETO' && (
            <div className="text-xs text-red-600 mt-1 whitespace-nowrap">
              {row.frequencyValue.toFixed(1)}% &lt; 60%
            </div>
          )}
        </div>
      </td>
    </tr>
  ))}
</tbody>
              
              {displayData.length === 0 && !loading && !initialLoading && (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center">
                      <FileBarChart className="w-12 h-12 text-slate-300 mb-3" />
                      <p className="text-lg">Nenhum dado encontrado</p>
                      <p className="text-sm text-slate-400 mt-1">
                        Tente ajustar os filtros ou clicar em "Atualizar Dados"
                      </p>
                    </div>
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center">
                      <RefreshCw className="w-12 h-12 text-slate-300 mb-3 animate-spin" />
                      <p className="text-lg">Carregando dados...</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Rodapé com informações adicionais */}
     {displayData.length > 0 && (
        <div className="flex justify-between items-center text-xs text-slate-500">
          <div>
            Total de registros: {displayData.length} • 
            Frequentes: {stats.frequentes} • 
            Incompletos: {stats.incompletos} • 
            EAD: {stats.totalEAD} • 
            VC: {stats.totalVideoconferencia}
          </div>
          <div>
            Última atualização: {new Date().toLocaleString('pt-BR')}
          </div>
        </div>
      )}
    </div>
  );
}
