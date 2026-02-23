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
  total_classes: number;
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
    pageSize: 50, // Reduzido para 50 para melhor performance
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
        supabase.from('classes').select('id, name, modality, cycle_id, course_id, total_classes').order('name'),
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
    // Não gerar relatório automaticamente ao limpar
  };

  // Função simplificada para gerar relatório
  const generateReport = async () => {
    if (!user) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    setIsLoading(true);

    try {
      // 1. Buscar turmas filtradas
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
        setIsLoading(false);
        return;
      }

      const classIds = filteredClasses.map(c => c.id);

      // 2. Buscar contagem total de alunos para paginação
      let countQuery = supabase
        .from('class_students')
        .select('*', { count: 'exact', head: true })
        .in('class_id', classIds);

      if (filters.status !== 'all') {
        countQuery = countQuery.eq('current_status', filters.status);
      }

      const { count: totalCount } = await countQuery;

      if (!totalCount || totalCount === 0) {
        setReportData([]);
        setStats({ totalStudents: 0, emAndamentoCount: 0, aprovadoCount: 0, reprovadoCount: 0 });
        setPagination(prev => ({ ...prev, total: 0, totalPages: 0 }));
        setIsLoading(false);
        return;
      }

      // 3. Buscar alunos da página atual
      let studentQuery = supabase
        .from('class_students')
        .select(`
          id,
          enrollment_type,
          enrollment_date,
          current_status,
          class_id,
          student_id,
          students!inner (
            id,
            full_name,
            unit_id
          )
        `)
        .in('class_id', classIds);

      if (filters.status !== 'all') {
        studentQuery = studentQuery.eq('current_status', filters.status);
      }

      // Aplicar paginação
      const from = (pagination.page - 1) * pagination.pageSize;
      const to = from + pagination.pageSize - 1;
      studentQuery = studentQuery.range(from, to);

      const { data: classStudents, error: studentsError } = await studentQuery;

      if (studentsError) {
        console.error('Error loading students:', studentsError);
        return;
      }

      if (!classStudents || classStudents.length === 0) {
        setReportData([]);
        setStats({ totalStudents: 0, emAndamentoCount: 0, aprovadoCount: 0, reprovadoCount: 0 });
        setPagination(prev => ({ ...prev, total: totalCount, totalPages: Math.ceil(totalCount / prev.pageSize) }));
        setIsLoading(false);
        return;
      }

      // 4. Filtrar por nome e unidade (em memória)
      let filteredStudents = classStudents;

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

      // 5. Buscar dados de presença em lote (apenas se necessário)
      const needsAttendanceData = filters.startDate || filters.endDate;
      
      // Coletar IDs para busca em lote
      const studentIds = filteredStudents.map(cs => cs.student_id);
      const videoconferenceClassIds = filteredClasses
        .filter(c => c.modality === 'VIDEOCONFERENCIA')
        .map(c => c.id);
      const eadClassIds = filteredClasses
        .filter(c => c.modality === 'EAD')
        .map(c => c.id);

      // Mapas para dados de frequência
      const attendanceMap = new Map();
      const eadMap = new Map();

      // Buscar presenças em lote (apenas se necessário e se houver dados)
      if (needsAttendanceData && videoconferenceClassIds.length > 0 && studentIds.length > 0) {
        let attQuery = supabase
          .from('attendance')
          .select('class_id, student_id, class_date')
          .in('class_id', videoconferenceClassIds)
          .in('student_id', studentIds)
          .eq('present', true);

        if (filters.startDate) {
          attQuery = attQuery.gte('class_date', filters.startDate);
        }
        if (filters.endDate) {
          attQuery = attQuery.lte('class_date', filters.endDate);
        }

        const { data: attendanceData } = await attQuery;
        
        if (attendanceData) {
          attendanceData.forEach(att => {
            const key = `${att.class_id}_${att.student_id}`;
            if (!attendanceMap.has(key)) {
              attendanceMap.set(key, []);
            }
            attendanceMap.get(key).push(att);
          });
        }
      }

      // Buscar acessos EAD em lote
      if (eadClassIds.length > 0 && studentIds.length > 0) {
        const { data: eadData } = await supabase
          .from('ead_access')
          .select('class_id, student_id, access_date_1, access_date_2, access_date_3')
          .in('class_id', eadClassIds)
          .in('student_id', studentIds);

        if (eadData) {
          eadData.forEach(access => {
            const key = `${access.class_id}_${access.student_id}`;
            eadMap.set(key, access);
          });
        }
      }

      // 6. Processar dados
      const processedData: ReportData[] = [];
      const today = new Date().toISOString().split('T')[0];
      const classMap = new Map(filteredClasses.map(c => [c.id, c]));

      for (const cs of filteredStudents) {
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
          const key = `${cls.id}_${cs.student_id}`;
          const attendances = attendanceMap.get(key) || [];
          const attendedCount = attendances.length;
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
          const key = `${cls.id}_${cs.student_id}`;
          const access = eadMap.get(key);
          
          let accesses: string[] = [];
          if (access) {
            accesses = [
              access.access_date_1,
              access.access_date_2,
              access.access_date_3,
            ].filter(Boolean);

            // Filtrar por data se necessário
            if (filters.startDate || filters.endDate) {
              accesses = accesses.filter((d) => {
                if (!d) return false;
                const accessDate = new Date(d);
                if (filters.startDate && accessDate < new Date(filters.startDate)) return false;
                if (filters.endDate && accessDate > new Date(filters.endDate)) return false;
                return true;
              });
            }
          }

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

      // Calcular estatísticas (usando dados da página atual para simplificar)
      const emAndamentoCount = processedData.filter(d => d.displayStatus === 'Em Andamento').length;
      const aprovadoCount = processedData.filter(d => d.displayStatus === 'Aprovado').length;
      const reprovadoCount = processedData.filter(d => d.displayStatus === 'Reprovado').length;

      setStats({
        totalStudents: processedData.length,
        emAndamentoCount,
        aprovadoCount,
        reprovadoCount,
      });

      setPagination(prev => ({
        ...prev,
        total: totalCount,
        totalPages: Math.ceil(totalCount / prev.pageSize),
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
      exportToXLSX(reportData);
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
            disabled={isLoading}
            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Gerando...' : 'Gerar Relatório'}
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
          </div>

          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-sm text-green-600 font-medium">Aprovados</p>
            <p className="text-3xl font-bold text-green-700">{stats.aprovadoCount}</p>
          </div>

          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-600 font-medium">Reprovados</p>
            <p className="text-3xl font-bold text-red-700">{stats.reprovadoCount}</p>
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
                style={{ width: stats.totalStudents > 0 ? `${(stats.emAndamentoCount / stats.totalStudents) * 100}%` : '0%' }}
              >
                {stats.totalStudents > 0 && ((stats.emAndamentoCount / stats.totalStudents) * 100) > 5 && 
                  `${((stats.emAndamentoCount / stats.totalStudents) * 100).toFixed(0)}%`}
              </div>
              <div
                className="bg-green-500 h-full flex items-center justify-center text-white text-xs font-medium transition-all duration-300"
                style={{ width: stats.totalStudents > 0 ? `${(stats.aprovadoCount / stats.totalStudents) * 100}%` : '0%' }}
              >
                {stats.totalStudents > 0 && ((stats.aprovadoCount / stats.totalStudents) * 100) > 5 && 
                  `${((stats.aprovadoCount / stats.totalStudents) * 100).toFixed(0)}%`}
              </div>
              <div
                className="bg-red-500 h-full flex items-center justify-center text-white text-xs font-medium transition-all duration-300"
                style={{ width: stats.totalStudents > 0 ? `${(stats.reprovadoCount / stats.totalStudents) * 100}%` : '0%' }}
              >
                {stats.totalStudents > 0 && ((stats.reprovadoCount / stats.totalStudents) * 100) > 5 && 
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
