import { useState, useEffect, useRef } from 'react';
import { Filter, FileSpreadsheet, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import logoImg from '../../assets/image.png';

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

interface Course {
  id: string;
  name: string;
  modality: string;
  teacher_name: string;
}

interface Class {
  id: string;
  name: string;
  day_of_week: string;
  class_time: string;
  total_classes: number;
  modality: string;
  course: Course;
  cycle: Cycle;
}

interface Student {
  id: string;
  full_name: string;
  cpf: string;
  unit_id: string;
  unit?: Unit;
}

interface Attendance {
  class_id: string;
  student_id: string;
  present: boolean;
  class_date: string;
  class_number: number;
}

interface EadAccess {
  access_date_1: string | null;
  access_date_2: string | null;
  access_date_3: string | null;
}

interface ReportData {
  unitName: string;
  studentName: string;
  studentCpf: string;
  className: string;
  modality: string;
  classesAttended: number;
  accesses: string;
  frequency: string;
  frequencyValue: number;
  status: 'Frequente' | 'Ausente';
  totalClasses: number;
}

export function ReportsTab() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [reportData, setReportData] = useState<ReportData[]>([]);
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

  const [stats, setStats] = useState({
    totalStudents: 0,
    presentCount: 0,
    absentCount: 0,
  });

  useEffect(() => {
    if (user) {
      loadUnits();
      loadCycles();
      loadClasses();
      loadCourses();
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
      .eq('user_id', user.id)
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
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('start_date', { ascending: false });

    if (error) {
      console.error('Error loading cycles:', error);
      return;
    }

    setCycles(data || []);
  };

  const loadCourses = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('courses')
      .select('id, name, modality, teacher_name')
      .eq('user_id', user.id);

    if (error) {
      console.error('Error loading courses:', error);
      return;
    }

    setCourses(data || []);
  };

  const loadClasses = async () => {
    if (!user) return;

    let query = supabase
      .from('classes')
      .select(`
        id, 
        name, 
        day_of_week, 
        class_time, 
        total_classes, 
        modality,
        course:courses (
          id,
          name,
          modality,
          teacher_name
        ),
        cycle:cycles (
          id,
          name,
          start_date,
          end_date
        )
      `)
      .eq('user_id', user.id)
      .eq('status', 'active');

    if (filters.cycleId) {
      query = query.eq('cycle_id', filters.cycleId);
    }

    if (filters.modality !== 'all') {
      query = query.eq('modality', filters.modality);
    }

    const { data, error } = await query.order('name');

    if (error) {
      console.error('Error loading classes:', error);
      return;
    }

    setClasses(data || []);
  };

  const generateReport = async () => {
    if (!user) return;

    // Recarregar classes com os filtros atuais
    await loadClasses();

    const allReportData: ReportData[] = [];

    for (const cls of classes) {
      // Buscar alunos da turma
      let classStudentsQuery = supabase
        .from('class_students')
        .select(`
          id,
          student_id,
          enrollment_type,
          current_status,
          students:students (
            id,
            full_name,
            cpf,
            unit_id
          )
        `)
        .eq('class_id', cls.id);

      const { data: classStudents, error: studentsError } = await classStudentsQuery;

      if (studentsError || !classStudents) {
        console.error('Error loading class students:', studentsError);
        continue;
      }

      for (const cs of classStudents) {
        const student = cs.students as any;

        // Filtrar por unidade
        if (filters.unitId && student.unit_id !== filters.unitId) {
          continue;
        }

        // Filtrar por nome do aluno
        if (filters.studentName && !student.full_name.toLowerCase().includes(filters.studentName.toLowerCase())) {
          continue;
        }

        // Buscar nome da unidade
        let unitName = 'Não informado';
        if (student.unit_id) {
          const unit = units.find(u => u.id === student.unit_id);
          unitName = unit ? unit.name : 'Não informado';
        }

        let classesAttended = 0;
        let accessesArray: string[] = [];
        let frequency = '';
        let frequencyValue = 0;
        let status: 'Frequente' | 'Ausente' = 'Ausente';

        if (cls.modality === 'VIDEOCONFERENCIA') {
          // Buscar attendance para videoconferência
          let attendanceQuery = supabase
            .from('attendance')
            .select('class_date, class_number, present')
            .eq('class_id', cls.id)
            .eq('student_id', student.id)
            .eq('present', true);

          if (filters.startDate) {
            attendanceQuery = attendanceQuery.gte('class_date', filters.startDate);
          }

          if (filters.endDate) {
            attendanceQuery = attendanceQuery.lte('class_date', filters.endDate);
          }

          const { data: attendanceData } = await attendanceQuery;

          classesAttended = attendanceData?.length || 0;

          // Calcular total de aulas no período
          let totalClassesInPeriod = cls.total_classes;
          if (filters.startDate && filters.endDate) {
            const { data: totalClassesData } = await supabase
              .from('attendance')
              .select('class_number')
              .eq('class_id', cls.id)
              .gte('class_date', filters.startDate)
              .lte('class_date', filters.endDate)
              .order('class_number');

            if (totalClassesData) {
              const uniqueClasses = new Set(totalClassesData.map(a => a.class_number));
              totalClassesInPeriod = uniqueClasses.size;
            }
          }

          frequencyValue = totalClassesInPeriod > 0 ? (classesAttended / totalClassesInPeriod) * 100 : 0;
          frequency = `${frequencyValue.toFixed(1)}%`;
          status = frequencyValue >= 60 ? 'Frequente' : 'Ausente';
        } else {
          // Buscar acessos EAD
          const { data: accessData } = await supabase
            .from('ead_access')
            .select('access_date_1, access_date_2, access_date_3')
            .eq('class_id', cls.id)
            .eq('student_id', student.id)
            .maybeSingle();

          // Array com as datas de acesso
          const allAccesses = [
            accessData?.access_date_1,
            accessData?.access_date_2,
            accessData?.access_date_3,
          ];

          // Filtrar acessos por período se necessário
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
          
          // Calcular frequência baseada nos 3 acessos possíveis
          frequencyValue = (classesAttended / 3) * 100;
          frequency = `${frequencyValue.toFixed(1)}%`;
          status = frequencyValue >= 60 ? 'Frequente' : 'Ausente';
        }

        allReportData.push({
          unitName,
          studentName: student.full_name,
          studentCpf: student.cpf,
          className: cls.name,
          modality: cls.modality === 'VIDEOCONFERENCIA' ? 'Videoconferência' : 'EAD 24h',
          classesAttended,
          accesses: accessesArray.length > 0 ? accessesArray.join(', ') : '-',
          frequency,
          frequencyValue,
          status,
          totalClasses: cls.total_classes,
        });
      }
    }

    setReportData(allReportData);

    const presentCount = allReportData.filter((d) => d.status === 'Frequente').length;
    const absentCount = allReportData.filter((d) => d.status === 'Ausente').length;

    setStats({
      totalStudents: allReportData.length,
      presentCount,
      absentCount,
    });
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const exportToXLSX = () => {
    if (reportData.length === 0) return;

    const headers = ['UNIDADE', 'ALUNO', 'CPF', 'TURMA', 'MODALIDADE', 'AULAS ASSISTIDAS', 'ACESSOS', 'FREQUENCIA', 'STATUS'];

    const rows = reportData.map((row) => [
      row.unitName,
      row.studentName,
      row.studentCpf,
      row.className,
      row.modality,
      row.classesAttended.toString(),
      row.accesses,
      row.frequency,
      row.status,
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

      // Cabeçalho da tabela
      const thead = document.createElement('thead');
      const headerRow = document.createElement('tr');
      
      const headers = ['UNIDADE', 'ALUNO', 'TURMA', 'MODALIDADE', 'AULAS', 'ACESSOS', 'FREQ.'];

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

      // Corpo da tabela
      const tbody = document.createElement('tbody');
      for (let i = startRow; i < endRow && i < reportData.length; i++) {
        const row = reportData[i];
        const tr = document.createElement('tr');
        
        const cells = [
          row.unitName,
          row.studentName,
          row.className,
          row.modality,
          row.classesAttended.toString(),
          row.accesses,
          row.frequency,
        ];

        cells.forEach((cellText, idx) => {
          const td = document.createElement('td');
          td.textContent = cellText;
          td.style.padding = '5px 4px';
          td.style.border = '1px solid #cbd5e1';
          td.style.fontSize = '8px';
          td.style.backgroundColor = i % 2 === 0 ? '#ffffff' : '#f8fafc';
          
          // Alinhar números ao centro
          if (idx >= 4) {
            td.style.textAlign = 'center';
          }
          
          tr.appendChild(td);
        });
        
        tbody.appendChild(tr);
      }
      tableElement.appendChild(tbody);

      return tableElement;
    };

    // Calcular número de linhas por página (aproximadamente 20 linhas por página para dar espaço à barra)
    const rowsPerPage = 20;
    const totalPages = Math.ceil(reportData.length / rowsPerPage);

    for (let page = 0; page < totalPages; page++) {
      if (page > 0) {
        pdf.addPage();
      }

      // Adicionar logo
      try {
        pdf.addImage(logoImg, 'PNG', margin, margin, 25, 10);
      } catch (e) {
        console.warn('Logo não pôde ser carregada');
      }

      // Título do relatório
      pdf.setFontSize(16);
      pdf.setTextColor(30, 41, 59);
      pdf.setFont('helvetica', 'bold');
      pdf.text('RELATÓRIO ACADÊMICO', pageWidth / 2, margin + 12, { align: 'center' });

      // Subtítulo com data
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(71, 85, 105);
      pdf.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, pageWidth / 2, margin + 18, { align: 'center' });

      // Linha separadora
      pdf.setDrawColor(203, 213, 225);
      pdf.line(margin, margin + 20, pageWidth - margin, margin + 20);

      // Informações dos filtros
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
      
      if (filters.studentName) {
        filterInfo.push(`Busca: ${filters.studentName}`);
      }

      pdf.text(filterInfo.join(' • ') || 'Todos os filtros', margin, yPos);

      // Estatísticas em todas as páginas
      yPos += 8;
      
      // Cards de estatísticas
      pdf.setFillColor(59, 130, 246);
      pdf.setDrawColor(37, 99, 235);
      pdf.roundedRect(margin, yPos, 45, 14, 2, 2, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'normal');
      pdf.text('Total', margin + 5, yPos + 5);
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.text(stats.totalStudents.toString(), margin + 5, yPos + 11);
      
      pdf.setFillColor(34, 197, 94);
      pdf.setDrawColor(22, 163, 74);
      pdf.roundedRect(margin + 55, yPos, 45, 14, 2, 2, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'normal');
      pdf.text('Frequentes', margin + 60, yPos + 5);
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.text(stats.presentCount.toString(), margin + 60, yPos + 11);
      
      pdf.setFillColor(239, 68, 68);
      pdf.setDrawColor(220, 38, 38);
      pdf.roundedRect(margin + 110, yPos, 45, 14, 2, 2, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'normal');
      pdf.text('Ausentes', margin + 115, yPos + 5);
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.text(stats.absentCount.toString(), margin + 115, yPos + 11);

      // BARRA DE DISTRIBUIÇÃO DE FREQUÊNCIA
      yPos += 20;
      
      // Título da barra
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(30, 41, 59);
      pdf.text('DISTRIBUIÇÃO DE FREQUÊNCIA', margin, yPos);
      
      // Legendas da barra
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(34, 197, 94);
      pdf.text(`Frequentes: ${stats.presentCount} (${presentPercentage.toFixed(1)}%)`, margin, yPos + 4);
      
      pdf.setTextColor(239, 68, 68);
      pdf.text(`Ausentes: ${stats.absentCount} (${absentPercentage.toFixed(1)}%)`, margin + 80, yPos + 4);
      
      // Fundo da barra (cinza claro)
      yPos += 8;
      const barHeight = 10;
      pdf.setFillColor(226, 232, 240);
      pdf.roundedRect(margin, yPos, contentWidth, barHeight, 3, 3, 'F');
      
      // Desenhar barras proporcionais
      if (stats.totalStudents > 0) {
        const presentWidth = (presentPercentage / 100) * contentWidth;
        const absentWidth = (absentPercentage / 100) * contentWidth;
        
        // Barra de frequentes (verde)
        if (presentWidth > 0) {
          pdf.setFillColor(34, 197, 94);
          pdf.roundedRect(margin, yPos, presentWidth, barHeight, 3, 3, 'F');
          
          // Adicionar porcentagem na barra se houver espaço
          if (presentWidth > 20) {
            pdf.setTextColor(255, 255, 255);
            pdf.setFontSize(7);
            pdf.setFont('helvetica', 'bold');
            pdf.text(`${presentPercentage.toFixed(0)}%`, margin + 5, yPos + 7);
          }
        }
        
        // Barra de ausentes (vermelha)
        if (absentWidth > 0) {
          pdf.setFillColor(239, 68, 68);
          pdf.roundedRect(margin + presentWidth, yPos, absentWidth, barHeight, 3, 3, 'F');
          
          // Adicionar porcentagem na barra se houver espaço
          if (absentWidth > 20) {
            pdf.setTextColor(255, 255, 255);
            pdf.setFontSize(7);
            pdf.setFont('helvetica', 'bold');
            pdf.text(`${absentPercentage.toFixed(0)}%`, margin + presentWidth + 5, yPos + 7);
          }
        }
      }

      // Posição inicial da tabela
      const tableStartY = yPos + barHeight + 10;

      // Criar elemento da tabela para esta página
      const startRow = page * rowsPerPage;
      const endRow = Math.min(startRow + rowsPerPage, reportData.length);
      
      if (startRow < reportData.length) {
        const tableElement = createTableElement(startRow, endRow);
        
        // Container temporário
        const tempDiv = document.createElement('div');
        tempDiv.style.position = 'absolute';
        tempDiv.style.left = '-9999px';
        tempDiv.style.top = '0';
        tempDiv.style.width = `${contentWidth * 3.78}px`;
        tempDiv.appendChild(tableElement);
        document.body.appendChild(tempDiv);

        // Renderizar tabela
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

      // Adicionar rodapé com numeração de página
      pdf.setFontSize(8);
      pdf.setTextColor(148, 163, 184);
      pdf.text(
        `Página ${page + 1} de ${totalPages} • Total de registros: ${reportData.length}`,
        pageWidth / 2,
        pageHeight - 5,
        { align: 'center' }
      );
    }

    // Salvar PDF
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
            onClick={exportToXLSX}
            disabled={reportData.length === 0}
            className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FileSpreadsheet className="w-5 h-5" />
            <span>Exportar XLSX</span>
          </button>
          <button
            onClick={exportToPDF}
            disabled={reportData.length === 0}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FileText className="w-5 h-5" />
            <span>Gerar PDF</span>
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
            <label className="block text-sm font-medium text-slate-700 mb-2">Unidade</label>
            <select
              value={filters.unitId}
              onChange={(e) => handleFilterChange('unitId', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
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
            <label className="block text-sm font-medium text-slate-700 mb-2">Turma</label>
            <select
              value={filters.classId}
              onChange={(e) => handleFilterChange('classId', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            >
              <option value="">Todas as turmas</option>
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name} - {cls.course?.name} ({cls.day_of_week} {cls.class_time})
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
            <label className="block text-sm font-medium text-slate-700 mb-2">Buscar Aluno</label>
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

        {/* BARRA DE DISTRIBUIÇÃO DE FREQUÊNCIA */}
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-slate-700">Distribuição de Frequência</h4>
            <div className="flex space-x-4 text-xs">
              <span className="text-green-600">Frequentes: {stats.presentCount} ({presentPercentage.toFixed(1)}%)</span>
              <span className="text-red-600">Ausentes: {stats.absentCount} ({absentPercentage.toFixed(1)}%)</span>
            </div>
          </div>
          
          {/* Container da barra */}
          <div className="w-full h-10 bg-slate-200 rounded-lg overflow-hidden flex shadow-inner">
            {stats.totalStudents > 0 ? (
              <>
                {/* Barra de Frequentes */}
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
                
                {/* Barra de Ausentes */}
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
                Sem dados para exibir
              </div>
            )}
          </div>
          
          {/* Marcadores visuais */}
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
                  MODALIDADE
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">
                  AULAS
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">
                  ACESSOS
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">
                  FREQ.
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">
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
                  <td className="px-4 py-2 text-sm text-slate-700">{row.modality}</td>
                  <td className="px-4 py-2 text-sm text-center text-slate-700">{row.classesAttended}</td>
                  <td className="px-4 py-2 text-sm text-center text-slate-700">{row.accesses}</td>
                  <td className="px-4 py-2 text-sm text-center text-slate-700">{row.frequency}</td>
                  <td className="px-4 py-2 text-sm">
                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                      row.status === 'Frequente' 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))}
              {reportData.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
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
