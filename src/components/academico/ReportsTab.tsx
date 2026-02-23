import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Filter, FileSpreadsheet, FileText, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import logoImg from '../../assets/image.png';

// Implementação manual do debounce (removendo dependência do lodash)
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
}

interface Class {
  id: string;
  name: string;
  modality: string;
  cycle_id: string;
}

interface ReportData {
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
    pageSize: 100,
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

  // Cache para dados de unidades
  const unitsMap = useRef<Map<string, string>>(new Map());

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
      // Carregar todos os dados iniciais em paralelo
      const [unitsRes, cyclesRes, classesRes] = await Promise.all([
        supabase.from('units').select('id, name').order('name'),
        supabase.from('cycles').select('id, name').order('created_at', { ascending: false }),
        supabase.from('classes').select('id, name, modality, cycle_id').order('name'),
      ]);

      if (unitsRes.data) {
        setUnits(unitsRes.data);
        // Criar mapa de unidades para lookup rápido
        unitsRes.data.forEach(unit => unitsMap.current.set(unit.id, unit.name));
      }
      if (cyclesRes.data) setCycles(cyclesRes.data);
      if (classesRes.data) setClasses(classesRes.data);
    } catch (error) {
      console.error('Error loading initial data:', error);
    }
  };

  // Debounce manual
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

  // Função para limpar filtros
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

  const generateReport = async () => {
    if (!user) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    setIsLoading(true);

    try {
      // Construir query base para class_students com joins
      let query = supabase
        .from('class_students')
        .select(`
          id,
          enrollment_type,
          enrollment_date,
          current_status,
          status_updated_at,
          students!inner (
            id,
            full_name,
            cpf,
            unit_id
          ),
          classes!inner (
            id,
            name,
            modality,
            total_classes,
            course_id,
            cycle_id,
            courses!inner (
              name
            ),
            cycles!inner (
              name,
              status,
              start_date,
              end_date
            )
          )
        `, { count: 'exact' });

      // Aplicar filtros
      if (filters.cycleId) {
        query = query.eq('classes.cycle_id', filters.cycleId);
      }

      if (filters.classId) {
        query = query.eq('class_id', filters.classId);
      }

      if (filters.unitId) {
        query = query.eq('students.unit_id', filters.unitId);
      }

      if (filters.modality !== 'all') {
        query = query.eq('classes.modality', filters.modality);
      }

      if (filters.studentName) {
        query = query.ilike('students.full_name', `%${filters.studentName}%`);
      }

      if (filters.status !== 'all') {
        query = query.eq('current_status', filters.status);
      }

      // Paginação
      const from = (pagination.page - 1) * pagination.pageSize;
      const to = from + pagination.pageSize - 1;
      query = query.range(from, to).order('students.full_name');

      const { data: classStudents, count, error } = await query;

      if (error) {
        console.error('Error loading report data:', error);
        return;
      }

      if (!classStudents || classStudents.length === 0) {
        setReportData([]);
        setStats({ totalStudents: 0, emAndamentoCount: 0, aprovadoCount: 0, reprovadoCount: 0 });
        setPagination(prev => ({ ...prev, total: 0, totalPages: 0 }));
        return;
      }

      // Processar dados - sem buscar attendance/ead adicional se não houver filtros de data
      const processedData: ReportData[] = [];
      const today = new Date().toISOString().split('T')[0];

      for (const cs of classStudents) {
        const cls = cs.classes;
        const student = cs.students;
        const cycle = cls.cycles;

        // Determinar status de exibição
        let displayStatus = '';
        const isCycleActive = cycle.status === 'active' && today <= cycle.end_date;

        if (isCycleActive) {
          displayStatus = 'Em Andamento';
        } else if (cs.current_status === 'aprovado') {
          displayStatus = 'Aprovado';
        } else if (cs.current_status === 'reprovado') {
          displayStatus = 'Reprovado';
        } else {
          displayStatus = 'Pendente';
        }

        const unitName = unitsMap.current.get(student.unit_id) || 'Não informado';

        if (cls.modality === 'VIDEOCONFERENCIA') {
          processedData.push({
            studentName: student.full_name,
            unitName,
            courseName: cls.courses.name,
            className: cls.name,
            classModality: cls.modality,
            classesTotal: cls.total_classes,
            classesAttended: 0, // Não calculamos sem filtros de data
            attendancePercentage: 0,
            currentStatus: cs.current_status || 'em_andamento',
            displayStatus,
            cycleStatus: cycle.status,
            cycleEndDate: cycle.end_date,
            enrollmentType: cs.enrollment_type,
            enrollmentDate: cs.enrollment_date,
          });
        } else {
          processedData.push({
            studentName: student.full_name,
            unitName,
            courseName: cls.courses.name,
            className: cls.name,
            classModality: cls.modality,
            lastAccesses: [], // Não buscamos sem filtros de data
            currentStatus: cs.current_status || 'em_andamento',
            displayStatus,
            cycleStatus: cycle.status,
            cycleEndDate: cycle.end_date,
            enrollmentType: cs.enrollment_type,
            enrollmentDate: cs.enrollment_date,
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

    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('Error generating report:', error);
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  // Versão detalhada do relatório (com dados de presença)
  const generateDetailedReport = async () => {
    if (!user || reportData.length === 0) return;
    
    setIsExporting(true);
    
    try {
      // Buscar dados detalhados apenas para exportação
      const classIds = [...new Set(reportData.map(r => r.className))]; // Isso precisaria ser ajustado
      const studentNames = reportData.map(r => r.studentName);
      
      // Buscar dados de attendance para videoconferência
      const { data: attendanceData } = await supabase
        .from('attendance')
        .select(`
          class_id,
          student_id,
          class_date,
          classes!inner (
            name,
            courses!inner (
              name
            )
          ),
          students!inner (
            full_name,
            units!inner (
              name
            )
          )
        `)
        .in('classes.name', classIds)
        .in('students.full_name', studentNames)
        .eq('present', true);

      // Processar dados detalhados para exportação
      // ... lógica para exportação detalhada
      
    } catch (error) {
      console.error('Error generating detailed report:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const exportToXLSX = (data: ReportData[]) => {
    const headers = [
      'Unidade',
      'Nome do Aluno',
      'Turma',
      'Curso',
      'Modalidade',
      'Tipo Matrícula',
      'Data Matrícula',
      'Status do Ciclo',
      'Data Fim do Ciclo',
      'Situação'
    ];

    if (data[0]?.classModality === 'VIDEOCONFERENCIA') {
      headers.splice(9, 0, 'Aulas Ministradas', 'Aulas Assistidas', 'Frequência (%)');
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
          row.classesTotal?.toString() || '',
          row.classesAttended?.toString() || '',
          row.attendancePercentage?.toFixed(1) || ''
        );
      } else {
        base.push(row.lastAccesses?.join(', ') || '');
      }

      base.push(row.displayStatus);
      return base;
    });

    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);

    const colWidths = headers.map((_, idx) => {
      const maxLength = Math.max(
        headers[idx].length,
        ...rows.map(row => (row[idx]?.toString() || '').length)
      );
      return { wch: Math.min(maxLength + 2, 40) };
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
      container.style.padding = '10px';
      container.style.backgroundColor = '#ffffff';
      container.style.fontFamily = 'Arial, sans-serif';

      // Cabeçalho
      const headerDiv = document.createElement('div');
      headerDiv.style.textAlign = 'center';
      headerDiv.style.marginBottom = '15px';

      const logo = document.createElement('img');
      logo.src = logoImg;
      logo.style.width = '60px';
      logo.style.height = 'auto';
      logo.style.marginBottom = '10px';
      headerDiv.appendChild(logo);

      const title = document.createElement('h1');
      title.textContent = 'Relatório de Acompanhamento de Alunos';
      title.style.fontSize = '20px';
      title.style.fontWeight = 'bold';
      title.style.marginBottom = '5px';
      title.style.color = '#1e293b';
      headerDiv.appendChild(title);

      const date = document.createElement('p');
      date.textContent = `Gerado em: ${new Date().toLocaleDateString('pt-BR')}`;
      date.style.fontSize = '12px';
      date.style.color = '#64748b';
      date.style.marginBottom = '10px';
      headerDiv.appendChild(date);

      container.appendChild(headerDiv);

      // Filtros
      const filtersDiv = document.createElement('div');
      filtersDiv.style.display = 'flex';
      filtersDiv.style.flexWrap = 'wrap';
      filtersDiv.style.gap = '15px';
      filtersDiv.style.marginBottom = '15px';
      filtersDiv.style.fontSize = '11px';
      filtersDiv.style.color = '#475569';

      if (filters.cycleId) {
        const cycle = cycles.find(c => c.id === filters.cycleId);
        const filterItem = document.createElement('span');
        filterItem.textContent = `Ciclo: ${cycle?.name || 'Todos'}`;
        filtersDiv.appendChild(filterItem);
      }

      const totalItem = document.createElement('span');
      totalItem.textContent = `Total: ${stats.totalStudents} alunos`;
      filtersDiv.appendChild(totalItem);

      container.appendChild(filtersDiv);

      // Estatísticas
      const statsDiv = document.createElement('div');
      statsDiv.style.marginBottom = '20px';

      const statsTitle = document.createElement('h3');
      statsTitle.textContent = 'Distribuição por Situação';
      statsTitle.style.fontSize = '14px';
      statsTitle.style.fontWeight = 'bold';
      statsTitle.style.marginBottom = '10px';
      statsTitle.style.color = '#1e293b';
      statsDiv.appendChild(statsTitle);

      const statsGrid = document.createElement('div');
      statsGrid.style.display = 'grid';
      statsGrid.style.gridTemplateColumns = 'repeat(3, 1fr)';
      statsGrid.style.gap = '10px';
      statsGrid.style.marginBottom = '10px';

      // Em Andamento
      const emAndamentoBox = document.createElement('div');
      emAndamentoBox.style.backgroundColor = '#dbeafe';
      emAndamentoBox.style.padding = '10px';
      emAndamentoBox.style.borderRadius = '8px';
      emAndamentoBox.innerHTML = `
        <div style="color: #1e40af; font-size: 12px; font-weight: 500;">Em Andamento</div>
        <div style="color: #1e3a8a; font-size: 24px; font-weight: bold;">${stats.emAndamentoCount}</div>
        <div style="color: #2563eb; font-size: 11px;">${emAndamentoPercentage.toFixed(1)}%</div>
      `;

      // Aprovados
      const aprovadoBox = document.createElement('div');
      aprovadoBox.style.backgroundColor = '#dcfce7';
      aprovadoBox.style.padding = '10px';
      aprovadoBox.style.borderRadius = '8px';
      aprovadoBox.innerHTML = `
        <div style="color: #166534; font-size: 12px; font-weight: 500;">Aprovados</div>
        <div style="color: #14532d; font-size: 24px; font-weight: bold;">${stats.aprovadoCount}</div>
        <div style="color: #16a34a; font-size: 11px;">${aprovadoPercentage.toFixed(1)}%</div>
      `;

      // Reprovados
      const reprovadoBox = document.createElement('div');
      reprovadoBox.style.backgroundColor = '#fee2e2';
      reprovadoBox.style.padding = '10px';
      reprovadoBox.style.borderRadius = '8px';
      reprovadoBox.innerHTML = `
        <div style="color: #991b1b; font-size: 12px; font-weight: 500;">Reprovados</div>
        <div style="color: #7f1d1d; font-size: 24px; font-weight: bold;">${stats.reprovadoCount}</div>
        <div style="color: #dc2626; font-size: 11px;">${reprovadoPercentage.toFixed(1)}%</div>
      `;

      statsGrid.appendChild(emAndamentoBox);
      statsGrid.appendChild(aprovadoBox);
      statsGrid.appendChild(reprovadoBox);
      statsDiv.appendChild(statsGrid);

      // Barra de progresso
      const progressBar = document.createElement('div');
      progressBar.style.width = '100%';
      progressBar.style.height = '24px';
      progressBar.style.backgroundColor = '#e2e8f0';
      progressBar.style.borderRadius = '6px';
      progressBar.style.overflow = 'hidden';
      progressBar.style.display = 'flex';
      progressBar.style.marginTop = '10px';

      if (stats.totalStudents > 0) {
        const emAndamentoBar = document.createElement('div');
        emAndamentoBar.style.width = `${emAndamentoPercentage}%`;
        emAndamentoBar.style.height = '100%';
        emAndamentoBar.style.backgroundColor = '#3b82f6';
        emAndamentoBar.style.display = 'flex';
        emAndamentoBar.style.alignItems = 'center';
        emAndamentoBar.style.justifyContent = 'center';
        emAndamentoBar.style.color = 'white';
        emAndamentoBar.style.fontSize = '11px';
        emAndamentoBar.style.fontWeight = 'bold';
        emAndamentoBar.textContent = emAndamentoPercentage > 8 ? `${emAndamentoPercentage.toFixed(0)}%` : '';

        const aprovadoBar = document.createElement('div');
        aprovadoBar.style.width = `${aprovadoPercentage}%`;
        aprovadoBar.style.height = '100%';
        aprovadoBar.style.backgroundColor = '#22c55e';
        aprovadoBar.style.display = 'flex';
        aprovadoBar.style.alignItems = 'center';
        aprovadoBar.style.justifyContent = 'center';
        aprovadoBar.style.color = 'white';
        aprovadoBar.style.fontSize = '11px';
        aprovadoBar.style.fontWeight = 'bold';
        aprovadoBar.textContent = aprovadoPercentage > 8 ? `${aprovadoPercentage.toFixed(0)}%` : '';

        const reprovadoBar = document.createElement('div');
        reprovadoBar.style.width = `${reprovadoPercentage}%`;
        reprovadoBar.style.height = '100%';
        reprovadoBar.style.backgroundColor = '#ef4444';
        reprovadoBar.style.display = 'flex';
        reprovadoBar.style.alignItems = 'center';
        reprovadoBar.style.justifyContent = 'center';
        reprovadoBar.style.color = 'white';
        reprovadoBar.style.fontSize = '11px';
        reprovadoBar.style.fontWeight = 'bold';
        reprovadoBar.textContent = reprovadoPercentage > 8 ? `${reprovadoPercentage.toFixed(0)}%` : '';

        progressBar.appendChild(emAndamentoBar);
        progressBar.appendChild(aprovadoBar);
        progressBar.appendChild(reprovadoBar);
      }

      statsDiv.appendChild(progressBar);
      container.appendChild(statsDiv);

      // Clonar tabela
      const tableClone = tableRef.current.cloneNode(true) as HTMLTableElement;
      tableClone.style.width = '100%';
      tableClone.style.borderCollapse = 'collapse';
      tableClone.style.fontSize = '8px';

      container.appendChild(tableClone);
      document.body.appendChild(container);

      const canvas = await html2canvas(container, {
        scale: 1.5,
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

      pdf.save(`relatorio_${new Date().toISOString().split('T')[0]}.pdf`);
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
              <option value="">Todas</option>
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
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

        <div className="mt-4 flex justify-end gap-3">
          <button
            onClick={handleClearFilters}
            className="px-6 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
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

        {stats.totalStudents > 0 && (
          <div className="mb-2">
            <div className="flex justify-between text-sm text-slate-600 mb-1">
              <span>Distribuição por Situação</span>
              <span>
                Em Andamento: {((stats.emAndamentoCount / stats.totalStudents) * 100).toFixed(1)}% | 
                Aprovados: {((stats.aprovadoCount / stats.totalStudents) * 100).toFixed(1)}% | 
                Reprovados: {((stats.reprovadoCount / stats.totalStudents) * 100).toFixed(1)}%
              </span>
            </div>
            <div className="w-full h-8 bg-slate-200 rounded-lg overflow-hidden flex">
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
            </div>
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table ref={tableRef} className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Unidade
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Aluno
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Turma
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Curso
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Mod.
                </th>
                {reportData[0]?.classModality === 'VIDEOCONFERENCIA' ? (
                  <>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                      Aulas
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                      Ass.
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                      Freq.
                    </th>
                  </>
                ) : (
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                    Acessos
                  </th>
                )}
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Mat.
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Ciclo
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {isLoading ? (
                <tr>
                  <td colSpan={12} className="px-4 py-12 text-center text-slate-500">
                    <div className="flex justify-center items-center space-x-2">
                      <Loader2 className="w-6 h-6 animate-spin text-green-500" />
                      <span>Carregando dados...</span>
                    </div>
                  </td>
                </tr>
              ) : reportData.length > 0 ? (
                reportData.map((row, index) => (
                  <tr key={index} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-2 text-xs text-slate-700">{row.unitName}</td>
                    <td className="px-4 py-2 text-xs font-medium text-slate-800">{row.studentName}</td>
                    <td className="px-4 py-2 text-xs text-slate-700">{row.className}</td>
                    <td className="px-4 py-2 text-xs text-slate-700">{row.courseName}</td>
                    <td className="px-4 py-2 text-xs">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        row.classModality === 'VIDEOCONFERENCIA'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}>
                        {row.classModality === 'VIDEOCONFERENCIA' ? 'VC' : 'EAD'}
                      </span>
                    </td>
                    {row.classModality === 'VIDEOCONFERENCIA' ? (
                      <>
                        <td className="px-4 py-2 text-xs text-slate-700">{row.classesTotal}</td>
                        <td className="px-4 py-2 text-xs text-slate-700">{row.classesAttended}</td>
                        <td className="px-4 py-2 text-xs font-medium">
                          <span className={row.attendancePercentage && row.attendancePercentage >= 60 ? 'text-green-600' : 'text-red-600'}>
                            {row.attendancePercentage?.toFixed(1)}%
                          </span>
                        </td>
                      </>
                    ) : (
                      <td className="px-4 py-2 text-xs text-slate-700">
                        {row.lastAccesses?.length ? row.lastAccesses.join(', ') : '-'}
                      </td>
                    )}
                    <td className="px-4 py-2 text-xs">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        row.enrollmentType === 'exceptional'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}>
                        {row.enrollmentType === 'exceptional' ? 'E' : 'R'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        row.cycleStatus === 'active' 
                          ? 'bg-green-100 text-green-700' 
                          : 'bg-slate-100 text-slate-700'
                      }`}>
                        {row.cycleStatus === 'active' ? 'Ativo' : 'Enc'}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(row.displayStatus)}`}>
                        {row.displayStatus === 'Em Andamento' ? 'And.' : 
                         row.displayStatus === 'Aprovado' ? 'Aprov' : 
                         row.displayStatus === 'Reprovado' ? 'Repr' : row.displayStatus}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={12} className="px-4 py-12 text-center text-slate-500">
                    Nenhum dado encontrado com os filtros selecionados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {pagination.totalPages > 1 && !isLoading && (
          <div className="flex items-center justify-between px-4 py-2 border-t border-slate-200 bg-slate-50">
            <div className="text-xs text-slate-600">
              {((pagination.page - 1) * pagination.pageSize) + 1} a{' '}
              {Math.min(pagination.page * pagination.pageSize, pagination.total)} de{' '}
              {pagination.total}
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={pagination.page === 1}
                className="p-1 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-3 py-1 text-xs text-slate-600">
                {pagination.page}/{pagination.totalPages}
              </span>
              <button
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={pagination.page === pagination.totalPages}
                className="p-1 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50"
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
