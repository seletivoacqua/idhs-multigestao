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
  unitName: string;
  studentName: string;
  studentCpf: string;
  className: string;
  cycleName: string;
  modality: string;
  classesAttended: number;
  totalClassesConsidered: number;
  accesses: string;
  frequency: string;
  frequencyValue: number;
  status: 'Frequente' | 'Ausente';
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
  });
  const { user } = useAuth();
  const reportRef = useRef<HTMLDivElement>(null);
  const [isSyntheticModalOpen, setIsSyntheticModalOpen] = useState(false);

  const [stats, setStats] = useState({
    totalStudents: 0,
    presentCount: 0,
    absentCount: 0,
  });

  // Função auxiliar para extrair data
  const extractDatePart = (dateStr: string | null | undefined): string | null => {
    if (!dateStr) return null;
    return dateStr.split('T')[0];
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
      .select('id, name, start_date, end_date')
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
          end_date
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
        let accessesArray: string[] = [];
        let frequency = '';
        let frequencyValue = 0;
        let status: 'Frequente' | 'Ausente' = 'Ausente';

        const enrollmentDate = extractDatePart(cs.enrollment_date);

        if (cls.modality === 'VIDEOCONFERENCIA') {
          // 🔥 NOVO: Buscar attendance considerando matrícula excepcional
          let attendanceQuery = supabase
            .from('attendance')
            .select('*')
            .eq('class_id', cls.id)
            .eq('student_id', cs.student_id);

          // Aplicar filtro de período se necessário
          if (filters.startDate) {
            attendanceQuery = attendanceQuery.gte('class_date', filters.startDate);
          }
          if (filters.endDate) {
            attendanceQuery = attendanceQuery.lte('class_date', filters.endDate);
          }

          const { data: attendanceData } = await attendanceQuery;

          // Filtrar apenas aulas após a matrícula
          const relevantAttendance = attendanceData?.filter(att => {
            if (!enrollmentDate) return true;
            return extractDatePart(att.class_date) >= enrollmentDate;
          }) || [];

          // Contar presenças
          classesAttended = relevantAttendance.filter(a => a.present).length;
          
          // Total de aulas consideradas (após matrícula)
          const uniqueClasses = new Set(relevantAttendance.map(a => a.class_number));
          totalClassesConsidered = uniqueClasses.size;

          // Calcular frequência baseada nas aulas consideradas
          frequencyValue = totalClassesConsidered > 0 
            ? (classesAttended / totalClassesConsidered) * 100 
            : 0;
          frequency = `${frequencyValue.toFixed(1)}%`;
          
          // Status baseado na frequência
          status = frequencyValue >= 60 ? 'Frequente' : 'Ausente';

        } else {
          // EAD - manter como está
          const { data: accessData } = await supabase
            .from('ead_access')
            .select('*')
            .eq('class_id', cls.id)
            .eq('student_id', cs.student_id)
            .maybeSingle();

          const allAccesses = [
            accessData?.access_date_1,
            accessData?.access_date_2,
            accessData?.access_date_3,
          ];

          if (filters.startDate || filters.endDate) {
            const start = filters.startDate ? new Date(filters.startDate) : null;
            const end = filters.endDate ? new Date(filters.endDate) : null;

            accessesArray = allAccesses
              .filter(date => date !== null)
              .filter(date => {
                const accessDate = new Date(date);
                if (start && accessDate < start) return false;
                if (end && accessDate > end) return false;
                return true;
              })
              .map(date => new Date(date).toLocaleDateString('pt-BR'));
          } else {
            accessesArray = allAccesses
              .filter(date => date !== null)
              .map(date => new Date(date).toLocaleDateString('pt-BR'));
          }

          classesAttended = accessesArray.length;
          totalClassesConsidered = 3; // EAD sempre considera 3 acessos possíveis
          frequencyValue = (classesAttended / 3) * 100;
          frequency = `${frequencyValue.toFixed(1)}%`;
          status = frequencyValue >= 60 ? 'Frequente' : 'Ausente';
        }

        allReportData.push({
          unitName,
          studentName: cs.students?.full_name || 'Nome não informado',
          studentCpf: cs.students?.cpf || '',
          className: cls.name,
          cycleName: cls.cycles?.name || 'Sem ciclo',
          modality: cls.modality === 'VIDEOCONFERENCIA' ? 'Videoconferência' : 'EAD 24h',
          classesAttended,
          totalClassesConsidered,
          accesses: accessesArray.length > 0 ? accessesArray.join(', ') : '-',
          frequency,
          frequencyValue,
          status,
        });
      }
    }

    // Ordenar por status (frequentes primeiro) e depois por nome
    allReportData.sort((a, b) => {
      if (a.status === b.status) {
        return a.studentName.localeCompare(b.studentName);
      }
      return a.status === 'Frequente' ? -1 : 1;
    });

    setReportData(allReportData);

    const presentCount = allReportData.filter((d) => d.status === 'Frequente').length;
    const absentCount = allReportData.filter((d) => d.status === 'Ausente').length;

    setStats({
      totalStudents: allReportData.length,
      presentCount,
      absentCount,
    });

    setLoading(false);
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const exportToXLSX = () => {
    if (reportData.length === 0) return;

    const headers = ['UNIDADE', 'ALUNO', 'CPF', 'TURMA', 'CICLO', 'MODALIDADE', 
      'AULAS ASSISTIDAS', 'AULAS CONSIDERADAS', 'ACESSOS', 'FREQUÊNCIA', 'STATUS'];

    const rows = reportData.map((row) => [
      row.unitName,
      row.studentName,
      row.studentCpf,
      row.className,
      row.cycleName,
      row.modality,
      row.classesAttended.toString(),
      row.totalClassesConsidered.toString(),
      row.accesses,
      row.frequency,
      row.status,
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

    const presentPercentage = stats.totalStudents > 0
      ? (stats.presentCount / stats.totalStudents) * 100
      : 0;
    const absentPercentage = stats.totalStudents > 0
      ? (stats.absentCount / stats.totalStudents) * 100
      : 0;

    // Criar elemento para a tabela
    const createTableElement = (startRow: number, endRow: number) => {
      const tableElement = document.createElement('table');
      tableElement.style.width = '100%';
      tableElement.style.borderCollapse = 'collapse';
      tableElement.style.fontSize = '9px';
      tableElement.style.fontFamily = 'Arial, sans-serif';

      const thead = document.createElement('thead');
      const headerRow = document.createElement('tr');
      
      const headers = ['UNIDADE', 'ALUNO', 'TURMA', 'CICLO', 'MODALIDADE', 'AULAS', 'ACESSOS', 'FREQ.', 'STATUS'];

      headers.forEach(headerText => {
        const th = document.createElement('th');
        th.textContent = headerText;
        th.style.padding = '6px 4px';
        th.style.backgroundColor = '#1e293b';
        th.style.color = 'white';
        th.style.border = '1px solid #334155';
        th.style.textAlign = 'left';
        th.style.fontWeight = 'bold';
        th.style.fontSize = '9px';
        headerRow.appendChild(th);
      });
      thead.appendChild(headerRow);
      tableElement.appendChild(thead);

      const tbody = document.createElement('tbody');
      for (let i = startRow; i < endRow && i < reportData.length; i++) {
        const row = reportData[i];
        const tr = document.createElement('tr');
        
        const cells = [
          row.unitName,
          row.studentName,
          row.className,
          row.cycleName,
          row.modality,
          row.classesAttended.toString(),
          row.accesses,
          row.frequency,
          row.status,
        ];

        cells.forEach((cellText, idx) => {
          const td = document.createElement('td');
          td.textContent = cellText;
          td.style.padding = '5px 4px';
          td.style.border = '1px solid #cbd5e1';
          td.style.fontSize = '8px';
          td.style.backgroundColor = i % 2 === 0 ? '#ffffff' : '#f8fafc';
          
          // Cor de fundo baseada no status
          if (idx === 8) { // Coluna STATUS
            td.style.backgroundColor = row.status === 'Frequente' ? '#dcfce7' : '#fee2e2';
            td.style.color = row.status === 'Frequente' ? '#166534' : '#991b1b';
            td.style.fontWeight = 'bold';
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
      
      // Cards de estatísticas com cores
      pdf.setFillColor(59, 130, 246);
      pdf.roundedRect(margin, yPos, 45, 14, 2, 2, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(8);
      pdf.text('Total', margin + 5, yPos + 5);
      pdf.setFontSize(10);
      pdf.text(stats.totalStudents.toString(), margin + 5, yPos + 11);
      
      pdf.setFillColor(34, 197, 94); // Verde para frequentes
      pdf.roundedRect(margin + 55, yPos, 45, 14, 2, 2, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(8);
      pdf.text('Frequentes', margin + 60, yPos + 5);
      pdf.setFontSize(10);
      pdf.text(stats.presentCount.toString(), margin + 60, yPos + 11);
      
      pdf.setFillColor(239, 68, 68); // Vermelho para ausentes
      pdf.roundedRect(margin + 110, yPos, 45, 14, 2, 2, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(8);
      pdf.text('Ausentes', margin + 115, yPos + 5);
      pdf.setFontSize(10);
      pdf.text(stats.absentCount.toString(), margin + 115, yPos + 11);

      yPos += 20;
      
      // Barra de distribuição
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(30, 41, 59);
      pdf.text('DISTRIBUIÇÃO DE FREQUÊNCIA', margin, yPos);
      
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(34, 197, 94);
      pdf.text(`Frequentes: ${stats.presentCount} (${presentPercentage.toFixed(1)}%)`, margin, yPos + 4);
      
      pdf.setTextColor(239, 68, 68);
      pdf.text(`Ausentes: ${stats.absentCount} (${absentPercentage.toFixed(1)}%)`, margin + 80, yPos + 4);
      
      yPos += 8;
      const barHeight = 10;
      pdf.setFillColor(226, 232, 240);
      pdf.roundedRect(margin, yPos, contentWidth, barHeight, 3, 3, 'F');
      
      if (stats.totalStudents > 0) {
        const presentWidth = (presentPercentage / 100) * contentWidth;
        const absentWidth = (absentPercentage / 100) * contentWidth;
        
        if (presentWidth > 0) {
          pdf.setFillColor(34, 197, 94);
          pdf.roundedRect(margin, yPos, presentWidth, barHeight, 3, 3, 'F');
          
          if (presentWidth > 20) {
            pdf.setTextColor(255, 255, 255);
            pdf.setFontSize(7);
            pdf.text(`${presentPercentage.toFixed(0)}%`, margin + 5, yPos + 7);
          }
        }
        
        if (absentWidth > 0) {
          pdf.setFillColor(239, 68, 68);
          pdf.roundedRect(margin + presentWidth, yPos, absentWidth, barHeight, 3, 3, 'F');
          
          if (absentWidth > 20) {
            pdf.setTextColor(255, 255, 255);
            pdf.setFontSize(7);
            pdf.text(`${absentPercentage.toFixed(0)}%`, margin + presentWidth + 5, yPos + 7);
          }
        }
      }

      const tableStartY = yPos + barHeight + 10;
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

  const presentPercentage = stats.totalStudents > 0
    ? (stats.presentCount / stats.totalStudents) * 100
    : 0;
  const absentPercentage = stats.totalStudents > 0
    ? (stats.absentCount / stats.totalStudents) * 100
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

      <div className="bg-white border border-slate-200 rounded-lg p-6">
        <h3 className="font-semibold text-slate-800 mb-4">Resumo Estatístico</h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-600 font-medium">Total de Alunos</p>
            <p className="text-2xl font-bold text-blue-700">{stats.totalStudents}</p>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-sm text-green-600 font-medium">Frequentes (≥60%)</p>
            <p className="text-2xl font-bold text-green-700">{stats.presentCount}</p>
          </div>

          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-600 font-medium">Ausentes (&lt;60%)</p>
            <p className="text-2xl font-bold text-red-700">{stats.absentCount}</p>
          </div>
        </div>

        {/* Barra de distribuição com cores */}
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-slate-700">Distribuição de Frequência</h4>
            <div className="flex space-x-4 text-xs">
              <span className="text-green-600 font-medium">Frequentes: {stats.presentCount} ({presentPercentage.toFixed(1)}%)</span>
              <span className="text-red-600 font-medium">Ausentes: {stats.absentCount} ({absentPercentage.toFixed(1)}%)</span>
            </div>
          </div>
          
          <div className="w-full h-10 bg-slate-200 rounded-lg overflow-hidden flex shadow-inner">
            {stats.totalStudents > 0 ? (
              <>
                <div
                  className="bg-green-500 h-full flex items-center justify-center text-white text-xs font-medium transition-all duration-500 ease-out"
                  style={{ width: `${presentPercentage}%` }}
                >
                  {presentPercentage > 8 && (
                    <span className="drop-shadow-md">
                      {presentPercentage.toFixed(0)}%
                    </span>
                  )}
                </div>
                
                <div
                  className="bg-red-500 h-full flex items-center justify-center text-white text-xs font-medium transition-all duration-500 ease-out"
                  style={{ width: `${absentPercentage}%` }}
                >
                  {absentPercentage > 8 && (
                    <span className="drop-shadow-md">
                      {absentPercentage.toFixed(0)}%
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
          
          <div className="flex justify-between mt-1 text-xs text-slate-400">
            <span>0%</span>
            <span>50%</span>
            <span>100%</span>
          </div>
        </div>
      </div>

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
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider">
                  AULAS
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider">
                  ACESSOS
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider">
                  FREQ.
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider">
                  STATUS
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
                  <td className="px-4 py-2 text-sm text-center text-slate-700">{row.classesAttended}</td>
                  <td className="px-4 py-2 text-sm text-center text-slate-700">{row.accesses}</td>
                  <td className="px-4 py-2 text-sm text-center font-medium">{row.frequency}</td>
                  <td className="px-4 py-2 text-sm text-center">
                    <span className={`inline-flex px-3 py-1 text-xs font-bold rounded-full ${
                      row.status === 'Frequente' 
                        ? 'bg-green-500 text-white shadow-md' 
                        : 'bg-red-500 text-white shadow-md'
                    }`}>
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))}
              {reportData.length === 0 && !loading && (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-slate-500">
                    Nenhum dado encontrado com os filtros selecionados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
