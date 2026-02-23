import { useState, useEffect, useMemo } from 'react';
import { FileText, Download, Users, CheckCircle, XCircle, Calendar, TrendingUp } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

interface Cycle {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: string;
}

interface Class {
  id: string;
  name: string;
  cycle_id: string;
  modality: string;
  total_classes: number;
  courses: { name: string };
  cycles: { name: string };
}

interface Student {
  id: string;
  full_name: string;
  status: string;
  attendance_percentage: number;
  attendance_count: number;
}

interface AttendanceStats {
  totalStudents: number;
  present: number;
  absent: number;
  presentPercentage: number;
  absentPercentage: number;
}

export function ReportsTab() {
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedCycle, setSelectedCycle] = useState<string>('');
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    loadCycles();
  }, []);

  useEffect(() => {
    if (selectedCycle) {
      loadClasses(selectedCycle);
    }
  }, [selectedCycle]);

  useEffect(() => {
    if (selectedClass) {
      loadStudents(selectedClass);
    }
  }, [selectedClass]);

  const attendanceStats = useMemo((): AttendanceStats => {
    if (students.length === 0) {
      return {
        totalStudents: 0,
        present: 0,
        absent: 0,
        presentPercentage: 0,
        absentPercentage: 0
      };
    }

    const present = students.filter(s => s.attendance_percentage >= 60).length;
    const absent = students.filter(s => s.attendance_percentage < 60).length;
    const total = students.length;

    return {
      totalStudents: total,
      present,
      absent,
      presentPercentage: total > 0 ? Math.round((present / total) * 100) : 0,
      absentPercentage: total > 0 ? Math.round((absent / total) * 100) : 0
    };
  }, [students]);

  const loadCycles = async () => {
    try {
      const { data, error } = await supabase
        .from('cycles')
        .select('id, name, start_date, end_date, status')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCycles(data || []);
    } catch (error) {
      console.error('Error loading cycles:', error);
    }
  };

  const loadClasses = async (cycleId: string) => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('classes')
        .select(`
          id,
          name,
          cycle_id,
          modality,
          total_classes,
          courses!inner(name),
          cycles!inner(name)
        `)
        .eq('cycle_id', cycleId)
        .order('name');

      if (error) throw error;
      setClasses(data || []);
      setStudents([]);
      setSelectedClass('');
    } catch (error) {
      console.error('Error loading classes:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadStudents = async (classId: string) => {
    try {
      setLoading(true);

      const classData = classes.find(c => c.id === classId);
      if (!classData) return;

      const { data: enrollments, error } = await supabase
        .from('class_students')
        .select(`
          student_id,
          status,
          students!inner(id, full_name)
        `)
        .eq('class_id', classId);

      if (error) throw error;

      const studentsWithAttendance = await Promise.all(
        (enrollments || []).map(async (enrollment: any) => {
          const studentId = enrollment.student_id;

          let attendanceCount = 0;
          let percentage = 0;

          if (classData.modality === 'EAD') {
            const { data: eadAccess } = await supabase
              .from('ead_class_access')
              .select('access_date_1, access_date_2, access_date_3')
              .eq('class_id', classId)
              .eq('student_id', studentId)
              .maybeSingle();

            if (eadAccess) {
              const validDates = [
                eadAccess.access_date_1,
                eadAccess.access_date_2,
                eadAccess.access_date_3
              ].filter(Boolean);
              attendanceCount = validDates.length;
              percentage = Math.round((attendanceCount / 3) * 100);
            }
          } else {
            const { data: attendance } = await supabase
              .from('attendance')
              .select('status')
              .eq('class_id', classId)
              .eq('student_id', studentId);

            if (attendance) {
              attendanceCount = attendance.filter((a: any) => a.status === 'present').length;
              const totalClasses = classData.total_classes || 1;
              percentage = Math.round((attendanceCount / totalClasses) * 100);
            }
          }

          return {
            id: studentId,
            full_name: enrollment.students.full_name,
            status: enrollment.status,
            attendance_percentage: percentage,
            attendance_count: attendanceCount
          };
        })
      );

      setStudents(studentsWithAttendance);
    } catch (error) {
      console.error('Error loading students:', error);
    } finally {
      setLoading(false);
    }
  };

  const generatePDF = async () => {
    if (!selectedClass || students.length === 0) return;

    try {
      setGenerating(true);

      const reportElement = document.getElementById('report-content');
      if (!reportElement) return;

      const canvas = await html2canvas(reportElement, {
        scale: 2,
        backgroundColor: '#ffffff',
        logging: false
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pdfWidth - 20;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 10;

      pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight;
      }

      const classData = classes.find(c => c.id === selectedClass);
      const fileName = `relatorio_${classData ? classData.name : 'turma'}_${new Date().toISOString().split('T')[0]}.pdf`;
      pdf.save(fileName);
    } catch (error) {
      console.error('Error generating PDF:', error);
    } finally {
      setGenerating(false);
    }
  };

  const selectedClassData = classes.find(c => c.id === selectedClass);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center">
            <FileText className="w-7 h-7 mr-2 text-green-600" />
            Relatórios de Frequência
          </h2>
          <p className="text-slate-600 mt-1">
            Visualize e exporte relatórios de presença dos alunos
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Selecione o Ciclo
          </label>
          <select
            value={selectedCycle}
            onChange={(e) => setSelectedCycle(e.target.value)}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="">Selecione um ciclo</option>
            {cycles.map((cycle) => (
              <option key={cycle.id} value={cycle.id}>
                {cycle.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Selecione a Turma
          </label>
          <select
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            disabled={!selectedCycle || classes.length === 0}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-slate-100"
          >
            <option value="">Selecione uma turma</option>
            {classes.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.name} - {cls.courses.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading && (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
        </div>
      )}

      {!loading && selectedClass && students.length > 0 && (
        <>
          <div className="flex justify-end">
            <button
              onClick={generatePDF}
              disabled={generating}
              className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-slate-400"
            >
              <Download className="w-5 h-5" />
              <span>{generating ? 'Gerando...' : 'Exportar PDF'}</span>
            </button>
          </div>

          <div id="report-content" className="bg-white rounded-lg border border-slate-200 p-6 space-y-6">
            <div className="border-b border-slate-200 pb-4">
              <h3 className="text-xl font-bold text-slate-800">Relatório de Frequência</h3>
              <div className="mt-2 space-y-1 text-sm text-slate-600">
                <p><strong>Ciclo:</strong> {selectedClassData ? selectedClassData.cycles.name : ''}</p>
                <p><strong>Turma:</strong> {selectedClassData ? selectedClassData.name : ''}</p>
                <p><strong>Curso:</strong> {selectedClassData ? selectedClassData.courses.name : ''}</p>
                <p><strong>Modalidade:</strong> {selectedClassData ? selectedClassData.modality : ''}</p>
                <p><strong>Data:</strong> {new Date().toLocaleDateString('pt-BR')}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600">Total de Alunos</p>
                    <p className="text-2xl font-bold text-slate-800 mt-1">{attendanceStats.totalStudents}</p>
                  </div>
                  <Users className="w-8 h-8 text-slate-400" />
                </div>
              </div>

              <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-green-700">Frequentes (≥60%)</p>
                    <p className="text-2xl font-bold text-green-800 mt-1">{attendanceStats.present}</p>
                  </div>
                  <CheckCircle className="w-8 h-8 text-green-500" />
                </div>
              </div>

              <div className="bg-red-50 rounded-lg p-4 border border-red-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-red-700">Ausentes (&lt;60%)</p>
                    <p className="text-2xl font-bold text-red-800 mt-1">{attendanceStats.absent}</p>
                  </div>
                  <XCircle className="w-8 h-8 text-red-500" />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-slate-700 flex items-center">
                  <TrendingUp className="w-4 h-4 mr-2" />
                  Distribuição de Frequência
                </h4>
                <div className="flex items-center space-x-4 text-xs">
                  <div className="flex items-center space-x-1">
                    <div className="w-3 h-3 bg-green-500 rounded"></div>
                    <span className="text-slate-600">Frequentes: {attendanceStats.presentPercentage}%</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <div className="w-3 h-3 bg-red-500 rounded"></div>
                    <span className="text-slate-600">Ausentes: {attendanceStats.absentPercentage}%</span>
                  </div>
                </div>
              </div>

              <div className="w-full bg-slate-200 rounded-full h-8 overflow-hidden flex">
                {attendanceStats.present > 0 && (
                  <div
                    className="bg-green-500 h-full flex items-center justify-center text-white text-xs font-semibold"
                    style={{ width: `${attendanceStats.presentPercentage}%` }}
                  >
                    {attendanceStats.presentPercentage > 10 && `${attendanceStats.presentPercentage}%`}
                  </div>
                )}
                {attendanceStats.absent > 0 && (
                  <div
                    className="bg-red-500 h-full flex items-center justify-center text-white text-xs font-semibold"
                    style={{ width: `${attendanceStats.absentPercentage}%` }}
                  >
                    {attendanceStats.absentPercentage > 10 && `${attendanceStats.absentPercentage}%`}
                  </div>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b-2 border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Aluno
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Presenças
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Frequência
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {students.map((student) => {
                    const isFrequent = student.attendance_percentage >= 60;
                    return (
                      <tr key={student.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-sm text-slate-800">
                          {student.full_name}
                        </td>
                        <td className="px-4 py-3 text-sm text-center text-slate-600">
                          {student.attendance_count}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center">
                            <div className="w-16 bg-slate-200 rounded-full h-2 mr-2">
                              <div
                                className={`h-2 rounded-full ${
                                  isFrequent ? 'bg-green-500' : 'bg-red-500'
                                }`}
                                style={{ width: `${Math.min(student.attendance_percentage, 100)}%` }}
                              ></div>
                            </div>
                            <span className="text-sm font-medium text-slate-700">
                              {student.attendance_percentage}%
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              isFrequent
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {isFrequent ? (
                              <>
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Frequente
                              </>
                            ) : (
                              <>
                                <XCircle className="w-3 h-3 mr-1" />
                                Ausente
                              </>
                            )}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {!loading && selectedClass && students.length === 0 && (
        <div className="bg-white rounded-lg border border-slate-200 p-12 text-center">
          <Calendar className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-600 text-lg">Nenhum aluno matriculado nesta turma</p>
        </div>
      )}
    </div>
  );
}
