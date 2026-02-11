import { useState, useEffect, useRef } from 'react';
import { Filter, FileSpreadsheet, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

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
  }, [filters]);

  const loadUnits = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('units')
      .select('id, name')
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
      .select('id, name')
      .eq('user_id', user.id)
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
      .eq('user_id', user.id)
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
      .select('*, courses(name, modality)')
      .eq('user_id', user.id);

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

        // Obter nome da unidade
        let unitName = 'Não informado';
        if (cs.students.unit_id) {
          const unit = units.find(u => u.id === cs.students.unit_id);
          if (unit) {
            unitName = unit.name;
          } else if (cs.students.units) {
            // Se já veio com join
            unitName = cs.students.units.name || 'Não informado';
          }
        }

        if (cls.modality === 'VIDEOCONFERENCIA') {
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

          const attendedCount = attendanceData?.length || 0;
          const percentage = (attendedCount / cls.total_classes) * 100;

          allReportData.push({
            studentName: cs.students.full_name,
            unitName: unitName,
            courseName: cls.courses.name,
            className: cls.name,
            classesTotal: cls.total_classes,
            classesAttended: attendedCount,
            attendancePercentage: percentage,
            status: percentage >= 60 ? 'Frequente' : 'Ausente',
          });
        } else {
          const { data: accessData } = await supabase
            .from('ead_access')
            .select('*')
            .eq('class_id', cls.id)
            .eq('student_id', cs.student_id)
            .maybeSingle();

          let accesses = [
            accessData?.access_date_1,
            accessData?.access_date_2,
            accessData?.access_date_3,
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
            studentName: cs.students.full_name,
            unitName: unitName,
            courseName: cls.courses.name,
            className: cls.name,
            lastAccesses: accesses.map((d) =>
              d ? new Date(d).toLocaleDateString('pt-BR') : ''
            ),
            status: accesses.length > 0 ? 'Frequente' : 'Ausente',
          });
        }
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
    const headers = ['Unidade', 'Nome do Aluno', 'Turma', 'Curso'];

    if (reportData[0]?.classesTotal !== undefined) {
      headers.push('Aulas Ministradas', 'Aulas Assistidas', 'Frequência (%)', 'Situação');
    } else {
      headers.push('Últimos Acessos', 'Situação');
    }

    const rows = reportData.map((row) => {
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
    if (!reportRef.current) return;

    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    });

    const pageHeight = pdf.internal.pageSize.getHeight();
    const pageWidth = pdf.internal.pageSize.getWidth();

    const headerHeight = 40;
    const title = 'Relatório de Frequência';
    const date = new Date().toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });

    pdf.setFontSize(18);
    pdf.text(title, pageWidth / 2, 15, { align: 'center' });

    pdf.setFontSize(10);
    pdf.text(`Gerado em: ${date}`, pageWidth / 2, 22, { align: 'center' });

    pdf.setFontSize(9);
    let yPos = 30;
    if (filters.cycleId) {
      const cycle = cycles.find(c => c.id === filters.cycleId);
      pdf.text(`Ciclo: ${cycle?.name || 'Todos'}`, 15, yPos);
      yPos += 5;
    }
    if (filters.classId) {
      const cls = classes.find(c => c.id === filters.classId);
      pdf.text(`Turma: ${cls?.name || 'Todas'}`, 15, yPos);
      yPos += 5;
    }
    pdf.text(`Total de Alunos: ${stats.totalStudents} | Frequentes: ${stats.presentCount} | Ausentes: ${stats.absentCount}`, 15, yPos);

    const tableElement = reportRef.current.querySelector('table');
    if (tableElement) {
      const canvas = await html2canvas(tableElement, {
        scale: 2,
        useCORS: true,
        logging: false,
      });

      const imgData = canvas.toDataURL('image/png');
      const imgWidth = pageWidth - 20;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = headerHeight;

      pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
      heightLeft -= (pageHeight - position - 10);

      while (heightLeft > 0) {
        position = heightLeft - imgHeight + 10;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
        heightLeft -= (pageHeight - 10);
      }
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
                  className="bg-green-500 h-full flex items-center justify-center text-white text-xs font-medium"
                  style={{ width: `${presentPercentage}%` }}
                >
                  {presentPercentage > 10 && `${presentPercentage.toFixed(0)}%`}
                </div>
                <div
                  className="bg-red-500 h-full flex items-center justify-center text-white text-xs font-medium"
                  style={{ width: `${absentPercentage}%` }}
                >
                  {absentPercentage > 10 && `${absentPercentage.toFixed(0)}%`}
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
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">
                  Unidade
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">
                  Nome do Aluno
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">
                  Turma
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">
                  Curso
                </th>
                {reportData[0]?.classesTotal !== undefined ? (
                  <>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">
                      Aulas Ministradas
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">
                      Aulas Assistidas
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">
                      Frequência
                    </th>
                  </>
                ) : (
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">
                    Últimos Acessos
                  </th>
                )}
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">
                  Situação
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {reportData.map((row, index) => (
                <tr key={index} className="hover:bg-slate-50">
                  <td className="px-6 py-4 text-sm text-slate-700">{row.unitName}</td>
                  <td className="px-6 py-4 text-sm text-slate-800">{row.studentName}</td>
                  <td className="px-6 py-4 text-sm text-slate-700">{row.className}</td>
                  <td className="px-6 py-4 text-sm text-slate-700">{row.courseName}</td>
                  {row.classesTotal !== undefined ? (
                    <>
                      <td className="px-6 py-4 text-sm text-slate-700">{row.classesTotal}</td>
                      <td className="px-6 py-4 text-sm text-slate-700">{row.classesAttended}</td>
                      <td className="px-6 py-4 text-sm text-slate-700 font-medium">
                        {row.attendancePercentage?.toFixed(1)}%
                      </td>
                    </>
                  ) : (
                    <td className="px-6 py-4 text-sm text-slate-700">
                      {row.lastAccesses?.length ? row.lastAccesses.join(', ') : '-'}
                    </td>
                  )}
                  <td className="px-6 py-4">
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
              ))}
              {reportData.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-slate-500">
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
