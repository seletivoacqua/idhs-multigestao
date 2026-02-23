import { useState, useEffect, useRef, useCallback } from 'react';
import { Filter, FileSpreadsheet, FileText, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import logoImg from '../../assets/image.png';

// Implementação manual do debounce
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

interface Unit {
  id: string;
  name: string;
}

interface Cycle {
  id: string;
  name: string;
  status: string;
  end_date: string;
}

interface Class {
  id: string;
  name: string;
  modality: string;
  cycle_id: string;
  course_id: string;
}

interface ReportData {
  studentId: string;
  studentName: string;
  unitName: string;
  courseName: string;
  className: string;
  classModality: string;
  classesTotal?: number;
  classesAttended?: number;
  attendancePercentage?: number;
  lastAccesses?: string[];
  currentStatus: 'em_andamento' | 'aprovado' | 'reprovado';
  displayStatus: string;
  cycleStatus: string;
  cycleEndDate: string;
  enrollmentType: string;
  enrollmentDate: string;
}

interface PaginationState {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function ReportsTab() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [reportData, setReportData] = useState<ReportData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [pagination, setPagination] = useState<PaginationState>({
    page: 1,
    pageSize: 1000, // Aumentado para 1000 registros por página
    total: 0,
    totalPages: 0,
  });
  
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    cycleId: '',
    classId: '',
    unitId: '',
    modality: 'all',
    studentName: '',
    status: 'all',
  });

  const { user } = useAuth();
  const reportRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [stats, setStats] = useState({
    totalStudents: 0,
    emAndamentoCount: 0,
    aprovadoCount: 0,
    reprovadoCount: 0,
  });

  // Cache para dados
  const unitsMap = useRef<Map<string, string>>(new Map());
  const coursesMap = useRef<Map<string, string>>(new Map());
  const cyclesMap = useRef<Map<string, { status: string; end_date: string }>>(new Map());

  useEffect(() => {
    loadInitialData();
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const loadInitialData = async () => {
    if (!user) return;

    try {
      // Carregar dados iniciais em paralelo
      const [unitsRes, cyclesRes, classesRes, coursesRes] = await Promise.all([
        supabase.from('units').select('id, name').order('name'),
        supabase.from('cycles').select('id, name, status, end_date').order('created_at', { ascending: false }),
        supabase.from('classes').select('id, name, modality, cycle_id, course_id').order('name'),
        supabase.from('courses').select('id, name'),
      ]);

      if (unitsRes.data) {
        setUnits(unitsRes.data);
        unitsRes.data.forEach(unit => unitsMap.current.set(unit.id, unit.name));
      }
      
      if (cyclesRes.data) {
        setCycles(cyclesRes.data);
        cyclesRes.data.forEach(cycle => 
          cyclesMap.current.set(cycle.id, { status: cycle.status, end_date: cycle.end_date })
        );
      }
      
      if (classesRes.data) setClasses(classesRes.data);
      
      if (coursesRes.data) {
        coursesRes.data.forEach(course => coursesMap.current.set(course.id, course.name));
      }
    } catch (error) {
      console.error('Error loading initial data:', error);
    }
  };

  const debouncedFilterChange = useCallback(
    debounce(() => {
      setPagination(prev => ({ ...prev, page: 1 }));
      generateReport();
    }, 500),
    []
  );

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => {
      const newFilters = { ...prev, [key]: value };
      debouncedFilterChange();
      return newFilters;
    });
  };

  const handleClearFilters = () => {
    setFilters({
      startDate: '',
      endDate: '',
      cycleId: '',
      classId: '',
      unitId: '',
      modality: 'all',
      studentName: '',
      status: 'all',
    });
    setPagination(prev => ({ ...prev, page: 1 }));
    generateReport();
  };

  // Função para calcular frequência de um aluno específico
  const calculateStudentAttendance = async (classId: string, studentId: string, startDate?: string, endDate?: string) => {
    try {
      let query = supabase
        .from('attendance')
        .select('*', { count: 'exact', head: true })
        .eq('class_id', classId)
        .eq('student_id', studentId)
        .eq('present', true);

      if (startDate) {
        query = query.gte('class_date', startDate);
      }
      if (endDate) {
        query = query.lte('class_date', endDate);
      }

      const { count } = await query;
      return count || 0;
    } catch (error) {
      console.error('Error calculating attendance:', error);
      return 0;
    }
  };

  // Função para buscar acessos EAD
  const getEADAccesses = async (classId: string, studentId: string, startDate?: string, endDate?: string) => {
    try {
      const { data } = await supabase
        .from('ead_access')
        .select('access_date_1, access_date_2, access_date_3')
        .eq('class_id', classId)
        .eq('student_id', studentId)
        .single();

      if (!data) return [];

      let accesses = [
        data.access_date_1,
        data.access_date_2,
        data.access_date_3,
      ].filter(Boolean);

      if (startDate || endDate) {
        accesses = accesses.filter((d) => {
          if (!d) return false;
          const accessDate = new Date(d);
          if (startDate && accessDate < new Date(startDate)) return false;
          if (endDate && accessDate > new Date(endDate)) return false;
          return true;
        });
      }

      return accesses;
    } catch (error) {
      console.error('Error getting EAD accesses:', error);
      return [];
    }
  };

  const generateReport = async () => {
    if (!user) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    setIsLoading(true);

    try {
      // 1. Buscar todas as turmas que atendem aos filtros (sem limite)
      let classQuery = supabase
        .from('classes')
        .select('id, cycle_id, modality, total_classes, course_id, name');

      if (filters.cycleId) {
        classQuery = classQuery.eq('cycle_id', filters.cycleId);
      }

      if (filters.classId) {
        classQuery = classQuery.eq('id', filters.classId);
      }

      if (filters.modality !== 'all') {
        classQuery = classQuery.eq('modality', filters.modality);
      }

      const { data: filteredClasses, error: classError } = await classQuery;

      if (classError) {
        console.error('Error loading classes:', classError);
        return;
      }

      if (!filteredClasses || filteredClasses.length === 0) {
        setReportData([]);
        setStats({ totalStudents: 0, emAndamentoCount: 0, aprovadoCount: 0, reprovadoCount: 0 });
        setPagination(prev => ({ ...prev, total: 0, totalPages: 0 }));
        return;
      }

      const classIds = filteredClasses.map(c => c.id);

      // 2. Buscar TODOS os alunos matriculados nessas turmas (sem paginação)
      let studentQuery = supabase
        .from('class_students')
        .select(`
          id,
          enrollment_type,
          enrollment_date,
          current_status,
          class_id,
          student_id,
          students (
            id,
            full_name,
            unit_id
          )
        `)
        .in('class_id', classIds);

      // Aplicar filtro de status se necessário
      if (filters.status !== 'all') {
        studentQuery = studentQuery.eq('current_status', filters.status);
      }

      const { data: allClassStudents, error: studentsError, count } = await studentQuery;

      if (studentsError) {
        console.error('Error loading students:', studentsError);
        return;
      }

      if (!allClassStudents || allClassStudents.length === 0) {
        setReportData([]);
        setStats({ totalStudents: 0, emAndamentoCount: 0, aprovadoCount: 0, reprovadoCount: 0 });
        setPagination(prev => ({ ...prev, total: 0, totalPages: 0 }));
        return;
      }

      // 3. Filtrar por nome do aluno e unidade
      let filteredStudents = allClassStudents;

      if (filters.studentName) {
        const searchTerm = filters.studentName.toLowerCase();
        filteredStudents = filteredStudents.filter(cs => 
          cs.students?.full_name?.toLowerCase().includes(searchTerm)
        );
      }

      if (filters.unitId) {
        filteredStudents = filteredStudents.filter(cs => 
          cs.students?.unit_id === filters.unitId
        );
      }

      // 4. Aplicar paginação em memória
      const totalFiltered = filteredStudents.length;
      const startIndex = (pagination.page - 1) * pagination.pageSize;
      const endIndex = Math.min(startIndex + pagination.pageSize, totalFiltered);
      const paginatedStudents = filteredStudents.slice(startIndex, endIndex);

      // 5. Processar dados para os alunos da página atual
      const processedData: ReportData[] = [];
      const today = new Date().toISOString().split('T')[0];

      // Criar mapas para lookup rápido
      const classMap = new Map(filteredClasses.map(c => [c.id, c]));

      // Para cada aluno, buscar dados de frequência individualmente (mais confiável)
      for (const cs of paginatedStudents) {
        const cls = classMap.get(cs.class_id);
        if (!cls || !cs.students) continue;

        const cycleInfo = cyclesMap.current.get(cls.cycle_id) || { status: 'unknown', end_date: '' };
        const unitName = unitsMap.current.get(cs.students.unit_id) || 'Não informado';
        const courseName = coursesMap.current.get(cls.course_id) || 'Não informado';

        // Determinar status de exibição
        let displayStatus = '';
        const isCycleActive = cycleInfo.status === 'active' && today <= cycleInfo.end_date;

        if (isCycleActive) {
          displayStatus = 'Em Andamento';
        } else if (cs.current_status === 'aprovado') {
          displayStatus = 'Aprovado';
        } else if (cs.current_status === 'reprovado') {
          displayStatus = 'Reprovado';
        } else {
          displayStatus = 'Pendente';
        }

        if (cls.modality === 'VIDEOCONFERENCIA') {
          // Calcular presenças individualmente para este aluno
          const attendedCount = await calculateStudentAttendance(
            cls.id, 
            cs.student_id, 
            filters.startDate || undefined, 
            filters.endDate || undefined
          );
          
          const percentage = cls.total_classes > 0 ? (attendedCount / cls.total_classes) * 100 : 0;

          processedData.push({
            studentId: cs.students.id,
            studentName: cs.students.full_name,
            unitName,
            courseName,
            className: cls.name,
            classModality: cls.modality,
            classesTotal: cls.total_classes,
            classesAttended: attendedCount,
            attendancePercentage: percentage,
            currentStatus: cs.current_status || 'em_andamento',
            displayStatus,
            cycleStatus: cycleInfo.status,
            cycleEndDate: cycleInfo.end_date,
            enrollmentType: cs.enrollment_type,
            enrollmentDate: cs.enrollment_date,
          });
        } else {
          // Buscar acessos EAD para este aluno
          const accesses = await getEADAccesses(
            cls.id, 
            cs.student_id, 
            filters.startDate || undefined, 
            filters.endDate || undefined
          );

          processedData.push({
            studentId: cs.students.id,
            studentName: cs.students.full_name,
            unitName,
            courseName,
            className: cls.name,
            classModality: cls.modality,
            lastAccesses: accesses.map(d => d ? new Date(d).toLocaleDateString('pt-BR') : ''),
            currentStatus: cs.current_status || 'em_andamento',
            displayStatus,
            cycleStatus: cycleInfo.status,
            cycleEndDate: cycleInfo.end_date,
            enrollmentType: cs.enrollment_type,
            enrollmentDate: cs.enrollment_date,
          });
        }
      }

      // Ordenar por nome do aluno
      processedData.sort((a, b) => a.studentName.localeCompare(b.studentName));

      setReportData(processedData);

      // Calcular estatísticas (baseado em todos os alunos filtrados, não apenas página atual)
      const allProcessedData: ReportData[] = [];
      
      // Processar alguns dados para estatísticas (sem buscar presenças individuais para não sobrecarregar)
      for (const cs of filteredStudents.slice(0, 1000)) { // Limite para não travar
        const cls = classMap.get(cs.class_id);
        if (!cls || !cs.students) continue;

        const cycleInfo = cyclesMap.current.get(cls.cycle_id) || { status: 'unknown', end_date: '' };
        const isCycleActive = cycleInfo.status === 'active' && today <= cycleInfo.end_date;

        let displayStatus = '';
        if (isCycleActive) {
          displayStatus = 'Em Andamento';
        } else if (cs.current_status === 'aprovado') {
          displayStatus = 'Aprovado';
        } else if (cs.current_status === 'reprovado') {
          displayStatus = 'Reprovado';
        } else {
          displayStatus = 'Pendente';
        }

        allProcessedData.push({
          studentId: cs.students.id,
          studentName: cs.students.full_name,
          unitName: unitsMap.current.get(cs.students.unit_id) || 'Não informado',
          courseName: coursesMap.current.get(cls.course_id) || 'Não informado',
          className: cls.name,
          classModality: cls.modality,
          currentStatus: cs.current_status || 'em_andamento',
          displayStatus,
          cycleStatus: cycleInfo.status,
          cycleEndDate: cycleInfo.end_date,
          enrollmentType: cs.enrollment_type,
          enrollmentDate: cs.enrollment_date,
        });
      }

      const emAndamentoCount = allProcessedData.filter(d => d.displayStatus === 'Em Andamento').length;
      const aprovadoCount = allProcessedData.filter(d => d.displayStatus === 'Aprovado').length;
      const reprovadoCount = allProcessedData.filter(d => d.displayStatus === 'Reprovado').length;

      setStats({
        totalStudents: filteredStudents.length,
        emAndamentoCount,
        aprovadoCount,
        reprovadoCount,
      });

      setPagination(prev => ({
        ...prev,
        total: filteredStudents.length,
        totalPages: Math.ceil(filteredStudents.length / prev.pageSize),
      }));

    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('Error loading report data:', error);
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const exportToXLSX = (data: ReportData[]) => {
    const headers = [
      'Unidade',
      'Nome do Aluno',
      'Turma',
      'Curso',
      'Modalidade',
      'Tipo de Matrícula',
      'Data da Matrícula',
      'Status do Ciclo',
      'Data de Fim do Ciclo',
      'Situação Atual'
    ];

    if (data[0]?.classModality === 'VIDEOCONFERENCIA') {
      headers.splice(9, 0, 'Total de Aulas', 'Aulas Assistidas', 'Frequência (%)');
    } else {
      headers.splice(9, 0, 'Últimos Acessos');
    }

    const rows = data.map((row) => {
      const base = [
        row.unitName,
        row.studentName,
        row.className,
        row.courseName,
        row.classModality === 'VIDEOCONFERENCIA' ? 'Videoconferência' : 'EAD 24h',
        row.enrollmentType === 'exceptional' ? 'Excepcional' : 'Regular',
        row.enrollmentDate ? new Date(row.enrollmentDate).toLocaleDateString('pt-BR') : '-',
        row.cycleStatus === 'active' ? 'Ativo' : 'Encerrado',
        new Date(row.cycleEndDate).toLocaleDateString('pt-BR'),
      ];

      if (row.classModality === 'VIDEOCONFERENCIA') {
        base.push(
          row.classesTotal?.toString() || '0',
          row.classesAttended?.toString() || '0',
          row.attendancePercentage ? `${row.attendancePercentage.toFixed(1)}%` : '0.0%'
        );
      } else {
        base.push(row.lastAccesses?.join(', ') || 'Nenhum acesso registrado');
      }

      base.push(row.displayStatus);
      return base;
    });

    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);

    // Ajustar largura das colunas
    const colWidths = headers.map((_, idx) => {
      const maxLength = Math.max(
        headers[idx].length,
        ...rows.map(row => (row[idx]?.toString() || '').length)
      );
      return { wch: Math.min(maxLength + 5, 50) };
    });
    worksheet['!cols'] = colWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Relatório de Alunos');

    XLSX.writeFile(workbook, `relatorio_alunos_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const exportAllData = async () => {
    if (reportData.length === 0) return;
    
    setIsExporting(true);
    
    try {
      // Para exportação, buscar todos os dados sem paginação
      await generateFullReportForExport();
    } finally {
      setIsExporting(false);
    }
  };

  const generateFullReportForExport = async () => {
    if (!user) return;

    setIsLoading(true);

    try {
      // Similar ao generateReport mas sem paginação
      let classQuery = supabase
        .from('classes')
        .select('id, cycle_id, modality, total_classes, course_id, name');

      if (filters.cycleId) {
        classQuery = classQuery.eq('cycle_id', filters.cycleId);
      }

      if (filters.classId) {
        classQuery = classQuery.eq('id', filters.classId);
      }

      if (filters.modality !== 'all') {
        classQuery = classQuery.eq('modality', filters.modality);
      }

      const { data: filteredClasses } = await classQuery;

      if (!filteredClasses || filteredClasses.length === 0) return;

      const classIds = filteredClasses.map(c => c.id);

      let studentQuery = supabase
        .from('class_students')
        .select(`
          id,
          enrollment_type,
          enrollment_date,
          current_status,
          class_id,
          student_id,
          students (
            id,
            full_name,
            unit_id
          )
        `)
        .in('class_id', classIds);

      if (filters.status !== 'all') {
        studentQuery = studentQuery.eq('current_status', filters.status);
      }

      const { data: allClassStudents } = await studentQuery;

      if (!allClassStudents) return;

      let filteredStudents = allClassStudents;

      if (filters.studentName) {
        const searchTerm = filters.studentName.toLowerCase();
        filteredStudents = filteredStudents.filter(cs => 
          cs.students?.full_name?.toLowerCase().includes(searchTerm)
        );
      }

      if (filters.unitId) {
        filteredStudents = filteredStudents.filter(cs => 
          cs.students?.unit_id === filters.unitId
        );
      }

      const classMap = new Map(filteredClasses.map(c => [c.id, c]));
      const today = new Date().toISOString().split('T')[0];
      const exportData: ReportData[] = [];

      // Processar em lotes para não sobrecarregar
      const batchSize = 50;
      for (let i = 0; i < filteredStudents.length; i += batchSize) {
        const batch = filteredStudents.slice(i, i + batchSize);
        
        await Promise.all(batch.map(async (cs) => {
          const cls = classMap.get(cs.class_id);
          if (!cls || !cs.students) return;

          const cycleInfo = cyclesMap.current.get(cls.cycle_id) || { status: 'unknown', end_date: '' };
          const unitName = unitsMap.current.get(cs.students.unit_id) || 'Não informado';
          const courseName = coursesMap.current.get(cls.course_id) || 'Não informado';

          const isCycleActive = cycleInfo.status === 'active' && today <= cycleInfo.end_date;

          let displayStatus = '';
          if (isCycleActive) {
            displayStatus = 'Em Andamento';
          } else if (cs.current_status === 'aprovado') {
            displayStatus = 'Aprovado';
          } else if (cs.current_status === 'reprovado') {
            displayStatus = 'Reprovado';
          } else {
            displayStatus = 'Pendente';
          }

          if (cls.modality === 'VIDEOCONFERENCIA') {
            const attendedCount = await calculateStudentAttendance(cls.id, cs.student_id);
            const percentage = cls.total_classes > 0 ? (attendedCount / cls.total_classes) * 100 : 0;

            exportData.push({
              studentId: cs.students.id,
              studentName: cs.students.full_name,
              unitName,
              courseName,
              className: cls.name,
              classModality: cls.modality,
              classesTotal: cls.total_classes,
              classesAttended: attendedCount,
              attendancePercentage: percentage,
              currentStatus: cs.current_status || 'em_andamento',
              displayStatus,
              cycleStatus: cycleInfo.status,
              cycleEndDate: cycleInfo.end_date,
              enrollmentType: cs.enrollment_type,
              enrollmentDate: cs.enrollment_date,
            });
          } else {
            const accesses = await getEADAccesses(cls.id, cs.student_id);

            exportData.push({
              studentId: cs.students.id,
              studentName: cs.students.full_name,
              unitName,
              courseName,
              className: cls.name,
              classModality: cls.modality,
              lastAccesses: accesses.map(d => d ? new Date(d).toLocaleDateString('pt-BR') : ''),
              currentStatus: cs.current_status || 'em_andamento',
              displayStatus,
              cycleStatus: cycleInfo.status,
              cycleEndDate: cycleInfo.end_date,
              enrollmentType: cs.enrollment_type,
              enrollmentDate: cs.enrollment_date,
            });
          }
        }));
      }

      exportData.sort((a, b) => a.studentName.localeCompare(b.studentName));
      exportToXLSX(exportData);

    } catch (error) {
      console.error('Error exporting full report:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const exportToPDF = async () => {
    if (!reportRef.current || reportData.length === 0 || !tableRef.current) return;

    setIsExporting(true);

    try {
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const contentWidth = pageWidth - 2 * margin;

      const emAndamentoPercentage = stats.totalStudents > 0
        ? (stats.emAndamentoCount / stats.totalStudents) * 100
        : 0;
      const aprovadoPercentage = stats.totalStudents > 0
        ? (stats.aprovadoCount / stats.totalStudents) * 100
        : 0;
      const reprovadoPercentage = stats.totalStudents > 0
        ? (stats.reprovadoCount / stats.totalStudents) * 100
        : 0;

      const container = document.createElement('div');
      container.style.width = `${contentWidth * 3.78}px`;
      container.style.padding = '20px';
      container.style.backgroundColor = '#ffffff';
      container.style.fontFamily = 'Arial, sans-serif';
      container.style.lineHeight = '1.5';

      // Cabeçalho
      const headerDiv = document.createElement('div');
      headerDiv.style.textAlign = 'center';
      headerDiv.style.marginBottom = '20px';
      headerDiv.style.padding = '10px';
      headerDiv.style.borderBottom = '2px solid #e2e8f0';

      const logo = document.createElement('img');
      logo.src = logoImg;
      logo.style.width = '80px';
      logo.style.height = 'auto';
      logo.style.marginBottom = '10px';
      headerDiv.appendChild(logo);

      const title = document.createElement('h1');
      title.textContent = 'Relatório de Acompanhamento de Alunos';
      title.style.fontSize = '24px';
      title.style.fontWeight = 'bold';
      title.style.marginBottom = '5px';
      title.style.color = '#1e293b';
      headerDiv.appendChild(title);

      const subtitle = document.createElement('p');
      subtitle.textContent = `Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`;
      subtitle.style.fontSize = '12px';
      subtitle.style.color = '#64748b';
      subtitle.style.marginBottom = '5px';
      headerDiv.appendChild(subtitle);

      container.appendChild(headerDiv);

      // Filtros aplicados
      const filtersDiv = document.createElement('div');
      filtersDiv.style.display = 'flex';
      filtersDiv.style.flexWrap = 'wrap';
      filtersDiv.style.gap = '15px';
      filtersDiv.style.marginBottom = '20px';
      filtersDiv.style.padding = '10px';
      filtersDiv.style.backgroundColor = '#f8fafc';
      filtersDiv.style.borderRadius = '8px';
      filtersDiv.style.fontSize = '12px';
      filtersDiv.style.color = '#334155';

      const activeFilters = [];
      if (filters.cycleId) {
        const cycle = cycles.find(c => c.id === filters.cycleId);
        activeFilters.push(`Ciclo: ${cycle?.name || 'Todos'}`);
      }
      if (filters.classId) {
        const cls = classes.find(c => c.id === filters.classId);
        activeFilters.push(`Turma: ${cls?.name || 'Todas'}`);
      }
      if (filters.unitId) {
        const unit = units.find(u => u.id === filters.unitId);
        activeFilters.push(`Unidade: ${unit?.name || 'Todas'}`);
      }
      if (filters.modality !== 'all') {
        activeFilters.push(`Modalidade: ${filters.modality === 'VIDEOCONFERENCIA' ? 'Videoconferência' : 'EAD'}`);
      }
      if (filters.status !== 'all') {
        let statusText = '';
        if (filters.status === 'em_andamento') statusText = 'Em Andamento';
        else if (filters.status === 'aprovado') statusText = 'Aprovados';
        else if (filters.status === 'reprovado') statusText = 'Reprovados';
        activeFilters.push(`Situação: ${statusText}`);
      }
      if (filters.startDate) {
        activeFilters.push(`Data inicial: ${new Date(filters.startDate).toLocaleDateString('pt-BR')}`);
      }
      if (filters.endDate) {
        activeFilters.push(`Data final: ${new Date(filters.endDate).toLocaleDateString('pt-BR')}`);
      }

      filtersDiv.innerHTML = activeFilters.length > 0 
        ? `<strong>Filtros aplicados:</strong> ${activeFilters.join(' • ')}` 
        : '<strong>Nenhum filtro aplicado</strong>';

      container.appendChild(filtersDiv);

      // Estatísticas
      const statsDiv = document.createElement('div');
      statsDiv.style.marginBottom = '20px';

      const statsTitle = document.createElement('h3');
      statsTitle.textContent = 'Distribuição por Situação';
      statsTitle.style.fontSize = '16px';
      statsTitle.style.fontWeight = 'bold';
      statsTitle.style.marginBottom = '15px';
      statsTitle.style.color = '#1e293b';
      statsDiv.appendChild(statsTitle);

      const statsGrid = document.createElement('div');
      statsGrid.style.display = 'grid';
      statsGrid.style.gridTemplateColumns = 'repeat(4, 1fr)';
      statsGrid.style.gap = '10px';
      statsGrid.style.marginBottom = '15px';

      // Total
      const totalBox = document.createElement('div');
      totalBox.style.backgroundColor = '#f1f5f9';
      totalBox.style.padding = '15px';
      totalBox.style.borderRadius = '8px';
      totalBox.style.textAlign = 'center';
      totalBox.innerHTML = `
        <div style="color: #334155; font-size: 14px; font-weight: 500; margin-bottom: 5px;">Total de Alunos</div>
        <div style="color: #0f172a; font-size: 32px; font-weight: bold;">${stats.totalStudents}</div>
      `;

      // Em Andamento
      const emAndamentoBox = document.createElement('div');
      emAndamentoBox.style.backgroundColor = '#dbeafe';
      emAndamentoBox.style.padding = '15px';
      emAndamentoBox.style.borderRadius = '8px';
      emAndamentoBox.style.textAlign = 'center';
      emAndamentoBox.innerHTML = `
        <div style="color: #1e40af; font-size: 14px; font-weight: 500; margin-bottom: 5px;">Em Andamento</div>
        <div style="color: #1e3a8a; font-size: 32px; font-weight: bold;">${stats.emAndamentoCount}</div>
        <div style="color: #2563eb; font-size: 12px;">${emAndamentoPercentage.toFixed(1)}%</div>
      `;

      // Aprovados
      const aprovadoBox = document.createElement('div');
      aprovadoBox.style.backgroundColor = '#dcfce7';
      aprovadoBox.style.padding = '15px';
      aprovadoBox.style.borderRadius = '8px';
      aprovadoBox.style.textAlign = 'center';
      aprovadoBox.innerHTML = `
        <div style="color: #166534; font-size: 14px; font-weight: 500; margin-bottom: 5px;">Aprovados</div>
        <div style="color: #14532d; font-size: 32px; font-weight: bold;">${stats.aprovadoCount}</div>
        <div style="color: #16a34a; font-size: 12px;">${aprovadoPercentage.toFixed(1)}%</div>
      `;

      // Reprovados
      const reprovadoBox = document.createElement('div');
      reprovadoBox.style.backgroundColor = '#fee2e2';
      reprovadoBox.style.padding = '15px';
      reprovadoBox.style.borderRadius = '8px';
      reprovadoBox.style.textAlign = 'center';
      reprovadoBox.innerHTML = `
        <div style="color: #991b1b; font-size: 14px; font-weight: 500; margin-bottom: 5px;">Reprovados</div>
        <div style="color: #7f1d1d; font-size: 32px; font-weight: bold;">${stats.reprovadoCount}</div>
        <div style="color: #dc2626; font-size: 12px;">${reprovadoPercentage.toFixed(1)}%</div>
      `;

      statsGrid.appendChild(totalBox);
      statsGrid.appendChild(emAndamentoBox);
      statsGrid.appendChild(aprovadoBox);
      statsGrid.appendChild(reprovadoBox);
      statsDiv.appendChild(statsGrid);

      // Barra de progresso
      const progressContainer = document.createElement('div');
      progressContainer.style.width = '100%';
      progressContainer.style.marginTop = '10px';

      const progressBar = document.createElement('div');
      progressBar.style.width = '100%';
      progressBar.style.height = '30px';
      progressBar.style.backgroundColor = '#e2e8f0';
      progressBar.style.borderRadius = '8px';
      progressBar.style.overflow = 'hidden';
      progressBar.style.display = 'flex';

      if (stats.totalStudents > 0) {
        const emAndamentoBar = document.createElement('div');
        emAndamentoBar.style.width = `${emAndamentoPercentage}%`;
        emAndamentoBar.style.height = '100%';
        emAndamentoBar.style.backgroundColor = '#3b82f6';
        emAndamentoBar.style.display = 'flex';
        emAndamentoBar.style.alignItems = 'center';
        emAndamentoBar.style.justifyContent = 'center';
        emAndamentoBar.style.color = 'white';
        emAndamentoBar.style.fontSize = '12px';
        emAndamentoBar.style.fontWeight = 'bold';
        emAndamentoBar.textContent = emAndamentoPercentage > 5 ? `${emAndamentoPercentage.toFixed(0)}%` : '';

        const aprovadoBar = document.createElement('div');
        aprovadoBar.style.width = `${aprovadoPercentage}%`;
        aprovadoBar.style.height = '100%';
        aprovadoBar.style.backgroundColor = '#22c55e';
        aprovadoBar.style.display = 'flex';
        aprovadoBar.style.alignItems = 'center';
        aprovadoBar.style.justifyContent = 'center';
        aprovadoBar.style.color = 'white';
        aprovadoBar.style.fontSize = '12px';
        aprovadoBar.style.fontWeight = 'bold';
        aprovadoBar.textContent = aprovadoPercentage > 5 ? `${aprovadoPercentage.toFixed(0)}%` : '';

        const reprovadoBar = document.createElement('div');
        reprovadoBar.style.width = `${reprovadoPercentage}%`;
        reprovadoBar.style.height = '100%';
        reprovadoBar.style.backgroundColor = '#ef4444';
        reprovadoBar.style.display = 'flex';
        reprovadoBar.style.alignItems = 'center';
        reprovadoBar.style.justifyContent = 'center';
        reprovadoBar.style.color = 'white';
        reprovadoBar.style.fontSize = '12px';
        reprovadoBar.style.fontWeight = 'bold';
        reprovadoBar.textContent = reprovadoPercentage > 5 ? `${reprovadoPercentage.toFixed(0)}%` : '';

        progressBar.appendChild(emAndamentoBar);
        progressBar.appendChild(aprovadoBar);
        progressBar.appendChild(reprovadoBar);
      }

      progressContainer.appendChild(progressBar);
      statsDiv.appendChild(progressContainer);
      container.appendChild(statsDiv);

      // Tabela
      const tableContainer = document.createElement('div');
      tableContainer.style.overflowX = 'auto';
      tableContainer.style.marginTop = '20px';
      
      const tableClone = tableRef.current.cloneNode(true) as HTMLTableElement;
      tableClone.style.width = '100%';
      tableClone.style.borderCollapse = 'collapse';
      tableClone.style.fontSize = '10px';
      tableClone.style.border = '1px solid #e2e8f0';
      
      // Ajustar células da tabela para melhor legibilidade
      const cells = tableClone.querySelectorAll('th, td');
      cells.forEach(cell => {
        (cell as HTMLElement).style.padding = '8px 6px';
        (cell as HTMLElement).style.borderBottom = '1px solid #e2e8f0';
        (cell as HTMLElement).style.whiteSpace = 'normal';
        (cell as HTMLElement).style.wordBreak = 'break-word';
      });

      tableContainer.appendChild(tableClone);
      container.appendChild(tableContainer);

      // Rodapé
      const footerDiv = document.createElement('div');
      footerDiv.style.marginTop = '20px';
      footerDiv.style.textAlign = 'center';
      footerDiv.style.fontSize = '10px';
      footerDiv.style.color = '#94a3b8';
      footerDiv.style.padding = '10px';
      footerDiv.style.borderTop = '1px solid #e2e8f0';
      footerDiv.textContent = `Relatório gerado em ${new Date().toLocaleDateString('pt-BR')} • Total de registros: ${stats.totalStudents} • Página ${pagination.page} de ${pagination.totalPages}`;
      
      container.appendChild(footerDiv);
      
      document.body.appendChild(container);

      const canvas = await html2canvas(container, {
        scale: 2,
        logging: false,
        backgroundColor: '#ffffff',
        allowTaint: true,
        useCORS: true,
      });

      const imgData = canvas.toDataURL('image/png');
      const imgHeight = (canvas.height * contentWidth) / canvas.width;

      const availableHeight = pageHeight - 20;
      const totalPages = Math.ceil(imgHeight / availableHeight);

      for (let i = 0; i < totalPages; i++) {
        if (i > 0) pdf.addPage();

        const sourceY = i * availableHeight * (canvas.width / contentWidth);
        const sourceHeight = Math.min(
          availableHeight * (canvas.width / contentWidth),
          canvas.height - sourceY
        );

        if (sourceHeight > 0) {
          const pageCanvas = document.createElement('canvas');
          pageCanvas.width = canvas.width;
          pageCanvas.height = sourceHeight;
          
          const ctx = pageCanvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(
              canvas,
              0, sourceY, canvas.width, sourceHeight,
              0, 0, canvas.width, sourceHeight
            );
          }

          const pageImgData = pageCanvas.toDataURL('image/png');
          const pageImgHeight = (sourceHeight * contentWidth) / canvas.width;

          pdf.addImage(pageImgData, 'PNG', margin, 10, contentWidth, pageImgHeight);
        }
      }

      pdf.save(`relatorio_alunos_${new Date().toISOString().split('T')[0]}.pdf`);
      document.body.removeChild(container);

    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Erro ao gerar PDF. Tente novamente.');
    } finally {
      setIsExporting(false);
    }
  };

  const handlePageChange = (newPage: number) => {
    setPagination(prev => ({ ...prev, page: newPage }));
    generateReport();
  };

  const getStatusColor = (displayStatus: string) => {
    switch (displayStatus) {
      case 'Em Andamento':
        return 'bg-blue-100 text-blue-800';
      case 'Aprovado':
        return 'bg-green-100 text-green-800';
      case 'Reprovado':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6" ref={reportRef}>
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-gray-800">Relatórios de Acompanhamento</h2>
        <div className="flex gap-3">
          <button
            onClick={exportAllData}
            disabled={reportData.length === 0 || isLoading || isExporting}
            className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isExporting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <FileSpreadsheet className="w-5 h-5" />
            )}
            <span>{isExporting ? 'Exportando...' : 'Exportar Excel'}</span>
          </button>
          <button
            onClick={exportToPDF}
            disabled={reportData.length === 0 || isLoading || isExporting}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isExporting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <FileText className="w-5 h-5" />
            )}
            <span>{isExporting ? 'Exportando...' : 'Gerar PDF'}</span>
          </button>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-center space-x-2 mb-4">
          <Filter className="w-5 h-5 text-gray-600" />
          <h3 className="font-semibold text-gray-800">Filtros</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Ciclo</label>
            <select
              value={filters.cycleId}
              onChange={(e) => handleFilterChange('cycleId', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            >
              <option value="">Todos os ciclos</option>
              {cycles.map((cycle) => (
                <option key={cycle.id} value={cycle.id}>
                  {cycle.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Turma</label>
            <select
              value={filters.classId}
              onChange={(e) => handleFilterChange('classId', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            >
              <option value="">Todas as turmas</option>
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Unidade</label>
            <select
              value={filters.unitId}
              onChange={(e) => handleFilterChange('unitId', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            >
              <option value="">Todas as unidades</option>
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Situação</label>
            <select
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            >
              <option value="all">Todas as situações</option>
              <option value="em_andamento">Em Andamento</option>
              <option value="aprovado">Aprovado</option>
              <option value="reprovado">Reprovado</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Data Início</label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => handleFilterChange('startDate', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Data Fim</label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => handleFilterChange('endDate', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Modalidade</label>
            <select
              value={filters.modality}
              onChange={(e) => handleFilterChange('modality', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            >
              <option value="all">Todas as modalidades</option>
              <option value="VIDEOCONFERENCIA">Videoconferência</option>
              <option value="EAD">EAD 24h</option>
            </select>
          </div>

          <div className="md:col-span-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Buscar por nome do aluno</label>
            <input
              type="text"
              placeholder="Digite o nome do aluno..."
              value={filters.studentName}
              onChange={(e) => handleFilterChange('studentName', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-3">
          <button
            onClick={handleClearFilters}
            className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Limpar Filtros
          </button>
          <button
            onClick={() => {
              setPagination(prev => ({ ...prev, page: 1 }));
              generateReport();
            }}
            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            Gerar Relatório
          </button>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="font-semibold text-gray-800 mb-4">Estatísticas</h3>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-600 font-medium">Total de Alunos</p>
            <p className="text-3xl font-bold text-blue-700">{stats.totalStudents}</p>
          </div>

          <div className="bg-blue-100 border border-blue-300 rounded-lg p-4">
            <p className="text-sm text-blue-800 font-medium">Em Andamento</p>
            <p className="text-3xl font-bold text-blue-900">{stats.emAndamentoCount}</p>
            <p className="text-xs text-blue-700 mt-1">
              {stats.totalStudents > 0 ? ((stats.emAndamentoCount / stats.totalStudents) * 100).toFixed(1) : '0'}%
            </p>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-sm text-green-600 font-medium">Aprovados</p>
            <p className="text-3xl font-bold text-green-700">{stats.aprovadoCount}</p>
            <p className="text-xs text-green-600 mt-1">
              {stats.totalStudents > 0 ? ((stats.aprovadoCount / stats.totalStudents) * 100).toFixed(1) : '0'}%
            </p>
          </div>

          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-600 font-medium">Reprovados</p>
            <p className="text-3xl font-bold text-red-700">{stats.reprovadoCount}</p>
            <p className="text-xs text-red-600 mt-1">
              {stats.totalStudents > 0 ? ((stats.reprovadoCount / stats.totalStudents) * 100).toFixed(1) : '0'}%
            </p>
          </div>
        </div>

        {stats.totalStudents > 0 && (
          <div className="mt-4">
            <div className="flex justify-between text-sm text-gray-600 mb-2">
              <span className="font-medium">Distribuição por Situação</span>
              <span>
                {stats.emAndamentoCount} em andamento • {stats.aprovadoCount} aprovados • {stats.reprovadoCount} reprovados
              </span>
            </div>
            <div className="w-full h-8 bg-gray-200 rounded-lg overflow-hidden flex">
              <div
                className="bg-blue-500 h-full flex items-center justify-center text-white text-xs font-medium transition-all duration-300"
                style={{ width: `${(stats.emAndamentoCount / stats.totalStudents) * 100}%` }}
              >
                {((stats.emAndamentoCount / stats.totalStudents) * 100) > 5 && 
                  `${((stats.emAndamentoCount / stats.totalStudents) * 100).toFixed(0)}%`}
              </div>
              <div
                className="bg-green-500 h-full flex items-center justify-center text-white text-xs font-medium transition-all duration-300"
                style={{ width: `${(stats.aprovadoCount / stats.totalStudents) * 100}%` }}
              >
                {((stats.aprovadoCount / stats.totalStudents) * 100) > 5 && 
                  `${((stats.aprovadoCount / stats.totalStudents) * 100).toFixed(0)}%`}
              </div>
              <div
                className="bg-red-500 h-full flex items-center justify-center text-white text-xs font-medium transition-all duration-300"
                style={{ width: `${(stats.reprovadoCount / stats.totalStudents) * 100}%` }}
              >
                {((stats.reprovadoCount / stats.totalStudents) * 100) > 5 && 
                  `${((stats.reprovadoCount / stats.totalStudents) * 100).toFixed(0)}%`}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table ref={tableRef} className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Unidade</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Aluno</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Turma</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Curso</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Modalidade</th>
                {reportData[0]?.classModality === 'VIDEOCONFERENCIA' ? (
                  <>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Total Aulas</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Aulas Assistidas</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Frequência</th>
                  </>
                ) : (
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Acessos</th>
                )}
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Matrícula</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Ciclo</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Situação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {isLoading ? (
                <tr>
                  <td colSpan={12} className="px-4 py-12 text-center text-gray-500">
                    <div className="flex justify-center items-center space-x-2">
                      <Loader2 className="w-6 h-6 animate-spin text-green-500" />
                      <span>Carregando dados...</span>
                    </div>
                  </td>
                </tr>
              ) : reportData.length > 0 ? (
                reportData.map((row, index) => (
                  <tr key={`${row.studentId}-${row.className}-${index}`} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-sm text-gray-700 whitespace-normal break-words">{row.unitName}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-normal break-words">{row.studentName}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 whitespace-normal break-words">{row.className}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 whitespace-normal break-words">{row.courseName}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                        row.classModality === 'VIDEOCONFERENCIA'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {row.classModality === 'VIDEOCONFERENCIA' ? 'Videoconferência' : 'EAD 24h'}
                      </span>
                    </td>
                    {row.classModality === 'VIDEOCONFERENCIA' ? (
                      <>
                        <td className="px-4 py-3 text-sm text-gray-700">{row.classesTotal}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{row.classesAttended}</td>
                        <td className="px-4 py-3 text-sm font-medium">
                          <span className={row.attendancePercentage && row.attendancePercentage >= 60 ? 'text-green-600' : 'text-red-600'}>
                            {row.attendancePercentage?.toFixed(1)}%
                          </span>
                        </td>
                      </>
                    ) : (
                      <td className="px-4 py-3 text-sm text-gray-700 whitespace-normal break-words">
                        {row.lastAccesses?.length ? row.lastAccesses.join(' · ') : 'Nenhum acesso'}
                      </td>
                    )}
                    <td className="px-4 py-3 text-sm">
                      <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                        row.enrollmentType === 'exceptional'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {row.enrollmentType === 'exceptional' ? 'Excepcional' : 'Regular'}
                      </span>
                      <div className="text-xs text-gray-500 mt-1">
                        {row.enrollmentDate ? new Date(row.enrollmentDate).toLocaleDateString('pt-BR') : '-'}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                        row.cycleStatus === 'active' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {row.cycleStatus === 'active' ? 'Ativo' : 'Encerrado'}
                      </span>
                      <div className="text-xs text-gray-500 mt-1">
                        Fim: {new Date(row.cycleEndDate).toLocaleDateString('pt-BR')}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(row.displayStatus)}`}>
                        {row.displayStatus}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={12} className="px-4 py-12 text-center text-gray-500">
                    Nenhum dado encontrado com os filtros selecionados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {pagination.totalPages > 1 && !isLoading && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
            <div className="text-sm text-gray-600">
              Mostrando <span className="font-medium">{((pagination.page - 1) * pagination.pageSize) + 1}</span> a{' '}
              <span className="font-medium">{Math.min(pagination.page * pagination.pageSize, pagination.total)}</span> de{' '}
              <span className="font-medium">{pagination.total}</span> resultados
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={pagination.page === 1}
                className="p-2 rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-4 py-2 text-sm text-gray-600">
                Página {pagination.page} de {pagination.totalPages}
              </span>
              <button
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={pagination.page === pagination.totalPages}
                className="p-2 rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
