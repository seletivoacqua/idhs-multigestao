import { useState, useEffect, useRef } from 'react';
import { Filter, FileSpreadsheet, FileText, FileBarChart } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import logoImg from '../../assets/image.png';
import { SyntheticReportModal } from './SyntheticReportModal';

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

// Interface atualizada com campos para EAD
interface ReportData {
  unitName: string;
  studentName: string;
  studentCpf: string;
  className: string;
  cycleName: string;
  modality: string;
  classesAttended: number;
  totalClassesConsidered: number;
  ultimoAcesso: string;
  frequency: string;
  frequencyValue: number;
  situacao: 'FREQUENTE' | 'INCOMPLETO';
  totalAccesses: number;
  isFrequente?: boolean; // Campo específico para EAD (status manual)
  accessDates?: string[]; // Datas de acesso para EAD
  enrollmentDate?: string; // Data de matrícula
  enrollmentType?: 'regular' | 'exceptional'; // Tipo de matrícula
}

export function ReportsTab() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [reportData, setReportData] = useState<ReportData[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    cycleId: '',
    classId: '',
    unitId: '',
    modality: 'all',
    studentName: '',
    situacao: 'all', // Novo filtro: all, frequentes, incompletos
  });
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

  useEffect(() => {
    if (user) {
      loadUnits();
      loadCycles();
      loadClasses();
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      generateReport();
    }
  }, [filters, user]);

  const loadUnits = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('units')
      .select('id, name, municipality')
      .order('name');

    if (error) {
      console.error('Error loading units:', error);
      return;
    }

    setUnits(data || []);
  };

  const loadCycles = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('cycles')
      .select('id, name, start_date, end_date, status')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading cycles:', error);
      return;
    }

    setCycles(data || []);
  };

  const loadClasses = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('classes')
      .select('id, name, day_of_week, class_time, total_classes, modality')
      .order('name');

    if (error) {
      console.error('Error loading classes:', error);
      return;
    }

    setClasses(data || []);
  };

  const generateReport = async () => {
    if (!user) return;

    setLoading(true);

    let classesQuery = supabase
      .from('classes')
      .select(`
        *,
        courses (
          name,
          modality
        ),
        cycles (
          id,
          name,
          start_date,
          end_date,
          status
        )
      `);

    if (filters.cycleId) {
      classesQuery = classesQuery.eq('cycle_id', filters.cycleId);
    }

    if (filters.classId) {
      classesQuery = classesQuery.eq('id', filters.classId);
    }

    if (filters.modality !== 'all') {
      classesQuery = classesQuery.eq('modality', filters.modality);
    }

    const { data: classes, error: classesError } = await classesQuery;

    if (classesError) {
      console.error('Error loading classes:', classesError);
      setLoading(false);
      return;
    }

    const allReportData: ReportData[] = [];

    for (const cls of classes || []) {
      const { data: classStudents } = await supabase
        .from('class_students')
        .select(`
          *,
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

      if (!classStudents) continue;

      for (const cs of classStudents) {
        if (filters.unitId && cs.students?.unit_id !== filters.unitId) continue;
        if (filters.studentName && !cs.students?.full_name?.toLowerCase().includes(filters.studentName.toLowerCase())) continue;

        let unitName = 'Não informado';
        if (cs.students?.unit_id) {
          const unit = units.find(u => u.id === cs.students.unit_id);
          if (unit) {
            unitName = unit.name;
          } else if (cs.students.units) {
            unitName = cs.students.units.name || 'Não informado';
          }
        }

        let classesAttended = 0;
        let totalClassesConsidered = 0;
        let ultimoAcesso = '-';
        let frequency = '';
        let frequencyValue = 0;
        let situacao: 'FREQUENTE' | 'INCOMPLETO' = 'INCOMPLETO';
        let totalAccesses = 0;
        let isFrequente = false;
        let accessDates: string[] = [];

        const enrollmentDate = extractDatePart(cs.enrollment_date);
        const enrollmentType = cs.enrollment_type;

        if (cls.modality === 'VIDEOCONFERENCIA') {
          // Lógica para Videoconferência (mantida igual)
          let attendanceQuery = supabase
            .from('attendance')
            .select('*')
            .eq('class_id', cls.id)
            .eq('student_id', cs.student_id);

          if (filters.startDate) {
            attendanceQuery = attendanceQuery.gte('class_date', filters.startDate);
          }
          if (filters.endDate) {
            attendanceQuery = attendanceQuery.lte('class_date', filters.endDate);
          }

          const { data: attendanceData } = await attendanceQuery;

          const relevantAttendance = attendanceData?.filter(att => {
            if (!enrollmentDate) return true;
            return extractDatePart(att.class_date) >= enrollmentDate;
          }) || [];

          classesAttended = relevantAttendance.filter(a => a.present).length;
          
          const uniqueClasses = new Set(relevantAttendance.map(a => a.class_number));
          totalClassesConsidered = uniqueClasses.size;

          frequencyValue = totalClassesConsidered > 0 
            ? (classesAttended / totalClassesConsidered) * 100 
            : 0;
          frequency = `${frequencyValue.toFixed(1)}%`;
          
          if (relevantAttendance.length > 0) {
            const dates = relevantAttendance.map(a => a.class_date);
            const mostRecent = getMostRecentDate(dates);
            ultimoAcesso = mostRecent ? formatDateBR(mostRecent) : '-';
          }

          // Situação para Videoconferência
          situacao = classesAttended > 0 ? 'FREQUENTE' : 'INCOMPLETO';

        } else {
          // EAD - NOVA LÓGICA com campo is_frequente
          const { data: accessData } = await supabase
            .from('ead_access')
            .select('*')
            .eq('class_id', cls.id)
            .eq('student_id', cs.student_id)
            .maybeSingle();

          // Status manual de frequência
          isFrequente = accessData?.is_frequente === true;

          const allAccesses = [
            accessData?.access_date_1,
            accessData?.access_date_2,
            accessData?.access_date_3,
          ];

          accessDates = allAccesses.filter(date => date !== null) as string[];
          
          // Filtrar por período se necessário
          let filteredAccesses = [...accessDates];
          
          if (filters.startDate || filters.endDate) {
            const start = filters.startDate ? new Date(filters.startDate) : null;
            const end = filters.endDate ? new Date(filters.endDate) : null;

            filteredAccesses = filteredAccesses.filter(date => {
              const accessDate = new Date(date);
              if (start && accessDate < start) return false;
              if (end && accessDate > end) return false;
              return true;
            });
          }

          totalAccesses = filteredAccesses.length;
          classesAttended = totalAccesses;
          totalClassesConsidered = 3; // Total possível de acessos
          frequencyValue = (totalAccesses / 3) * 100;
          frequency = `${frequencyValue.toFixed(1)}%`;
          
          // Encontrar a data mais recente
          if (filteredAccesses.length > 0) {
            const mostRecent = getMostRecentDate(filteredAccesses);
            ultimoAcesso = mostRecent ? formatDateBR(mostRecent) : '-';
          }

          // ✅ REGRA CORRETA PARA EAD:
          // FREQUENTE se is_frequente = true (independente da quantidade de acessos)
          // INCOMPLETO se is_frequente = false
          situacao = isFrequente ? 'FREQUENTE' : 'INCOMPLETO';
        }

        const reportItem: ReportData = {
          unitName,
          studentName: cs.students?.full_name || 'Nome não informado',
          studentCpf: cs.students?.cpf || '',
          className: cls.name,
          cycleName: cls.cycles?.name || 'Sem ciclo',
          modality: cls.modality === 'VIDEOCONFERENCIA' ? 'Videoconferência' : 'EAD 24h',
          classesAttended,
          totalClassesConsidered,
          ultimoAcesso,
          frequency,
          frequencyValue,
          situacao,
          totalAccesses,
          isFrequente: cls.modality === 'EAD' ? isFrequente : undefined,
          accessDates: cls.modality === 'EAD' ? accessDates : undefined,
          enrollmentDate: enrollmentDate || undefined,
          enrollmentType,
        };

        allReportData.push(reportItem);
      }
    }

    // Aplicar filtro de situação
    let filteredData = allReportData;
    if (filters.situacao !== 'all') {
      filteredData = allReportData.filter(d => 
        d.situacao === (filters.situacao === 'frequentes' ? 'FREQUENTE' : 'INCOMPLETO')
      );
    }

    // Ordenar por situação (frequentes primeiro) e depois por nome
    filteredData.sort((a, b) => {
      if (a.situacao !== b.situacao) {
        return a.situacao === 'FREQUENTE' ? -1 : 1;
      }
      return a.studentName.localeCompare(b.studentName);
    });

    setReportData(filteredData);

    // Calcular estatísticas
    const stats = {
      totalStudents: filteredData.length,
      frequentes: filteredData.filter(d => d.situacao === 'FREQUENTE').length,
      incompletos: filteredData.filter(d => d.situacao === 'INCOMPLETO').length,
      totalEAD: filteredData.filter(d => d.modality.includes('EAD')).length,
      totalVideoconferencia: filteredData.filter(d => d.modality.includes('Videoconferência')).length,
    };

    setStats(stats);
    setLoading(false);
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const exportToXLSX = () => {
    if (reportData.length === 0) return;

    const headers = [
      'UNIDADE', 'ALUNO', 'CPF', 'TURMA', 'CICLO', 'MODALIDADE', 
      'TIPO MATRÍCULA', 'DATA MATRÍCULA',
      'AULAS/ACESSOS', 'ÚLTIMO ACESSO', 'FREQUÊNCIA', 'STATUS MANUAL (EAD)', 'SITUAÇÃO'
    ];

    const rows = reportData.map((row) => [
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
        ? (row.isFrequente ? '✅ FREQUENTE (manual)' : '❌ NÃO FREQUENTE (manual)')
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

  const exportToPDF = async () => {
    if (!reportRef.current || reportData.length === 0) return;

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
      for (let i = startRow; i < endRow && i < reportData.length; i++) {
        const row = reportData[i];
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
    const totalPages = Math.ceil(reportData.length / rowsPerPage);

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
      pdf.text('Frequentes', margin + 55, yPos + 5);
      pdf.setFontSize(10);
      pdf.text(stats.frequentes.toString(), margin + 55, yPos + 11);
      
      pdf.setFillColor(239, 68, 68);
      pdf.roundedRect(margin + 100, yPos, 40, 14, 2, 2, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(8);
      pdf.text('Incompletos', margin + 105, yPos + 5);
      pdf.setFontSize(10);
      pdf.text(stats.incompletos.toString(), margin + 105, yPos + 11);

      // Informação adicional sobre EAD
      pdf.setTextColor(100, 116, 139);
      pdf.setFontSize(8);
      pdf.text(`EAD: ${stats.totalEAD} | VC: ${stats.totalVideoconferencia}`, margin + 150, yPos + 8);

      yPos += 20;

      const tableStartY = yPos;
      const startRow = page * rowsPerPage;
      const endRow = Math.min(startRow + rowsPerPage, reportData.length);
      
      if (startRow < reportData.length) {
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
        `Página ${page + 1} de ${totalPages} • Total de registros: ${reportData.length}`,
        pageWidth / 2,
        pageHeight - 5,
        { align: 'center' }
      );
    }

    pdf.save(`relatorio_academico_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const frequentesPercentage = stats.totalStudents > 0
    ? (stats.frequentes / stats.totalStudents) * 100
    : 0;
  const incompletosPercentage = stats.totalStudents > 0
    ? (stats.incompletos / stats.totalStudents) * 100
    : 0;

  return (
    <div className="space-y-6" ref={reportRef}>
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <img src={logoImg} alt="Logo" className="h-10 w-auto" />
          <h2 className="text-xl font-semibold text-slate-800">Relatório Acadêmico</h2>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setIsSyntheticModalOpen(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
          >
            <FileBarChart className="w-5 h-5" />
            <span>Relatório Sintético</span>
          </button>
          <button
            onClick={exportToXLSX}
            disabled={reportData.length === 0 || loading}
            className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FileSpreadsheet className="w-5 h-5" />
            <span>Exportar XLSX</span>
          </button>
          <button
            onClick={exportToPDF}
            disabled={reportData.length === 0 || loading}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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

      <div className="bg-white border border-slate-200 rounded-lg p-6">
        <div className="flex items-center space-x-2 mb-4">
          <Filter className="w-5 h-5 text-slate-600" />
          <h3 className="font-semibold text-slate-800">Filtros</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
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
            <label className="block text-sm font-medium text-slate-700 mb-2">Unidade</label>
            <select
              value={filters.unitId}
              onChange={(e) => handleFilterChange('unitId', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            >
              <option value="">Todas</option>
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name} - {unit.municipality}
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
                  {cls.name} ({cls.day_of_week} {cls.class_time})
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
              value={filters.situacao}
              onChange={(e) => handleFilterChange('situacao', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
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

          <div className="md:col-span-2">
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

      {/* Cards de Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-600 font-medium">Total de Alunos</p>
          <p className="text-2xl font-bold text-blue-700">{stats.totalStudents}</p>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-sm text-green-600 font-medium">Frequentes</p>
          <p className="text-2xl font-bold text-green-700">{stats.frequentes}</p>
        </div>

        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-600 font-medium">Incompletos</p>
          <p className="text-2xl font-bold text-red-700">{stats.incompletos}</p>
        </div>

        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <p className="text-sm text-purple-600 font-medium">EAD</p>
          <p className="text-2xl font-bold text-purple-700">{stats.totalEAD}</p>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <p className="text-sm text-amber-600 font-medium">Videoconferência</p>
          <p className="text-2xl font-bold text-amber-700">{stats.totalVideoconferencia}</p>
        </div>
      </div>

      {/* Barra de distribuição */}
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
          {stats.totalStudents > 0 ? (
            <>
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
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-sm text-slate-500">
              {loading ? 'Carregando...' : 'Sem dados para exibir'}
            </div>
          )}
        </div>
      </div>

      {/* Tabela de Resultados */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-800 text-white">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">
                  UNIDADE
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">
                  ALUNO
                </th>
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
              {reportData.map((row, index) => (
                <tr key={index} className={`hover:bg-slate-50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                  <td className="px-4 py-2 text-sm text-slate-700">{row.unitName}</td>
                  <td className="px-4 py-2 text-sm font-medium text-slate-800">{row.studentName}</td>
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
                  <td className="px-4 py-2 text-sm text-center font-medium">{row.frequency}</td>
                  <td className="px-4 py-2 text-sm text-center">
                    {row.modality.includes('EAD') ? (
                      <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                        row.isFrequente 
                          ? 'bg-green-100 text-green-800 border border-green-300' 
                          : 'bg-slate-100 text-slate-600 border border-slate-300'
                      }`}>
                        {row.isFrequente ? '✅ FREQUENTE' : '⚪ NÃO FREQUENTE'}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-sm text-center">
                    <span className={`inline-flex px-3 py-1 rounded-full text-xs font-bold ${
                      row.situacao === 'FREQUENTE' 
                        ? 'bg-green-500 text-white shadow-md' 
                        : 'bg-red-500 text-white shadow-md'
                    }`}>
                      {row.situacao}
                    </span>
                  </td>
                </tr>
              ))}
              {reportData.length === 0 && !loading && (
                <tr>
                  <td colSpan={11} className="px-6 py-12 text-center text-slate-500">
                    Nenhum dado encontrado com os filtros selecionados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Rodapé com informações adicionais */}
      {reportData.length > 0 && (
        <div className="text-xs text-slate-500 text-right">
          Total de registros: {reportData.length} • 
          Frequentes: {stats.frequentes} • 
          Incompletos: {stats.incompletos} • 
          EAD: {stats.totalEAD} • 
          VC: {stats.totalVideoconferencia}
        </div>
      )}
    </div>
  );
}
