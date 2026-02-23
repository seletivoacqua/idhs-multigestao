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
  unitName: string;
  studentName: string;
  courseName: string;
  modality: string;               // NOVO
  classesAttended: number;         // AULAS ASSISTIDAS (sempre presente)
  accesses: string;                // ACESSOS (formatado como string)
  frequency: string;               // FREQUENCIA (ex: "75%", "Sim/Não", etc.)
  status: 'Frequente' | 'Ausente'; // mantido para consistência
}

export function ReportsTab() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
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
    loadUnits();
    loadCycles();
    loadClasses();
  }, []);

  useEffect(() => {
    if (user) {
      generateReport();
    }
  }, [filters, user]);

  const loadUnits = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('units')
      .select('id, name')
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
      .select('id, name')
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
      .select('id, name')
      .order('name');

    if (error) {
      console.error('Error loading classes:', error);
      return;
    }

    setClasses(data || []);
  };

  const generateReport = async () => {
    if (!user) return;

    let classesQuery = supabase
      .from('classes')
      .select('*, courses(name, modality)');

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
      return;
    }

    const allReportData: ReportData[] = [];

    for (const cls of classes || []) {
      const { data: classStudents } = await supabase
        .from('class_students')
        .select('*, students(full_name, unit_id, units(name))')
        .eq('class_id', cls.id);

      if (!classStudents) continue;

      for (const cs of classStudents) {
        if (filters.unitId && cs.students.unit_id !== filters.unitId) {
          continue;
        }

        if (filters.studentName && !cs.students.full_name.toLowerCase().includes(filters.studentName.toLowerCase())) {
          continue;
        }

        let unitName = 'Não informado';
        if (cs.students.unit_id) {
          const unit = units.find(u => u.id === cs.students.unit_id);
          if (unit) {
            unitName = unit.name;
          } else if (cs.students.units) {
            unitName = cs.students.units.name || 'Não informado';
          }
        }

        // Inicializa variáveis
        let classesAttended = 0;
        let accessesArray: string[] = [];
        let frequency = '';
        let status: 'Frequente' | 'Ausente' = 'Ausente';

        if (cls.modality === 'VIDEOCONFERENCIA') {
          // Busca attendance
          let attendanceQuery = supabase
            .from('attendance')
            .select('*')
            .eq('class_id', cls.id)
            .eq('student_id', cs.student_id)
            .eq('present', true);

          if (filters.startDate) {
            attendanceQuery = attendanceQuery.gte('class_date', filters.startDate);
          }

          if (filters.endDate) {
            attendanceQuery = attendanceQuery.lte('class_date', filters.endDate);
          }

          const { data: attendanceData } = await attendanceQuery;

          classesAttended = attendanceData?.length || 0;
          const percentage = cls.total_classes > 0 ? (classesAttended / cls.total_classes) * 100 : 0;
          frequency = `${percentage.toFixed(1)}%`;
          status = percentage >= 60 ? 'Frequente' : 'Ausente';

          // Para videoconferência, acessos não se aplicam (ou poderiam ser opcionais)
          accessesArray = [];
        } else {
          // EAD – busca acessos
          const { data: accessData } = await supabase
            .from('ead_access')
            .select('*')
            .eq('class_id', cls.id)
            .eq('student_id', cs.student_id)
            .maybeSingle();

          accessesArray = [
            accessData?.access_date_1,
            accessData?.access_date_2,
            accessData?.access_date_3,
          ].filter(Boolean).map((d) =>
            d ? new Date(d).toLocaleDateString('pt-BR') : ''
          );

          if (filters.startDate || filters.endDate) {
            accessesArray = accessesArray.filter((d) => {
              if (!d) return false;
              const accessDate = new Date(d.split('/').reverse().join('-')); // converte de volta para Date
              if (filters.startDate && accessDate < new Date(filters.startDate)) return false;
              if (filters.endDate && accessDate > new Date(filters.endDate)) return false;
              return true;
            });
          }

          // Para EAD, consideramos que o aluno é frequente se tiver pelo menos um acesso no período
          classesAttended = accessesArray.length; // opcional, pode ser tratado como "acessos realizados"
          frequency = accessesArray.length > 0 ? 'Sim' : 'Não'; // ou outra lógica
          status = accessesArray.length > 0 ? 'Frequente' : 'Ausente';
        }

        allReportData.push({
          unitName,
          studentName: cs.students.full_name,
          courseName: cls.courses.name,
          modality: cls.modality === 'VIDEOCONFERENCIA' ? 'Videoconferência' : 'EAD 24h',
          classesAttended,
          accesses: accessesArray.length > 0 ? accessesArray.join(', ') : '-',
          frequency,
          status,
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

  const exportToXLSX = () => {
    if (reportData.length === 0) return;

    const headers = ['UNIDADE', 'ALUNO', 'CURSO', 'MODALIDADE', 'AULAS ASSISTIDAS', 'ACESSOS', 'FREQUENCIA'];

    const rows = reportData.map((row) => [
      row.unitName,
      row.studentName,
      row.courseName,
      row.modality,
      row.classesAttended.toString(),
      row.accesses,
      row.frequency,
    ]);

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

    // Criar elemento para a barra de progresso
    const createProgressBar = () => {
      const progressDiv = document.createElement('div');
      progressDiv.style.width = '100%';
      progressDiv.style.height = '30px';
      progressDiv.style.backgroundColor = '#e2e8f0';
      progressDiv.style.borderRadius = '8px';
      progressDiv.style.overflow = 'hidden';
      progressDiv.style.display = 'flex';
      progressDiv.style.marginTop = '10px';
      progressDiv.style.marginBottom = '20px';

      if (stats.totalStudents > 0) {
        const presentBar = document.createElement('div');
        presentBar.style.width = `${presentPercentage}%`;
        presentBar.style.height = '100%';
        presentBar.style.backgroundColor = '#22c55e';
        presentBar.style.display = 'flex';
        presentBar.style.alignItems = 'center';
        presentBar.style.justifyContent = 'center';
        presentBar.style.color = 'white';
        presentBar.style.fontSize = '12px';
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
        absentBar.style.fontSize = '12px';
        absentBar.style.fontWeight = 'bold';
        absentBar.textContent = absentPercentage > 8 ? `${absentPercentage.toFixed(0)}%` : '';

        progressDiv.appendChild(presentBar);
        progressDiv.appendChild(absentBar);
      }

      return progressDiv;
    };

    // Criar tabela com os dados
    const tableElement = document.createElement('table');
    tableElement.style.width = '100%';
    tableElement.style.borderCollapse = 'collapse';
    tableElement.style.fontSize = '10px';
    tableElement.style.fontFamily = 'Arial, sans-serif';

    // Cabeçalho da tabela
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    
    const headers = ['UNIDADE', 'ALUNO', 'CURSO', 'MODALIDADE', 'AULAS ASSISTIDAS', 'ACESSOS', 'FREQUENCIA'];

    headers.forEach(headerText => {
      const th = document.createElement('th');
      th.textContent = headerText;
      th.style.padding = '8px 4px';
      th.style.backgroundColor = '#f1f5f9';
      th.style.border = '1px solid #e2e8f0';
      th.style.textAlign = 'left';
      th.style.fontWeight = 'bold';
      th.style.fontSize = '10px';
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    tableElement.appendChild(thead);

    // Corpo da tabela
    const tbody = document.createElement('tbody');
    reportData.forEach(row => {
      const tr = document.createElement('tr');
      
      const cells = [
        row.unitName,
        row.studentName,
        row.courseName,
        row.modality,
        row.classesAttended.toString(),
        row.accesses,
        row.frequency,
      ];

      cells.forEach(cellText => {
        const td = document.createElement('td');
        td.textContent = cellText;
        td.style.padding = '6px 4px';
        td.style.border = '1px solid #e2e8f0';
        td.style.fontSize = '9px';
        
        // Opcional: destaque para status
        tr.appendChild(td);
      });
      
      tbody.appendChild(tr);
    });
    tableElement.appendChild(tbody);

    // Container para a página atual
    const pageContainer = document.createElement('div');
    pageContainer.style.position = 'absolute';
    pageContainer.style.left = '-9999px';
    pageContainer.style.top = '0';
    pageContainer.style.width = `${contentWidth * 3.78}px`;
    
    // Adicionar título da seção de estatísticas
    const statsTitle = document.createElement('h3');
    statsTitle.textContent = 'Distribuição de Frequência';
    statsTitle.style.fontSize = '14px';
    statsTitle.style.fontWeight = 'bold';
    statsTitle.style.marginBottom = '10px';
    statsTitle.style.color = '#1e293b';
    
    // Adicionar texto com percentuais
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
    
    // Criar barra de progresso
    const progressBar = createProgressBar();
    
    // Adicionar elementos ao container
    pageContainer.appendChild(statsTitle);
    pageContainer.appendChild(statsText);
    pageContainer.appendChild(progressBar);
    pageContainer.appendChild(tableElement);
    
    document.body.appendChild(pageContainer);

    try {
      // Renderizar container completo para medir altura
      const canvas = await html2canvas(pageContainer, {
        scale: 2,
        logging: false,
        backgroundColor: '#ffffff',
      });

      const imgHeight = (canvas.height * contentWidth) / canvas.width;
      const availableHeight = pageHeight - 50; // Espaço para cabeçalho e rodapé
      
      // Calcular número de páginas necessárias
      const totalPages = Math.ceil(imgHeight / availableHeight);
      
      // Altura aproximada de cada linha da tabela
      const tableStartY = 95; // Posição Y onde a tabela começa (após cabeçalho e barra)
      const rowHeight = 8; // Altura aproximada de cada linha em mm

      for (let page = 0; page < totalPages; page++) {
        if (page > 0) {
          pdf.addPage();
        }

        // Adicionar cabeçalho do relatório
        pdf.addImage(logoImg, 'PNG', (pageWidth - 20) / 2, 5, 20, 15);
        
        pdf.setFontSize(16);
        pdf.setTextColor(30, 41, 59);
        pdf.text('Relatório de Frequência e Acessos', pageWidth / 2, 25, { align: 'center' });
        
        pdf.setFontSize(10);
        pdf.setTextColor(71, 85, 105);
        pdf.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, pageWidth / 2, 32, { align: 'center' });

        // Informações dos filtros
        pdf.setFontSize(8);
        let yFilter = 38;
        
        if (filters.cycleId) {
          const cycle = cycles.find(c => c.id === filters.cycleId);
          pdf.text(`Ciclo: ${cycle?.name || 'Todos'}`, margin, yFilter);
        }
        
        if (filters.classId) {
          const cls = classes.find(c => c.id === filters.classId);
          pdf.text(`Turma: ${cls?.name || 'Todas'}`, margin + 60, yFilter);
        }
        
        pdf.text(`Total: ${stats.totalStudents} alunos`, margin + 120, yFilter);

        // Adicionar estatísticas e barra de progresso na primeira página apenas
        if (page === 0) {
          pdf.setFontSize(12);
          pdf.setTextColor(30, 41, 59);
          pdf.text('Distribuição de Frequência', margin, 48);
          
          pdf.setFontSize(10);
          pdf.setTextColor(71, 85, 105);
          pdf.text(`Frequentes: ${stats.presentCount} alunos (${presentPercentage.toFixed(1)}%)`, margin, 55);
          pdf.text(`Ausentes: ${stats.absentCount} alunos (${absentPercentage.toFixed(1)}%)`, margin + 80, 55);
          
          // Desenhar barra de progresso
          const barY = 60;
          const barHeight = 8;
          const barWidth = contentWidth;
          
          // Fundo da barra
          pdf.setFillColor(226, 232, 240);
          pdf.roundedRect(margin, barY, barWidth, barHeight, 2, 2, 'F');
          
          if (stats.totalStudents > 0) {
            // Barra de frequentes
            const presentWidth = (presentPercentage / 100) * barWidth;
            if (presentWidth > 0) {
              pdf.setFillColor(34, 197, 94);
              pdf.roundedRect(margin, barY, presentWidth, barHeight, 2, 2, 'F');
              
              // Texto da porcentagem na barra
              if (presentPercentage > 8) {
                pdf.setTextColor(255, 255, 255);
                pdf.setFontSize(8);
                pdf.setFont('helvetica', 'bold');
                pdf.text(`${presentPercentage.toFixed(0)}%`, margin + 5, barY + 5.5);
              }
            }
            
            // Barra de ausentes
            const absentWidth = (absentPercentage / 100) * barWidth;
            if (absentWidth > 0) {
              pdf.setFillColor(239, 68, 68);
              pdf.roundedRect(margin + presentWidth, barY, absentWidth, barHeight, 2, 2, 'F');
              
              // Texto da porcentagem na barra
              if (absentPercentage > 8) {
                pdf.setTextColor(255, 255, 255);
                pdf.setFontSize(8);
                pdf.setFont('helvetica', 'bold');
                pdf.text(`${absentPercentage.toFixed(0)}%`, margin + presentWidth + 5, barY + 5.5);
              }
            }
          }
        }

        // Criar tabela apenas para a página atual
        const startRow = page * Math.floor((availableHeight - (page === 0 ? 25 : 0)) / rowHeight);
        const endRow = Math.min(startRow + Math.floor((availableHeight - (page === 0 ? 25 : 0)) / rowHeight), reportData.length);
        
        if (startRow < reportData.length) {
          const pageTable = document.createElement('table');
          pageTable.style.width = '100%';
          pageTable.style.borderCollapse = 'collapse';
          pageTable.style.fontSize = '9px';
          
          // Adicionar cabeçalho
          const pageThead = document.createElement('thead');
          const pageHeaderRow = headerRow.cloneNode(true);
          pageThead.appendChild(pageHeaderRow);
          pageTable.appendChild(pageThead);
          
          // Adicionar linhas da página
          const pageTbody = document.createElement('tbody');
          for (let i = startRow; i < endRow; i++) {
            const row = tbody.children[i - startRow]?.cloneNode(true);
            if (row) {
              pageTbody.appendChild(row);
            }
          }
          pageTable.appendChild(pageTbody);

          // Renderizar tabela da página
          const tempDiv = document.createElement('div');
          tempDiv.style.position = 'absolute';
          tempDiv.style.left = '-9999px';
          tempDiv.style.top = '0';
          tempDiv.style.width = `${contentWidth * 3.78}px`;
          tempDiv.appendChild(pageTable);
          document.body.appendChild(tempDiv);

          const tableCanvas = await html2canvas(pageTable, {
            scale: 2,
            logging: false,
            backgroundColor: '#ffffff',
          });

          const tableImgData = tableCanvas.toDataURL('image/png');
          const tableImgHeight = (tableCanvas.height * contentWidth) / tableCanvas.width;
          
          // Posicionar tabela na página
          const tableY = page === 0 ? 75 : 45;
          pdf.addImage(tableImgData, 'PNG', margin, tableY, contentWidth, tableImgHeight);

          document.body.removeChild(tempDiv);
        }
      }
    } finally {
      document.body.removeChild(pageContainer);
    }

    pdf.save(`relatorio_${new Date().toISOString().split('T')[0]}.pdf`);
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
        <h2 className="text-xl font-semibold text-slate-800">Relatórios</h2>
        <div className="flex gap-3">
          <button
            onClick={exportToXLSX}
            disabled={reportData.length === 0}
            className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title={reportData.length === 0 ? "Não há dados para exportar" : "Exportar para Excel"}
          >
            <FileSpreadsheet className="w-5 h-5" />
            <span>Exportar XLSX</span>
          </button>
          <button
            onClick={exportToPDF}
            disabled={reportData.length === 0}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title={reportData.length === 0 ? "Não há dados para gerar PDF" : "Gerar PDF"}
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Ciclo</label>
            <select
              value={filters.cycleId}
              onChange={(e) => setFilters({ ...filters, cycleId: e.target.value })}
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
              onChange={(e) => setFilters({ ...filters, classId: e.target.value })}
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
              onChange={(e) => setFilters({ ...filters, unitId: e.target.value })}
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
              onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Data Fim</label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Modalidade</label>
            <select
              value={filters.modality}
              onChange={(e) => setFilters({ ...filters, modality: e.target.value })}
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
              onChange={(e) => setFilters({ ...filters, studentName: e.target.value })}
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
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  UNIDADE
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  ALUNO
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  CURSO
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  MODALIDADE
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  AULAS ASSISTIDAS
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  ACESSOS
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  FREQUENCIA
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {reportData.map((row, index) => (
                <tr key={index} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-3 text-sm text-slate-700">{row.unitName}</td>
                  <td className="px-6 py-3 text-sm font-medium text-slate-800">{row.studentName}</td>
                  <td className="px-6 py-3 text-sm text-slate-700">{row.courseName}</td>
                  <td className="px-6 py-3 text-sm text-slate-700">{row.modality}</td>
                  <td className="px-6 py-3 text-sm text-slate-700">{row.classesAttended}</td>
                  <td className="px-6 py-3 text-sm text-slate-700">{row.accesses}</td>
                  <td className="px-6 py-3 text-sm text-slate-700">{row.frequency}</td>
                </tr>
              ))}
              {reportData.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
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
