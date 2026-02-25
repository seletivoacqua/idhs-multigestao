import { useState, useEffect, useRef } from 'react';
import { X, FileSpreadsheet, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import logoImg from '../../assets/image.png';

interface SyntheticReportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Unit {
  id: string;
  name: string;
  municipality: string;
}

interface Course {
  id: string;
  name: string;
  modality: string;
}

interface EADReportData {
  studentName: string;
  courseName: string;
  access1: string;
  access2: string;
  access3: string;
  status: string;
}

interface VideoConferenceReportData {
  studentName: string;
  courseName: string;
  classesGiven: number;
  classesAttended: number;
  frequency: string;
}

export function SyntheticReportModal({ isOpen, onClose }: SyntheticReportModalProps) {
  const [units, setUnits] = useState<Unit[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [filteredCourses, setFilteredCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    unitId: '',
    modality: '',
    courseId: '',
  });
  const [eadData, setEadData] = useState<EADReportData[]>([]);
  const [videoData, setVideoData] = useState<VideoConferenceReportData[]>([]);
  const { user } = useAuth();
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user && isOpen) {
      loadUnits();
      loadCourses();
    }
  }, [user, isOpen]);

  useEffect(() => {
    if (filters.modality) {
      const filtered = courses.filter(c => c.modality === filters.modality);
      setFilteredCourses(filtered);
    } else {
      setFilteredCourses([]);
    }
  }, [filters.modality, courses]);

  const loadUnits = async () => {
    const { data } = await supabase
      .from('units')
      .select('id, name, municipality')
      .order('name');

    setUnits(data || []);
  };

  const loadCourses = async () => {
    const { data } = await supabase
      .from('courses')
      .select('id, name, modality')
      .order('name');

    setCourses(data || []);
  };

  const generateReport = async () => {
    if (!filters.modality || !filters.courseId) {
      alert('Selecione a modalidade e o curso para gerar o relatório');
      return;
    }

    setLoading(true);

    if (filters.modality === 'EAD') {
      await generateEADReport();
    } else if (filters.modality === 'VIDEOCONFERENCIA') {
      await generateVideoConferenceReport();
    }

    setLoading(false);
  };

  const generateEADReport = async () => {
    let classesQuery = supabase
      .from('classes')
      .select(`
        id,
        name,
        course_id,
        courses (
          id,
          name
        )
      `)
      .eq('modality', 'EAD')
      .eq('course_id', filters.courseId);

    const { data: classes } = await classesQuery;
    const reportData: EADReportData[] = [];

    for (const cls of classes || []) {
      const { data: classStudents } = await supabase
        .from('class_students')
        .select(`
          student_id,
          students (
            id,
            full_name,
            unit_id
          )
        `)
        .eq('class_id', cls.id);

      for (const cs of classStudents || []) {
        if (filters.unitId && cs.students?.unit_id !== filters.unitId) {
          continue;
        }

        const { data: accessData } = await supabase
          .from('ead_access')
          .select('*')
          .eq('class_id', cls.id)
          .eq('student_id', cs.student_id)
          .maybeSingle();

        const access1 = accessData?.access_date_1
          ? new Date(accessData.access_date_1).toLocaleDateString('pt-BR', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })
          : '';

        const access2 = accessData?.access_date_2
          ? new Date(accessData.access_date_2).toLocaleDateString('pt-BR', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })
          : '';

        const access3 = accessData?.access_date_3
          ? new Date(accessData.access_date_3).toLocaleDateString('pt-BR', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })
          : '';

        const accessCount = [access1, access2, access3].filter(a => a !== '').length;
        const status = accessCount >= 2 ? 'FREQUENTE' : 'AUSENTE';

        reportData.push({
          studentName: cs.students?.full_name || '',
          courseName: cls.courses?.name || '',
          access1,
          access2,
          access3,
          status,
        });
      }
    }

    setEadData(reportData);
    setVideoData([]);
  };

  const generateVideoConferenceReport = async () => {
    let classesQuery = supabase
      .from('classes')
      .select(`
        id,
        name,
        total_classes,
        course_id,
        courses (
          id,
          name
        )
      `)
      .eq('modality', 'VIDEOCONFERENCIA')
      .eq('course_id', filters.courseId);

    const { data: classes } = await classesQuery;
    const reportData: VideoConferenceReportData[] = [];

    for (const cls of classes || []) {
      const { data: classStudents } = await supabase
        .from('class_students')
        .select(`
          student_id,
          students (
            id,
            full_name,
            unit_id
          )
        `)
        .eq('class_id', cls.id);

      for (const cs of classStudents || []) {
        if (filters.unitId && cs.students?.unit_id !== filters.unitId) {
          continue;
        }

        const { data: attendanceData } = await supabase
          .from('attendance')
          .select('*')
          .eq('class_id', cls.id)
          .eq('student_id', cs.student_id)
          .eq('present', true);

        const classesAttended = attendanceData?.length || 0;
        const frequencyValue = cls.total_classes > 0
          ? (classesAttended / cls.total_classes) * 100
          : 0;

        reportData.push({
          studentName: cs.students?.full_name || '',
          courseName: cls.courses?.name || '',
          classesGiven: cls.total_classes,
          classesAttended,
          frequency: `${frequencyValue.toFixed(0)}%`,
        });
      }
    }

    setVideoData(reportData);
    setEadData([]);
  };

  const exportToXLSX = () => {
    if (filters.modality === 'EAD' && eadData.length > 0) {
      const headers = ['ALUNO', 'CURSO', 'ACESSO 1', 'ACESSO 2', 'ACESSO 3', 'SITUAÇÃO'];
      const rows = eadData.map((row) => [
        row.studentName,
        row.courseName,
        row.access1,
        row.access2,
        row.access3,
        row.status,
      ]);

      const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Relatório EAD');
      XLSX.writeFile(workbook, `relatorio_sintetico_ead_${new Date().toISOString().split('T')[0]}.xlsx`);
    } else if (filters.modality === 'VIDEOCONFERENCIA' && videoData.length > 0) {
      const headers = ['ALUNO', 'CURSO', 'AULAS MINISTRADAS', 'AULAS ASSISTIDAS', '% FREQUÊNCIA'];
      const rows = videoData.map((row) => [
        row.studentName,
        row.courseName,
        row.classesGiven,
        row.classesAttended,
        row.frequency,
      ]);

      const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Relatório Videoconferência');
      XLSX.writeFile(workbook, `relatorio_sintetico_video_${new Date().toISOString().split('T')[0]}.xlsx`);
    }
  };

  const exportToPDF = async () => {
    if (!reportRef.current) return;

    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const margin = 10;

    try {
      pdf.addImage(logoImg, 'PNG', margin, margin, 25, 10);
    } catch (e) {
      console.warn('Logo não pôde ser carregada');
    }

    pdf.setFontSize(18);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(30, 41, 59);

    if (filters.modality === 'EAD') {
      pdf.text('ACESSOS – PLATAFORMA EAD 24H', pageWidth / 2, margin + 12, { align: 'center' });
    } else {
      pdf.text('FREQUÊNCIA – PLATAFORMA DE VIDEOCONFERÊNCIA', pageWidth / 2, margin + 12, { align: 'center' });
    }

    const tableElement = document.createElement('table');
    tableElement.style.width = '100%';
    tableElement.style.borderCollapse = 'collapse';
    tableElement.style.fontSize = '11px';
    tableElement.style.fontFamily = 'Arial, sans-serif';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headerRow.style.backgroundColor = '#4A90E2';

    let headers: string[] = [];

    if (filters.modality === 'EAD') {
      headers = ['ALUNO', 'CURSO', 'ÚLTIMOS ACESSOS', '', '', 'SITUAÇÃO'];
    } else {
      headers = ['ALUNO', 'CURSO', 'AULAS MINISTRADAS', 'AULAS ASSISTIDAS', '% FREQUÊNCIA'];
    }

    headers.forEach(headerText => {
      const th = document.createElement('th');
      th.textContent = headerText;
      th.style.padding = '12px 8px';
      th.style.color = 'white';
      th.style.border = '1px solid #2563eb';
      th.style.textAlign = 'center';
      th.style.fontWeight = 'bold';
      th.style.fontSize = '11px';
      headerRow.appendChild(th);
    });

    thead.appendChild(headerRow);
    tableElement.appendChild(thead);

    const tbody = document.createElement('tbody');

    if (filters.modality === 'EAD') {
      eadData.forEach((row, index) => {
        const tr = document.createElement('tr');
        const bgColor = row.status === 'AUSENTE' ? '#FCA5A5' : row.status === 'FREQUENTE' ? '#86EFAC' : '#ffffff';
        tr.style.backgroundColor = bgColor;

        const cells = [
          row.studentName,
          row.courseName,
          row.access1,
          row.access2,
          row.access3,
          row.status,
        ];

        cells.forEach((cellText, idx) => {
          const td = document.createElement('td');
          td.textContent = cellText;
          td.style.padding = '10px 8px';
          td.style.border = '1px solid #cbd5e1';
          td.style.fontSize = '10px';
          td.style.textAlign = 'center';
          tr.appendChild(td);
        });

        tbody.appendChild(tr);
      });
    } else {
      videoData.forEach((row, index) => {
        const tr = document.createElement('tr');
        const freqValue = parseFloat(row.frequency);
        const bgColor = freqValue < 60 ? '#FCA5A5' : freqValue >= 90 ? '#86EFAC' : '#ffffff';
        tr.style.backgroundColor = bgColor;

        const cells = [
          row.studentName,
          row.courseName,
          `${row.classesGiven}/16`,
          row.classesAttended.toString(),
          row.frequency,
        ];

        cells.forEach((cellText, idx) => {
          const td = document.createElement('td');
          td.textContent = cellText;
          td.style.padding = '10px 8px';
          td.style.border = '1px solid #cbd5e1';
          td.style.fontSize = '10px';
          td.style.textAlign = 'center';
          tr.appendChild(td);
        });

        tbody.appendChild(tr);
      });
    }

    tableElement.appendChild(tbody);

    const tempDiv = document.createElement('div');
    tempDiv.style.position = 'absolute';
    tempDiv.style.left = '-9999px';
    tempDiv.style.width = '1000px';
    tempDiv.appendChild(tableElement);
    document.body.appendChild(tempDiv);

    const canvas = await html2canvas(tableElement, {
      scale: 2,
      logging: false,
      backgroundColor: '#ffffff',
    });

    const imgData = canvas.toDataURL('image/png');
    const imgWidth = pageWidth - 2 * margin;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    pdf.addImage(imgData, 'PNG', margin, margin + 20, imgWidth, imgHeight);
    document.body.removeChild(tempDiv);

    pdf.save(`relatorio_sintetico_${filters.modality.toLowerCase()}_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  if (!isOpen) return null;

  const hasData = eadData.length > 0 || videoData.length > 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-7xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <div className="flex items-center space-x-3">
            <img src={logoImg} alt="Logo" className="h-10 w-auto" />
            <h2 className="text-xl font-semibold text-slate-800">Relatório Sintético</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-6 mb-6">
            <h3 className="font-semibold text-slate-800 mb-4">Filtros</h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Unidade</label>
                <select
                  value={filters.unitId}
                  onChange={(e) => setFilters(prev => ({ ...prev, unitId: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                <label className="block text-sm font-medium text-slate-700 mb-2">Modalidade</label>
                <select
                  value={filters.modality}
                  onChange={(e) => setFilters(prev => ({ ...prev, modality: e.target.value, courseId: '' }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Selecione...</option>
                  <option value="EAD">EAD 24h</option>
                  <option value="VIDEOCONFERENCIA">Videoconferência</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Curso</label>
                <select
                  value={filters.courseId}
                  onChange={(e) => setFilters(prev => ({ ...prev, courseId: e.target.value }))}
                  disabled={!filters.modality}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="">Selecione...</option>
                  {filteredCourses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              onClick={generateReport}
              disabled={loading || !filters.modality || !filters.courseId}
              className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {loading ? 'Gerando...' : 'Gerar Relatório'}
            </button>
          </div>

          {hasData && (
            <>
              <div className="flex gap-3 mb-4">
                <button
                  onClick={exportToXLSX}
                  className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  <FileSpreadsheet className="w-5 h-5" />
                  <span>Exportar XLSX</span>
                </button>
                <button
                  onClick={exportToPDF}
                  className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <FileText className="w-5 h-5" />
                  <span>Gerar PDF</span>
                </button>
              </div>

              <div ref={reportRef} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  {filters.modality === 'EAD' && eadData.length > 0 && (
                    <table className="w-full">
                      <thead className="bg-blue-600 text-white">
                        <tr>
                          <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider border border-blue-700">
                            ALUNO
                          </th>
                          <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider border border-blue-700">
                            CURSO
                          </th>
                          <th colSpan={3} className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider border border-blue-700">
                            ÚLTIMOS ACESSOS
                          </th>
                          <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider border border-blue-700">
                            SITUAÇÃO
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {eadData.map((row, index) => (
                          <tr
                            key={index}
                            className={`${
                              row.status === 'AUSENTE' ? 'bg-red-100' :
                              row.status === 'FREQUENTE' ? 'bg-green-100' :
                              'bg-white'
                            }`}
                          >
                            <td className="px-4 py-3 text-sm text-slate-800 border border-slate-200">{row.studentName}</td>
                            <td className="px-4 py-3 text-sm text-slate-800 border border-slate-200">{row.courseName}</td>
                            <td className="px-4 py-3 text-sm text-center text-slate-800 border border-slate-200">{row.access1 || '-'}</td>
                            <td className="px-4 py-3 text-sm text-center text-slate-800 border border-slate-200">{row.access2 || '-'}</td>
                            <td className="px-4 py-3 text-sm text-center text-slate-800 border border-slate-200">{row.access3 || '-'}</td>
                            <td className="px-4 py-3 text-sm text-center font-bold text-slate-900 border border-slate-200">{row.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  {filters.modality === 'VIDEOCONFERENCIA' && videoData.length > 0 && (
                    <table className="w-full">
                      <thead className="bg-blue-600 text-white">
                        <tr>
                          <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider border border-blue-700">
                            ALUNO
                          </th>
                          <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider border border-blue-700">
                            CURSO
                          </th>
                          <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider border border-blue-700">
                            AULAS MINISTRADAS
                          </th>
                          <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider border border-blue-700">
                            AULAS ASSISTIDAS
                          </th>
                          <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider border border-blue-700">
                            % FREQUÊNCIA
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {videoData.map((row, index) => {
                          const freqValue = parseFloat(row.frequency);
                          const bgColor = freqValue < 60 ? 'bg-red-100' : freqValue >= 90 ? 'bg-green-100' : 'bg-white';

                          return (
                            <tr key={index} className={bgColor}>
                              <td className="px-4 py-3 text-sm text-slate-800 border border-slate-200">{row.studentName}</td>
                              <td className="px-4 py-3 text-sm text-slate-800 border border-slate-200">{row.courseName}</td>
                              <td className="px-4 py-3 text-sm text-center text-slate-800 border border-slate-200">{row.classesGiven}/16</td>
                              <td className="px-4 py-3 text-sm text-center text-slate-800 border border-slate-200">{row.classesAttended}</td>
                              <td className="px-4 py-3 text-sm text-center font-bold text-slate-900 border border-slate-200">{row.frequency}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </>
          )}

          {!hasData && !loading && (
            <div className="text-center py-12 text-slate-500">
              Selecione os filtros e clique em "Gerar Relatório"
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
