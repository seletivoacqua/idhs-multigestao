import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Filter, FileSpreadsheet, FileText, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import logoImg from '../../assets/image.png';

const debounce = <T extends (...args: any[]) => any>(func: T, wait: number) => {
  let timeout: NodeJS.Timeout | null = null;
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

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
  total_classes: number;
}

interface ReportData {
  studentId: string;
  studentName: string;
  unitId: string;
  unitName: string;
  courseId: string;
  courseName: string;
  classId: string;
  className: string;
  classModality: string;
  totalClasses: number;
  moduleNames: string[];
  attendedClasses: number;
  attendancePercentage: number;
  lastAccesses: string[];
  currentStatus: 'em_andamento' | 'aprovado' | 'reprovado';
  displayStatus: string;
  cycleStatus: string;
  cycleEndDate: string;
  cycleName: string;
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
    pageSize: 50,
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

  const [stats, setStats] = useState({
    totalStudents: 0,
    emAndamentoCount: 0,
    aprovadoCount: 0,
    reprovadoCount: 0,
  });

  // Carregar dados iniciais
  useEffect(() => {
    if (!user) return;

    const loadInitialData = async () => {
      try {
        const [unitsRes, cyclesRes, classesRes] = await Promise.all([
          supabase.from('units').select('id, name').order('name'),
          supabase.from('cycles').select('id, name, status, end_date').order('created_at', { ascending: false }),
          supabase.from('classes').select('id, name, modality, total_classes').order('name'),
        ]);

        if (unitsRes.data) setUnits(unitsRes.data);
        if (cyclesRes.data) setCycles(cyclesRes.data);
        if (classesRes.data) setClasses(classesRes.data);
      } catch (error) {
        console.error('Error loading initial data:', error);
      }
    };

    loadInitialData();
  }, [user]);

  // Gerar relatório com paginação correta
  const generateReport = useCallback(async () => {
    if (!user) return;

    setIsLoading(true);

    try {
      // 1. Construir query base para class_students com paginação
      let baseQuery = supabase
        .from('class_students')
        .select(`
          student_id,
          class_id,
          current_status,
          status_updated_at,
          students!inner (
            id,
            full_name,
            unit_id,
            units:units!left (
              id,
              name
            )
          ),
          classes!inner (
            id,
            name,
            modality,
            total_classes,
            course_id,
            cycle_id,
            courses!inner (
              id,
              name
            ),
            cycles!inner (
              id,
              name,
              status,
              end_date
            )
          )
        `, { count: 'exact' });

      // Aplicar filtros
      if (filters.cycleId) {
        baseQuery = baseQuery.eq('classes.cycle_id', filters.cycleId);
      }

      if (filters.classId) {
        baseQuery = baseQuery.eq('class_id', filters.classId);
      }

      if (filters.unitId) {
        baseQuery = baseQuery.eq('students.unit_id', filters.unitId);
      }

      if (filters.modality !== 'all') {
        baseQuery = baseQuery.eq('classes.modality', filters.modality);
      }

      if (filters.studentName) {
        baseQuery = baseQuery.ilike('students.full_name', `%${filters.studentName}%`);
      }

      if (filters.status !== 'all') {
        baseQuery = baseQuery.eq('current_status', filters.status);
      }

      // Aplicar paginação
      const from = (pagination.page - 1) * pagination.pageSize;
      const to = from + pagination.pageSize - 1;

      const { data: classStudents, count, error } = await baseQuery
        .range(from, to);

      if (error) throw error;
      if (!classStudents || classStudents.length === 0) {
        setReportData([]);
        setStats({ totalStudents: 0, emAndamentoCount: 0, aprovadoCount: 0, reprovadoCount: 0 });
        setPagination(prev => ({ ...prev, total: 0, totalPages: 0 }));
        return;
      }

      // 2. Buscar módulos dos cursos
      const courseIds = [...new Set(classStudents.map(cs => cs.classes.course_id))];
      const { data: courseModules } = await supabase
        .from('course_modules')
        .select('course_id, name')
        .in('course_id', courseIds)
        .order('order_number');

      // Criar mapa de módulos por curso
      const modulesMap = new Map();
      courseModules?.forEach(module => {
        if (!modulesMap.has(module.course_id)) {
          modulesMap.set(module.course_id, []);
        }
        modulesMap.get(module.course_id).push(module.name);
      });

      // 3. Separar alunos por modalidade para buscar dados específicos
      const studentIds = classStudents.map(cs => cs.student_id);
      const classIds = classStudents.map(cs => cs.class_id);

      // Buscar presenças para videoconferência
      const videoconferenceClassIds = classStudents
        .filter(cs => cs.classes.modality === 'VIDEOCONFERENCIA')
        .map(cs => cs.class_id);

      let attendanceData: any[] = [];
      if (videoconferenceClassIds.length > 0) {
        let attendanceQuery = supabase
          .from('attendance')
          .select('class_id, student_id, class_date')
          .in('class_id', videoconferenceClassIds)
          .in('student_id', studentIds)
          .eq('present', true);

        if (filters.startDate) {
          attendanceQuery = attendanceQuery.gte('class_date', filters.startDate);
        }
        if (filters.endDate) {
          attendanceQuery = attendanceQuery.lte('class_date', filters.endDate);
        }

        const { data } = await attendanceQuery;
        attendanceData = data || [];
      }

      // Buscar acessos EAD
      const eadClassIds = classStudents
        .filter(cs => cs.classes.modality === 'EAD')
        .map(cs => cs.class_id);

      let eadAccessData: any[] = [];
      if (eadClassIds.length > 0) {
        const { data } = await supabase
          .from('ead_access')
          .select('class_id, student_id, access_date_1, access_date_2, access_date_3')
          .in('class_id', eadClassIds)
          .in('student_id', studentIds);

        eadAccessData = data || [];
      }

      // 4. Criar maps para acesso rápido
      const attendanceMap = new Map();
      attendanceData.forEach(att => {
        const key = `${att.class_id}_${att.student_id}`;
        if (!attendanceMap.has(key)) {
          attendanceMap.set(key, []);
        }
        attendanceMap.get(key).push(att);
      });

      const eadMap = new Map();
      eadAccessData.forEach(access => {
        const key = `${access.class_id}_${access.student_id}`;
        eadMap.set(key, access);
      });

      // 5. Processar dados
      const processedData: ReportData[] = [];

      for (const cs of classStudents) {
        const student = cs.students as any;
        const cls = cs.classes as any;

        // Determinar status de exibição
        let displayStatus = '';
        const now = new Date();
        const endDate = new Date(cls.cycles.end_date);

        if (cls.cycles.status === 'active' && now <= endDate) {
          displayStatus = 'Em Andamento';
        } else if (cs.current_status === 'aprovado') {
          displayStatus = 'Aprovado';
        } else if (cs.current_status === 'reprovado') {
          displayStatus = 'Reprovado';
        } else {
          displayStatus = 'Pendente';
        }

        const unitName = student.units?.name || 'Não informado';
        const moduleNames = modulesMap.get(cls.course_id) || [];

        if (cls.modality === 'VIDEOCONFERENCIA') {
          const key = `${cls.id}_${student.id}`;
          const attendances = attendanceMap.get(key) || [];
          
          const attendedCount = attendances.length;
          const percentage = cls.total_classes > 0 
            ? (attendedCount / cls.total_classes) * 100 
            : 0;

          processedData.push({
            studentId: student.id,
            studentName: student.full_name,
            unitId: student.unit_id,
            unitName,
            courseId: cls.course_id,
            courseName: cls.courses.name,
            classId: cls.id,
            className: cls.name,
            classModality: cls.modality,
            totalClasses: cls.total_classes,
            moduleNames,
            attendedClasses: attendedCount,
            attendancePercentage: percentage,
            lastAccesses: [],
            currentStatus: cs.current_status || 'em_andamento',
            displayStatus,
            cycleStatus: cls.cycles.status,
            cycleEndDate: cls.cycles.end_date,
            cycleName: cls.cycles.name,
          });
        } else {
          const key = `${cls.id}_${student.id}`;
          const access = eadMap.get(key);

          const accesses = [
            access?.access_date_1,
            access?.access_date_2,
            access?.access_date_3,
          ].filter(Boolean);

          // Filtrar acessos por data se necessário
          let filteredAccesses = accesses;
          if (filters.startDate || filters.endDate) {
            filteredAccesses = accesses.filter((d: string) => {
              const accessDate = new Date(d);
              if (filters.startDate && accessDate < new Date(filters.startDate)) return false;
              if (filters.endDate && accessDate > new Date(filters.endDate)) return false;
              return true;
            });
          }

          processedData.push({
            studentId: student.id,
            studentName: student.full_name,
            unitId: student.unit_id,
            unitName,
            courseId: cls.course_id,
            courseName: cls.courses.name,
            classId: cls.id,
            className: cls.name,
            classModality: cls.modality,
            totalClasses: cls.total_classes,
            moduleNames,
            attendedClasses: 0,
            attendancePercentage: 0,
            lastAccesses: filteredAccesses.map(d => new Date(d).toLocaleDateString('pt-BR')),
            currentStatus: cs.current_status || 'em_andamento',
            displayStatus,
            cycleStatus: cls.cycles.status,
            cycleEndDate: cls.cycles.end_date,
            cycleName: cls.cycles.name,
          });
        }
      }

      setReportData(processedData);

      // Calcular estatísticas
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
        total: count || 0,
        totalPages: Math.ceil((count || 0) / prev.pageSize),
      }));

    } catch (error) {
      console.error('Error generating report:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user, filters, pagination.page, pagination.pageSize]);

  // Efeito para gerar relatório quando filtros ou página mudarem
  useEffect(() => {
    generateReport();
  }, [generateReport]);

  const debouncedFilterChange = useMemo(
    () => debounce(() => {
      setPagination(prev => ({ ...prev, page: 1 }));
    }, 800),
    []
  );

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    debouncedFilterChange();
  };

  const handlePageChange = (newPage: number) => {
    setPagination(prev => ({ ...prev, page: newPage }));
  };

  const exportToXLSX = (data: ReportData[]) => {
    const headers = [
      'Unidade',
      'Nome do Aluno',
      'Turma',
      'Curso',
      'Módulos',
      'Ciclo',
      'Situação do Ciclo',
      'Situação do Aluno',
      'Total de Aulas',
      'Aulas Assistidas',
      'Frequência',
      'Últimos Acessos',
    ];

    const rows = data.map((row) => [
      row.unitName,
      row.studentName,
      row.className,
      row.courseName,
      row.moduleNames.join(', ') || '-',
      row.cycleName,
      row.cycleStatus === 'active' ? 'Ativo' : 'Encerrado',
      row.displayStatus,
      row.totalClasses?.toString() || '',
      row.attendedClasses?.toString() || '',
      row.attendancePercentage ? `${row.attendancePercentage.toFixed(1)}%` : '-',
      row.lastAccesses?.join(', ') || '-',
    ]);

    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);

    // Ajustar largura das colunas
    const colWidths = headers.map((_, idx) => {
      const maxLength = Math.max(
        headers[idx].length,
        ...rows.map(row => (row[idx]?.toString() || '').length)
      );
      return { wch: Math.min(maxLength + 2, 50) };
    });
    worksheet['!cols'] = colWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Relatório');

    XLSX.writeFile(workbook, `relatorio_${new Date().toISOString().split('T')[0]}.xlsx`);
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

  const exportToPDF = async () => {
    if (reportData.length === 0) return;

    setIsExporting(true);

    try {
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const margin = 10;

      // Cabeçalho
      const addHeader = () => {
        // Logo
        try {
          pdf.addImage(logoImg, 'PNG', margin, 5, 20, 20);
        } catch (e) {
          console.warn('Could not add logo', e);
        }

        pdf.setFontSize(16);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Relatório de Acompanhamento de Alunos', pageWidth / 2, 15, { align: 'center' });

        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'normal');
        pdf.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, pageWidth / 2, 22, { align: 'center' });

        // Filtros aplicados
        let yPos = 30;
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Filtros aplicados:', margin, yPos);
        
        yPos += 4;
        pdf.setFont('helvetica', 'normal');
        const filterTexts = [];
        if (filters.cycleId) {
          const cycle = cycles.find(c => c.id === filters.cycleId);
          filterTexts.push(`Ciclo: ${cycle?.name || 'Todos'}`);
        }
        if (filters.classId) {
          const cls = classes.find(c => c.id === filters.classId);
          filterTexts.push(`Turma: ${cls?.name || 'Todos'}`);
        }
        if (filters.unitId) {
          const unit = units.find(u => u.id === filters.unitId);
          filterTexts.push(`Unidade: ${unit?.name || 'Todos'}`);
        }
        if (filters.modality !== 'all') {
          filterTexts.push(`Modalidade: ${filters.modality === 'VIDEOCONFERENCIA' ? 'Videoconferência' : 'EAD 24h'}`);
        }
        
        pdf.text(filterTexts.join(' | ') || 'Nenhum filtro aplicado', margin, yPos);

        // Estatísticas
        yPos += 8;
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Distribuição por Situação', margin, yPos);

        yPos += 6;
        const statsData = [
          ['Em Andamento', stats.emAndamentoCount.toString(), `${((stats.emAndamentoCount / stats.totalStudents) * 100 || 0).toFixed(1)}%`],
          ['Aprovados', stats.aprovadoCount.toString(), `${((stats.aprovadoCount / stats.totalStudents) * 100 || 0).toFixed(1)}%`],
          ['Reprovados', stats.reprovadoCount.toString(), `${((stats.reprovadoCount / stats.totalStudents) * 100 || 0).toFixed(1)}%`],
        ];

        autoTable(pdf, {
          startY: yPos,
          head: [['Situação', 'Quantidade', 'Percentual']],
          body: statsData,
          theme: 'grid',
          headStyles: { fillColor: [59, 130, 246] },
          margin: { left: margin, right: margin },
        });

        return (pdf as any).lastAutoTable.finalY + 5;
      };

      let finalY = addHeader();

      // Tabela de dados
      const tableHeaders = [
        'Unidade',
        'Aluno',
        'Turma',
        'Curso',
        'Módulos',
        'Ciclo',
        'Situação',
        'Aulas',
        'Freq.',
        'Acessos',
      ];

      const tableBody = reportData.map(row => [
        row.unitName,
        row.studentName,
        row.className,
        row.courseName,
        row.moduleNames.join(', ') || '-',
        row.cycleName,
        row.displayStatus,
        row.totalClasses?.toString() || '-',
        row.attendancePercentage ? `${row.attendancePercentage.toFixed(1)}%` : '-',
        row.lastAccesses?.join(', ') || '-',
      ]);

      autoTable(pdf, {
        startY: finalY,
        head: [tableHeaders],
        body: tableBody,
        theme: 'striped',
        headStyles: { fillColor: [59, 130, 246] },
        styles: { fontSize: 7, cellPadding: 2 },
        columnStyles: {
          0: { cellWidth: 25 }, // Unidade
          1: { cellWidth: 30 }, // Aluno
          2: { cellWidth: 25 }, // Turma
          3: { cellWidth: 30 }, // Curso
          4: { cellWidth: 25 }, // Módulos
          5: { cellWidth: 20 }, // Ciclo
          6: { cellWidth: 15 }, // Situação
          7: { cellWidth: 10 }, // Aulas
          8: { cellWidth: 12 }, // Freq.
          9: { cellWidth: 25 }, // Acessos
        },
        margin: { left: margin, right: margin },
      });

      pdf.save(`relatorio_${new Date().toISOString().split('T')[0]}.pdf`);

    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Erro ao gerar PDF. Tente novamente.');
    } finally {
      setIsExporting(false);
    }
  };

  const getStatusColor = (displayStatus: string) => {
    switch (displayStatus) {
      case 'Em Andamento':
        return 'bg-blue-100 text-blue-700';
      case 'Aprovado':
        return 'bg-green-100 text-green-700';
      case 'Reprovado':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  };

  return (
    <div className="space-y-6" ref={reportRef}>
      {/* Header com botões de exportação */}
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-slate-800">Relatórios</h2>
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
            <span>{isExporting ? 'Exportando...' : 'Exportar XLSX'}</span>
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

      {/* Filtros */}
      <div className="bg-white border border-slate-200 rounded-lg p-6">
        <div className="flex items-center space-x-2 mb-4">
          <Filter className="w-5 h-5 text-slate-600" />
          <h3 className="font-semibold text-slate-800">Filtros</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Ciclo</label>
            <select
              value={filters.cycleId}
              onChange={(e) => handleFilterChange('cycleId', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
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
            <label className="block text-sm font-medium text-slate-700 mb-2">Turma</label>
            <select
              value={filters.classId}
              onChange={(e) => handleFilterChange('classId', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
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
            <label className="block text-sm font-medium text-slate-700 mb-2">Unidade</label>
            <select
              value={filters.unitId}
              onChange={(e) => handleFilterChange('unitId', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
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
            <label className="block text-sm font-medium text-slate-700 mb-2">Modalidade</label>
            <select
              value={filters.modality}
              onChange={(e) => handleFilterChange('modality', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            >
              <option value="all">Todas</option>
              <option value="VIDEOCONFERENCIA">Videoconferência</option>
              <option value="EAD">EAD 24h</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Situação</label>
            <select
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            >
              <option value="all">Todas</option>
              <option value="em_andamento">Em Andamento</option>
              <option value="aprovado">Aprovado</option>
              <option value="reprovado">Reprovado</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Data Início</label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => handleFilterChange('startDate', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Data Fim</label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => handleFilterChange('endDate', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>

          <div className="md:col-span-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">Buscar Nome do Aluno</label>
            <input
              type="text"
              placeholder="Digite o nome do aluno..."
              value={filters.studentName}
              onChange={(e) => handleFilterChange('studentName', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {/* Estatísticas */}
      <div className="bg-white border border-slate-200 rounded-lg p-6">
        <h3 className="font-semibold text-slate-800 mb-4">Estatísticas</h3>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-600 font-medium">Total de Alunos</p>
            <p className="text-2xl font-bold text-blue-700">{stats.totalStudents}</p>
          </div>

          <div className="bg-blue-100 border border-blue-300 rounded-lg p-4">
            <p className="text-sm text-blue-800 font-medium">Em Andamento</p>
            <p className="text-2xl font-bold text-blue-900">{stats.emAndamentoCount}</p>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-sm text-green-600 font-medium">Aprovados</p>
            <p className="text-2xl font-bold text-green-700">{stats.aprovadoCount}</p>
          </div>

          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-600 font-medium">Reprovados</p>
            <p className="text-2xl font-bold text-red-700">{stats.reprovadoCount}</p>
          </div>
        </div>

        {/* Barra de progresso */}
        <div className="mb-2">
          <div className="flex justify-between text-sm text-slate-600 mb-1">
            <span>Distribuição por Situação</span>
            <span>
              Em Andamento: {((stats.emAndamentoCount / stats.totalStudents) * 100 || 0).toFixed(1)}% | 
              Aprovados: {((stats.aprovadoCount / stats.totalStudents) * 100 || 0).toFixed(1)}% | 
              Reprovados: {((stats.reprovadoCount / stats.totalStudents) * 100 || 0).toFixed(1)}%
            </span>
          </div>
          <div className="w-full h-8 bg-slate-200 rounded-lg overflow-hidden flex">
            {stats.totalStudents > 0 && (
              <>
                <div
                  className="bg-blue-500 h-full flex items-center justify-center text-white text-xs font-medium transition-all duration-300"
                  style={{ width: `${(stats.emAndamentoCount / stats.totalStudents) * 100}%` }}
                >
                  {((stats.emAndamentoCount / stats.totalStudents) * 100) > 8 && 
                    `${((stats.emAndamentoCount / stats.totalStudents) * 100).toFixed(0)}%`}
                </div>
                <div
                  className="bg-green-500 h-full flex items-center justify-center text-white text-xs font-medium transition-all duration-300"
                  style={{ width: `${(stats.aprovadoCount / stats.totalStudents) * 100}%` }}
                >
                  {((stats.aprovadoCount / stats.totalStudents) * 100) > 8 && 
                    `${((stats.aprovadoCount / stats.totalStudents) * 100).toFixed(0)}%`}
                </div>
                <div
                  className="bg-red-500 h-full flex items-center justify-center text-white text-xs font-medium transition-all duration-300"
                  style={{ width: `${(stats.reprovadoCount / stats.totalStudents) * 100}%` }}
                >
                  {((stats.reprovadoCount / stats.totalStudents) * 100) > 8 && 
                    `${((stats.reprovadoCount / stats.totalStudents) * 100).toFixed(0)}%`}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Tabela de dados */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Unidade
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Aluno
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Turma
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Curso
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Módulos
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Ciclo
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Situação
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Aulas
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Frequência
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Últimos Acessos
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="px-6 py-12 text-center text-slate-500">
                    <div className="flex justify-center items-center space-x-2">
                      <Loader2 className="w-6 h-6 animate-spin text-green-500" />
                      <span>Carregando dados...</span>
                    </div>
                  </td>
                </tr>
              ) : reportData.length > 0 ? (
                reportData.map((row, index) => (
                  <tr key={`${row.studentId}-${row.classId}`} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-3 text-sm text-slate-700">{row.unitName}</td>
                    <td className="px-6 py-3 text-sm font-medium text-slate-800">{row.studentName}</td>
                    <td className="px-6 py-3 text-sm text-slate-700">{row.className}</td>
                    <td className="px-6 py-3 text-sm text-slate-700">{row.courseName}</td>
                    <td className="px-6 py-3 text-sm text-slate-700">
                      {row.moduleNames.length > 0 ? row.moduleNames.join(', ') : '-'}
                    </td>
                    <td className="px-6 py-3 text-sm text-slate-700">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        row.cycleStatus === 'active'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-slate-100 text-slate-700'
                      }`}>
                        {row.cycleName}
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(row.displayStatus)}`}
                      >
                        {row.displayStatus}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-sm text-slate-700">
                      {row.classModality === 'VIDEOCONFERENCIA' 
                        ? `${row.attendedClasses}/${row.totalClasses}`
                        : `${row.totalClasses} aulas`}
                    </td>
                    <td className="px-6 py-3 text-sm text-slate-700 font-medium">
                      {row.classModality === 'VIDEOCONFERENCIA' 
                        ? `${row.attendancePercentage?.toFixed(1)}%`
                        : '-'}
                    </td>
                    <td className="px-6 py-3 text-sm text-slate-700">
                      {row.lastAccesses?.length ? row.lastAccesses.join(', ') : '-'}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={10} className="px-6 py-12 text-center text-slate-500">
                    Nenhum dado encontrado com os filtros selecionados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        {pagination.totalPages > 1 && !isLoading && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-slate-200 bg-slate-50">
            <div className="text-sm text-slate-600">
              Mostrando {((pagination.page - 1) * pagination.pageSize) + 1} a{' '}
              {Math.min(pagination.page * pagination.pageSize, pagination.total)} de{' '}
              {pagination.total} registros
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={pagination.page === 1}
                className="p-2 rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-4 py-2 text-sm text-slate-600">
                Página {pagination.page} de {pagination.totalPages}
              </span>
              <button
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={pagination.page === pagination.totalPages}
                className="p-2 rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
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
