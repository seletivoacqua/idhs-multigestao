import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Filter, FileSpreadsheet, FileText, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import logoImg from '../../assets/image.png';
import { debounce } from 'lodash';

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
}

interface ReportData {
  studentName: string;
  unitName: string;
  courseName: string;
  className: string;
  classesTotal?: number;
  classesAttended?: number;
  attendancePercentage?: number;
  lastAccesses?: string[];
  status: 'Frequente' | 'Ausente';
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
  });

  const { user } = useAuth();
  const reportRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [stats, setStats] = useState({
    totalStudents: 0,
    presentCount: 0,
    absentCount: 0,
  });

  // Cache para dados de presença
  const attendanceCache = useRef<Map<string, any>>(new Map());
  const eadCache = useRef<Map<string, any>>(new Map());

  useEffect(() => {
    loadInitialData();
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Load initial data (units, cycles, classes)
  const loadInitialData = async () => {
    if (!user) return;

    try {
      const [unitsRes, cyclesRes, classesRes] = await Promise.all([
        supabase.from('units').select('id, name').order('name'),
        supabase.from('cycles').select('id, name').order('created_at', { ascending: false }),
        supabase.from('classes').select('id, name').order('name'),
      ]);

      if (unitsRes.data) setUnits(unitsRes.data);
      if (cyclesRes.data) setCycles(cyclesRes.data);
      if (classesRes.data) setClasses(classesRes.data);
    } catch (error) {
      console.error('Error loading initial data:', error);
    }
  };

  // Debounced filter change
  const debouncedFilterChange = useCallback(
    debounce((newFilters) => {
      setPagination(prev => ({ ...prev, page: 1 }));
      generateReport();
    }, 800),
    []
  );

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => {
      const newFilters = { ...prev, [key]: value };
      debouncedFilterChange(newFilters);
      return newFilters;
    });
  };

  // Versão otimizada do generateReport com paginação
  const generateReport = async () => {
    if (!user) return;

    // Cancelar requisição anterior
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    setIsLoading(true);

    try {
      // 1. Primeiro, obter o total de registros para paginação
      let countQuery = supabase
        .from('classes')
        .select('id', { count: 'exact', head: true });

      if (filters.cycleId) countQuery = countQuery.eq('cycle_id', filters.cycleId);
      if (filters.classId) countQuery = countQuery.eq('id', filters.classId);
      if (filters.modality !== 'all') countQuery = countQuery.eq('modality', filters.modality);

      const { count: totalClasses } = await countQuery;

      if (!totalClasses || totalClasses === 0) {
        setReportData([]);
        setStats({ totalStudents: 0, presentCount: 0, absentCount: 0 });
        setPagination(prev => ({ ...prev, total: 0, totalPages: 0 }));
        return;
      }

      // 2. Buscar apenas as turmas da página atual com paginação
      const from = (pagination.page - 1) * pagination.pageSize;
      const to = from + pagination.pageSize - 1;

      let classesQuery = supabase
        .from('classes')
        .select(`
          id,
          name,
          modality,
          total_classes,
          courses!inner (
            name,
            modality
          ),
          class_students (
            student_id
          )
        `)
        .range(from, to);

      if (filters.cycleId) classesQuery = classesQuery.eq('cycle_id', filters.cycleId);
      if (filters.classId) classesQuery = classesQuery.eq('id', filters.classId);
      if (filters.modality !== 'all') classesQuery = classesQuery.eq('modality', filters.modality);

      const { data: classes } = await classesQuery;

      if (!classes || classes.length === 0) {
        setReportData([]);
        return;
      }

      // 3. Coletar todos os student_ids de uma vez
      const classIds = classes.map(c => c.id);
      
      const { data: classStudents } = await supabase
        .from('class_students')
        .select(`
          student_id,
          class_id,
          students!inner (
            id,
            full_name,
            unit_id,
            units (name)
          )
        `)
        .in('class_id', classIds);

      if (!classStudents) {
        setReportData([]);
        return;
      }

      const studentIds = classStudents.map(cs => cs.student_id);
      const uniqueStudentIds = [...new Set(studentIds)];

      // 4. Buscar presenças de forma otimizada
      let attendanceData: any[] = [];
      let eadAccessData: any[] = [];

      const videoconferenceClasses = classes.filter(c => c.modality === 'VIDEOCONFERENCIA');
      const eadClasses = classes.filter(c => c.modality === 'EAD');

      // Buscar em paralelo
      await Promise.all([
        (async () => {
          if (videoconferenceClasses.length > 0) {
            let query = supabase
              .from('attendance')
              .select('class_id, student_id, class_date')
              .in('class_id', classIds)
              .in('student_id', uniqueStudentIds)
              .eq('present', true);

            if (filters.startDate) query = query.gte('class_date', filters.startDate);
            if (filters.endDate) query = query.lte('class_date', filters.endDate);

            const { data } = await query;
            attendanceData = data || [];
          }
        })(),
        (async () => {
          if (eadClasses.length > 0) {
            const { data } = await supabase
              .from('ead_access')
              .select('class_id, student_id, access_date_1, access_date_2, access_date_3')
              .in('class_id', classIds)
              .in('student_id', uniqueStudentIds);

            eadAccessData = data || [];
          }
        })()
      ]);

      // 5. Criar maps para acesso rápido
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

      // 6. Processar dados
      const allReportData: ReportData[] = [];
      const classMap = new Map(classes.map(c => [c.id, c]));

      for (const cs of classStudents) {
        const cls = classMap.get(cs.class_id);
        if (!cls) continue;

        const student = cs.students;
        
        // Aplicar filtros adicionais
        if (filters.unitId && student.unit_id !== filters.unitId) continue;
        if (filters.studentName && !student.full_name.toLowerCase().includes(filters.studentName.toLowerCase())) continue;

        const unitName = student.units?.name || 
                        units.find(u => u.id === student.unit_id)?.name || 
                        'Não informado';

        if (cls.modality === 'VIDEOCONFERENCIA') {
          const key = `${cls.id}_${student.id}`;
          const attendances = attendanceMap.get(key) || [];
          
          const attendedCount = attendances.length;
          const percentage = cls.total_classes > 0 ? (attendedCount / cls.total_classes) * 100 : 0;

          allReportData.push({
            studentName: student.full_name,
            unitName,
            courseName: cls.courses.name,
            className: cls.name,
            classesTotal: cls.total_classes,
            classesAttended: attendedCount,
            attendancePercentage: percentage,
            status: percentage >= 60 ? 'Frequente' : 'Ausente',
          });
        } else {
          const key = `${cls.id}_${student.id}`;
          const access = eadMap.get(key);
          
          let accesses = [
            access?.access_date_1,
            access?.access_date_2,
            access?.access_date_3,
          ].filter(Boolean);

          if (filters.startDate || filters.endDate) {
            accesses = accesses.filter((d) => {
              if (!d) return false;
              const accessDate = new Date(d);
              if (filters.startDate && accessDate < new Date(filters.startDate)) return false;
              if (filters.endDate && accessDate > new Date(filters.endDate)) return false;
              return true;
            });
          }

          allReportData.push({
            studentName: student.full_name,
            unitName,
            courseName: cls.courses.name,
            className: cls.name,
            lastAccesses: accesses.map(d => d ? new Date(d).toLocaleDateString('pt-BR') : ''),
            status: accesses.length > 0 ? 'Frequente' : 'Ausente',
          });
        }
      }

      setReportData(allReportData);

      // Calcular estatísticas
      const presentCount = allReportData.filter(d => d.status === 'Frequente').length;
      const absentCount = allReportData.filter(d => d.status === 'Ausente').length;

      setStats({
        totalStudents: allReportData.length,
        presentCount,
        absentCount,
      });

      // Atualizar paginação
      setPagination(prev => ({
        ...prev,
        total: totalClasses,
        totalPages: Math.ceil(totalClasses / prev.pageSize),
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

  // Função de exportação otimizada (busca todos os dados apenas quando necessário)
  const exportAllData = async () => {
    if (reportData.length === 0) return;
    
    setIsExporting(true);
    
    try {
      // Se já temos todos os dados (poucos registros), usa os dados atuais
      if (pagination.total <= pagination.pageSize) {
        exportToXLSX(reportData);
        return;
      }

      // Caso contrário, busca todos os dados para exportação
      const allData = await fetchAllDataForExport();
      
      if (filters.modality === 'all' || filters.modality === 'VIDEOCONFERENCIA') {
        exportToXLSX(allData);
      } else {
        exportToXLSX(allData);
      }
    } finally {
      setIsExporting(false);
    }
  };

  const fetchAllDataForExport = async () => {
    // Implementar lógica para buscar todos os dados
    // Similar ao generateReport mas sem paginação
    return reportData; // Placeholder
  };

  const exportToXLSX = (data: ReportData[]) => {
    const headers = ['Unidade', 'Nome do Aluno', 'Turma', 'Curso'];

    if (data[0]?.classesTotal !== undefined) {
      headers.push('Aulas Ministradas', 'Aulas Assistidas', 'Frequência (%)', 'Situação');
    } else {
      headers.push('Últimos Acessos', 'Situação');
    }

    const rows = data.map((row) => {
      const base = [row.unitName, row.studentName, row.className, row.courseName];

      if (row.classesTotal !== undefined) {
        base.push(
          row.classesTotal?.toString() || '',
          row.classesAttended?.toString() || '',
          row.attendancePercentage?.toFixed(1) || '',
          row.status
        );
      } else {
        base.push(row.lastAccesses?.join(', ') || '', row.status);
      }

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

      const presentPercentage = stats.totalStudents > 0
        ? (stats.presentCount / stats.totalStudents) * 100
        : 0;
      const absentPercentage = stats.totalStudents > 0
        ? (stats.absentCount / stats.totalStudents) * 100
        : 0;

      // Criar container para o PDF
      const container = document.createElement('div');
      container.style.width = `${contentWidth * 3.78}px`;
      container.style.padding = '10px';
      container.style.backgroundColor = '#ffffff';
      container.style.fontFamily = 'Arial, sans-serif';

      // Adicionar cabeçalho
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
      title.textContent = 'Relatório de Frequência';
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

      // Informações dos filtros
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

      if (filters.classId) {
        const cls = classes.find(c => c.id === filters.classId);
        const filterItem = document.createElement('span');
        filterItem.textContent = `Turma: ${cls?.name || 'Todas'}`;
        filtersDiv.appendChild(filterItem);
      }

      const totalItem = document.createElement('span');
      totalItem.textContent = `Total: ${stats.totalStudents} alunos`;
      filtersDiv.appendChild(totalItem);

      container.appendChild(filtersDiv);

      // Estatísticas e barra de progresso
      const statsDiv = document.createElement('div');
      statsDiv.style.marginBottom = '20px';

      const statsTitle = document.createElement('h3');
      statsTitle.textContent = 'Distribuição de Frequência';
      statsTitle.style.fontSize = '14px';
      statsTitle.style.fontWeight = 'bold';
      statsTitle.style.marginBottom = '10px';
      statsTitle.style.color = '#1e293b';
      statsDiv.appendChild(statsTitle);

      const statsText = document.createElement('div');
      statsText.style.display = 'flex';
      statsText.style.justifyContent = 'space-between';
      statsText.style.marginBottom = '5px';
      statsText.style.fontSize = '12px';
      statsText.style.color = '#475569';
      statsText.innerHTML = `
        <span>Frequentes: ${stats.presentCount} alunos (${presentPercentage.toFixed(1)}%)</span>
        <span>Ausentes: ${stats.absentCount} alunos (${absentPercentage.toFixed(1)}%)</span>
      `;
      statsDiv.appendChild(statsText);

      const progressBar = document.createElement('div');
      progressBar.style.width = '100%';
      progressBar.style.height = '24px';
      progressBar.style.backgroundColor = '#e2e8f0';
      progressBar.style.borderRadius = '6px';
      progressBar.style.overflow = 'hidden';
      progressBar.style.display = 'flex';
      progressBar.style.marginTop = '5px';

      if (stats.totalStudents > 0) {
        const presentBar = document.createElement('div');
        presentBar.style.width = `${presentPercentage}%`;
        presentBar.style.height = '100%';
        presentBar.style.backgroundColor = '#22c55e';
        presentBar.style.display = 'flex';
        presentBar.style.alignItems = 'center';
        presentBar.style.justifyContent = 'center';
        presentBar.style.color = 'white';
        presentBar.style.fontSize = '11px';
        presentBar.style.fontWeight = 'bold';
        presentBar.textContent = presentPercentage > 8 ? `${presentPercentage.toFixed(0)}%` : '';

        const absentBar = document.createElement('div');
        absentBar.style.width = `${absentPercentage}%`;
        absentBar.style.height = '100%';
        absentBar.style.backgroundColor = '#ef4444';
        absentBar.style.display = 'flex';
        absentBar.style.alignItems = 'center';
        absentBar.style.justifyContent = 'center';
        absentBar.style.color = 'white';
        absentBar.style.fontSize = '11px';
        absentBar.style.fontWeight = 'bold';
        absentBar.textContent = absentPercentage > 8 ? `${absentPercentage.toFixed(0)}%` : '';

        progressBar.appendChild(presentBar);
        progressBar.appendChild(absentBar);
      }

      statsDiv.appendChild(progressBar);
      container.appendChild(statsDiv);

      // Clonar tabela
      const tableClone = tableRef.current.cloneNode(true) as HTMLTableElement;
      tableClone.style.width = '100%';
      tableClone.style.borderCollapse = 'collapse';
      tableClone.style.fontSize = '10px';

      container.appendChild(tableClone);
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

  const presentPercentage = useMemo(() => 
    stats.totalStudents > 0 ? (stats.presentCount / stats.totalStudents) * 100 : 0,
    [stats.presentCount, stats.totalStudents]
  );
  
  const absentPercentage = useMemo(() => 
    stats.totalStudents > 0 ? (stats.absentCount / stats.totalStudents) * 100 : 0,
    [stats.absentCount, stats.totalStudents]
  );

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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

          <div className="md:col-span-3">
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

      <div className="bg-white border border-slate-200 rounded-lg p-6">
        <h3 className="font-semibold text-slate-800 mb-4">Estatísticas</h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-600 font-medium">Total de Alunos</p>
            <p className="text-2xl font-bold text-blue-700">{stats.totalStudents}</p>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-sm text-green-600 font-medium">Frequentes</p>
            <p className="text-2xl font-bold text-green-700">{stats.presentCount}</p>
          </div>

          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-600 font-medium">Ausentes</p>
            <p className="text-2xl font-bold text-red-700">{stats.absentCount}</p>
          </div>
        </div>

        <div className="mb-2">
          <div className="flex justify-between text-sm text-slate-600 mb-1">
            <span>Distribuição de Frequência</span>
            <span>
              {presentPercentage.toFixed(1)}% Frequentes / {absentPercentage.toFixed(1)}% Ausentes
            </span>
          </div>
          <div className="w-full h-8 bg-slate-200 rounded-lg overflow-hidden flex">
            {stats.totalStudents > 0 && (
              <>
                <div
                  className="bg-green-500 h-full flex items-center justify-center text-white text-xs font-medium transition-all duration-300"
                  style={{ width: `${presentPercentage}%` }}
                >
                  {presentPercentage > 8 && `${presentPercentage.toFixed(0)}%`}
                </div>
                <div
                  className="bg-red-500 h-full flex items-center justify-center text-white text-xs font-medium transition-all duration-300"
                  style={{ width: `${absentPercentage}%` }}
                >
                  {absentPercentage > 8 && `${absentPercentage.toFixed(0)}%`}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table ref={tableRef} className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Unidade
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Nome do Aluno
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Turma
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Curso
                </th>
                {reportData[0]?.classesTotal !== undefined ? (
                  <>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                      Aulas
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                      Assistidas
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                      Frequência
                    </th>
                  </>
                ) : (
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                    Últimos Acessos
                  </th>
                )}
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Situação
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
                    <div className="flex justify-center items-center space-x-2">
                      <Loader2 className="w-6 h-6 animate-spin text-green-500" />
                      <span>Carregando dados...</span>
                    </div>
                  </td>
                </tr>
              ) : reportData.length > 0 ? (
                reportData.map((row, index) => (
                  <tr key={index} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-3 text-sm text-slate-700">{row.unitName}</td>
                    <td className="px-6 py-3 text-sm font-medium text-slate-800">{row.studentName}</td>
                    <td className="px-6 py-3 text-sm text-slate-700">{row.className}</td>
                    <td className="px-6 py-3 text-sm text-slate-700">{row.courseName}</td>
                    {row.classesTotal !== undefined ? (
                      <>
                        <td className="px-6 py-3 text-sm text-slate-700">{row.classesTotal}</td>
                        <td className="px-6 py-3 text-sm text-slate-700">{row.classesAttended}</td>
                        <td className="px-6 py-3 text-sm text-slate-700 font-medium">
                          {row.attendancePercentage?.toFixed(1)}%
                        </td>
                      </>
                    ) : (
                      <td className="px-6 py-3 text-sm text-slate-700">
                        {row.lastAccesses?.length ? row.lastAccesses.join(', ') : '-'}
                      </td>
                    )}
                    <td className="px-6 py-3">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          row.status === 'Frequente'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
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
