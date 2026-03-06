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

// Interface atualizada com SITUAÇÃO em vez de STATUS
interface ReportData {
  unitName: string;
  studentName: string;
  studentCpf: string;
  className: string;
  cycleName: string;
  cycleStatus: 'active' | 'closed';
  modality: string;
  classesAttended: number;
  totalClassesConsidered: number;
  accesses: string;
  frequency: string;
  frequencyValue: number;
  situacao: {
    label: string;
    color: string;
    bgColor: string;
    icon: string;
  };
  totalAccesses: number;
  missingAccesses: number;
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
    frequentes: 0,
    aprovados: 0,
    reprovados: 0,
    semAcessos: 0,
    emAndamento: 0,
  });

  // Função auxiliar para extrair data
  const extractDatePart = (dateStr: string | null | undefined): string | null => {
    if (!dateStr) return null;
    return dateStr.split('T')[0];
  };

  // Função para determinar a situação do aluno EAD
  const getEADSituacao = (
    totalAccesses: number,
    cycleStatus: 'active' | 'closed',
    cycleEndDate: string
  ) => {
    const today = new Date().toISOString().split('T')[0];
    const isCycleActive = cycleStatus === 'active' && today <= cycleEndDate;

    // Se o ciclo ainda está ativo
    if (isCycleActive) {
      if (totalAccesses === 0) {
        return {
          label: 'Sem Acessos',
          color: 'text-slate-700',
          bgColor: 'bg-slate-100',
          icon: '📝'
        };
      } else if (totalAccesses === 1) {
        return {
          label: '1º Acesso',
          color: 'text-blue-700',
          bgColor: 'bg-blue-100',
          icon: '🔵'
        };
      } else if (totalAccesses === 2) {
        return {
          label: '2º Acesso',
          color: 'text-indigo-700',
          bgColor: 'bg-indigo-100',
          icon: '🟣'
        };
      } else if (totalAccesses === 3) {
        return {
          label: '3º Acesso (Completo)',
          color: 'text-green-700',
          bgColor: 'bg-green-100',
          icon: '✅'
        };
      }
    }

    // Se o ciclo está encerrado
    if (totalAccesses === 3) {
      return {
        label: 'Aprovado',
        color: 'text-green-700',
        bgColor: 'bg-green-100',
        icon: '✅'
      };
    } else {
      return {
        label: `Reprovado (${totalAccesses}/3)`,
        color: 'text-red-700',
        bgColor: 'bg-red-100',
        icon: '❌'
      };
    }
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
        let accessesArray: string[] = [];
        let frequency = '';
        let frequencyValue = 0;
        let situacao = {
          label: '',
          color: '',
          bgColor: '',
          icon: ''
        };
        let totalAccesses = 0;
        let missingAccesses = 0;

        const enrollmentDate = extractDatePart(cs.enrollment_date);
        const cycleStatus = cls.cycles?.status || 'active';
        const cycleEndDate = cls.cycles?.end_date || '';

        if (cls.modality === 'VIDEOCONFERENCIA') {
          // Lógica para Videoconferência (mantida)
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
          
          // Situação para Videoconferência
          if (totalClassesConsidered === 0) {
            situacao = {
              label: 'Sem Registro',
              color: 'text-slate-700',
              bgColor: 'bg-slate-100',
              icon: '📝'
            };
          } else if (frequencyValue >= 60) {
            situacao = {
              label: 'Frequente',
              color: 'text-green-700',
              bgColor: 'bg-green-100',
              icon: '✅'
            };
          } else {
            situacao = {
              label: 'Ausente',
              color: 'text-red-700',
              bgColor: 'bg-red-100',
              icon: '❌'
            };
          }

        } else {
          // EAD - NOVA LÓGICA
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

          // Filtrar por período se necessário
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

          totalAccesses = accessesArray.length;
          missingAccesses = 3 - totalAccesses;
          classesAttended = totalAccesses;
          totalClassesConsidered = 3;
          frequencyValue = (totalAccesses / 3) * 100;
          frequency = `${frequencyValue.toFixed(1)}%`;
          
          // Determinar situação com base na nova regra
          situacao = getEADSituacao(totalAccesses, cycleStatus, cycleEndDate);
        }

        allReportData.push({
          unitName,
          studentName: cs.students?.full_name || 'Nome não informado',
          studentCpf: cs.students?.cpf || '',
          className: cls.name,
          cycleName: cls.cycles?.name || 'Sem ciclo',
          cycleStatus: cls.cycles?.status || 'active',
          modality: cls.modality === 'VIDEOCONFERENCIA' ? 'Videoconferência' : 'EAD 24h',
          classesAttended,
          totalClassesConsidered,
          accesses: accessesArray.length > 0 ? accessesArray.join(', ') : '-',
          frequency,
          frequencyValue,
          situacao,
          totalAccesses,
          missingAccesses,
        });
      }
    }

    // Ordenar por situação e depois por nome
    allReportData.sort((a, b) => {
      // Primeiro por status do ciclo (ativos primeiro)
      if (a.cycleStatus !== b.cycleStatus) {
        return a.cycleStatus === 'active' ? -1 : 1;
      }
      // Depois por situação
      const situacaoOrder = {
        '✅': 1,
        '🔵': 2,
        '🟣': 3,
        '📝': 4,
        '❌': 5
      };
      const orderA = situacaoOrder[a.situacao.icon as keyof typeof situacaoOrder] || 99;
      const orderB = situacaoOrder[b.situacao.icon as keyof typeof situacaoOrder] || 99;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      // Por fim por nome
      return a.studentName.localeCompare(b.studentName);
    });

    setReportData(allReportData);

    // Calcular estatísticas
    const stats = {
      totalStudents: allReportData.length,
      frequentes: allReportData.filter(d => d.situacao.icon === '✅' || d.situacao.icon === '🔵' || d.situacao.icon === '🟣').length,
      aprovados: allReportData.filter(d => d.situacao.label === 'Aprovado').length,
      reprovados: allReportData.filter(d => d.situacao.label.includes('Reprovado')).length,
      semAcessos: allReportData.filter(d => d.situacao.label === 'Sem Acessos').length,
      emAndamento: allReportData.filter(d => d.cycleStatus === 'active' && d.totalAccesses > 0 && d.totalAccesses < 3).length,
    };

    setStats(stats);
    setLoading(false);
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const exportToXLSX = () => {
    if (reportData.length === 0) return;

    const headers = ['UNIDADE', 'ALUNO', 'CPF', 'TURMA', 'CICLO', 'STATUS CICLO', 'MODALIDADE', 
      'AULAS/ACESSOS', 'TOTAL CONSIDERADO', 'DATAS', 'FREQUÊNCIA', 'SITUAÇÃO', 'DETALHES'];

    const rows = reportData.map((row) => [
      row.unitName,
      row.studentName,
      row.studentCpf,
      row.className,
      row.cycleName,
      row.cycleStatus === 'active' ? 'Ativo' : 'Encerrado',
      row.modality,
      row.classesAttended.toString(),
      row.totalClassesConsidered.toString(),
      row.accesses,
      row.frequency,
      `${row.situacao.icon} ${row.situacao.label}`,
      row.modality.includes('EAD') && row.cycleStatus === 'active' 
        ? `${row.totalAccesses}/3 acessos - Faltam ${row.missingAccesses}`
        : '',
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
      tableElement.style.fontSize = '9px';
      tableElement.style.fontFamily = 'Arial, sans-serif';

      const thead = document.createElement('thead');
      const headerRow = document.createElement('tr');
      
      const headers = ['UNIDADE', 'ALUNO', 'TURMA', 'CICLO', 'MODALIDADE', 'AULAS', 'SITUAÇÃO'];

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
          row.modality.includes('EAD') ? `${row.totalAccesses}/3` : `${row.classesAttended}/${row.totalClassesConsidered}`,
          `${row.situacao.icon} ${row.situacao.label}`,
        ];

        cells.forEach((cellText, idx) => {
          const td = document.createElement('td');
          td.textContent = cellText;
          td.style.padding = '5px 4px';
          td.style.border = '1px solid #cbd5e1';
          td.style.fontSize = '8px';
          td.style.backgroundColor = i % 2 === 0 ? '#ffffff' : '#f8fafc';
          
          // Cor de fundo baseada na situação (última coluna)
          if (idx === 6) {
            td.style.backgroundColor = row.situacao.bgColor;
            td.style.color = row.situacao.color;
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
      if (selectedCycle) filterInfo.push(`Ciclo: ${selectedCycle.name} (${selectedCycle.status === 'active' ? 'Ativo' : 'Encerrado'})`);
      
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
      pdf.roundedRect(margin, yPos, 35, 14, 2, 2, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(8);
      pdf.text('Total', margin + 5, yPos + 5);
      pdf.setFontSize(10);
      pdf.text(stats.totalStudents.toString(), margin + 5, yPos + 11);
      
      pdf.setFillColor(34, 197, 94);
      pdf.roundedRect(margin + 45, yPos, 35, 14, 2, 2, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(8);
      pdf.text('Aprovados', margin + 48, yPos + 5);
      pdf.setFontSize(10);
      pdf.text(stats.aprovados.toString(), margin + 48, yPos + 11);
      
      pdf.setFillColor(239, 68, 68);
      pdf.roundedRect(margin + 90, yPos, 35, 14, 2, 2, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(8);
      pdf.text('Reprovados', margin + 93, yPos + 5);
      pdf.setFontSize(10);
      pdf.text(stats.reprovados.toString(), margin + 93, yPos + 11);

      pdf.setFillColor(100, 116, 139);
      pdf.roundedRect(margin + 135, yPos, 40, 14, 2, 2, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(8);
      pdf.text('Em Andamento', margin + 138, yPos + 5);
      pdf.setFontSize(10);
      pdf.text(stats.emAndamento.toString(), margin + 138, yPos + 11);

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
                  {cycle.name} - {cycle.status === 'active' ? 'Ativo' : 'Encerrado'}
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

      {/* Cards de Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-600 font-medium">Total de Alunos</p>
          <p className="text-2xl font-bold text-blue-700">{stats.totalStudents}</p>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-sm text-green-600 font-medium">Aprovados (EAD)</p>
          <p className="text-2xl font-bold text-green-700">{stats.aprovados}</p>
        </div>

        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-600 font-medium">Reprovados (EAD)</p>
          <p className="text-2xl font-bold text-red-700">{stats.reprovados}</p>
        </div>

        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
          <p className="text-sm text-indigo-600 font-medium">Em Andamento</p>
          <p className="text-2xl font-bold text-indigo-700">{stats.emAndamento}</p>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
          <p className="text-sm text-slate-600 font-medium">Sem Acessos</p>
          <p className="text-2xl font-bold text-slate-700">{stats.semAcessos}</p>
        </div>
      </div>

      {/* Legenda de Situações */}
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-slate-700 mb-2">Legenda de Situações - EAD</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <div className="flex items-center space-x-2">
            <span className="w-4 h-4 bg-green-100 rounded-full flex items-center justify-center text-green-700">✅</span>
            <span className="text-slate-600">Aprovado (3 acessos) - Ciclo encerrado</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="w-4 h-4 bg-green-100 rounded-full flex items-center justify-center text-green-700">✅</span>
            <span className="text-slate-600">3º Acesso - Ciclo ativo</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="w-4 h-4 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700">🟣</span>
            <span className="text-slate-600">2º Acesso - Ciclo ativo</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="w-4 h-4 bg-blue-100 rounded-full flex items-center justify-center text-blue-700">🔵</span>
            <span className="text-slate-600">1º Acesso - Ciclo ativo</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="w-4 h-4 bg-slate-100 rounded-full flex items-center justify-center text-slate-700">📝</span>
            <span className="text-slate-600">Sem acessos - Ciclo ativo</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="w-4 h-4 bg-red-100 rounded-full flex items-center justify-center text-red-700">❌</span>
            <span className="text-slate-600">Reprovado (menos de 3) - Ciclo encerrado</span>
          </div>
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
                  STATUS CICLO
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">
                  MODALIDADE
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider">
                  AULAS/ACESSOS
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider">
                  DATAS
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider">
                  FREQ.
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
                  <td className="px-4 py-2 text-sm">
                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                      row.cycleStatus === 'active' 
                        ? 'bg-green-100 text-green-700' 
                        : 'bg-slate-100 text-slate-700'
                    }`}>
                      {row.cycleStatus === 'active' ? 'Ativo' : 'Encerrado'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-sm text-slate-700">{row.modality}</td>
                  <td className="px-4 py-2 text-sm text-center font-medium">
                    {row.modality.includes('EAD') 
                      ? `${row.totalAccesses}/3` 
                      : `${row.classesAttended}/${row.totalClassesConsidered}`}
                  </td>
                  <td className="px-4 py-2 text-sm text-center text-slate-600 max-w-[200px] truncate" title={row.accesses}>
                    {row.accesses}
                  </td>
                  <td className="px-4 py-2 text-sm text-center font-medium">{row.frequency}</td>
                  <td className="px-4 py-2 text-sm text-center">
                    <div className="flex flex-col items-center">
                      <span className={`inline-flex items-center space-x-1 px-3 py-1 rounded-full text-xs font-bold ${row.situacao.bgColor} ${row.situacao.color}`}>
                        <span>{row.situacao.icon}</span>
                        <span>{row.situacao.label}</span>
                      </span>
                      {row.modality.includes('EAD') && row.cycleStatus === 'active' && row.missingAccesses > 0 && (
                        <span className="text-xs text-amber-600 mt-1">
                          Faltam {row.missingAccesses} acesso(s)
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {reportData.length === 0 && !loading && (
                <tr>
                  <td colSpan={10} className="px-6 py-12 text-center text-slate-500">
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
