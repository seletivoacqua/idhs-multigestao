import { useState, useEffect } from 'react';
import { X, Download, Filter } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import logoImg from '../../assets/image.png';

interface SyntheticReportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Cycle {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
}

interface EADStudent {
  studentName: string;
  courseName: string;
  lastAccess: string;
  situation: 'FREQUENTE' | 'AUSENTE';
  inclusionClass?: number;
}

interface VideoconferenceStudent {
  studentName: string;
  courseName: string;
  totalClasses: number;
  attendedClasses: number;
  frequency: number;
  inclusionClass?: number;
}

interface ReportData {
  eadStudents: EADStudent[];
  videoconferenceStudents: VideoconferenceStudent[];
  totalEAD: number;
  totalVideoconference: number;
  contractInfo: {
    date: string;
    contractNumber: string;
    contractor: string;
    object: string;
    signatureDate: string;
    unitName: string;
  };
}

export function SyntheticReportModal({ isOpen, onClose }: SyntheticReportModalProps) {
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [selectedCycle, setSelectedCycle] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (isOpen) {
      loadCycles();
    }
  }, [isOpen]);

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

  const generateSyntheticReport = async () => {
    if (!user || !selectedCycle) return;

    setLoading(true);
    setReportData(null);

    try {
      // Buscar informações do ciclo selecionado
      const { data: cycleData } = await supabase
        .from('cycles')
        .select('*')
        .eq('id', selectedCycle)
        .single();

      // Buscar todas as turmas do ciclo
      const { data: classes } = await supabase
        .from('classes')
        .select(`
          *,
          courses (
            name,
            modality
          )
        `)
        .eq('cycle_id', selectedCycle);

      if (!classes) {
        setLoading(false);
        return;
      }

      const eadStudents: EADStudent[] = [];
      const videoconferenceStudents: VideoconferenceStudent[] = [];

      for (const cls of classes) {
        // Buscar alunos da turma
        const { data: classStudents } = await supabase
          .from('class_students')
          .select(`
            *,
            students (
              id,
              full_name
            )
          `)
          .eq('class_id', cls.id);

        if (!classStudents) continue;

        for (const cs of classStudents) {
          // Verificar se o aluno foi incluído depois (baseado na enrollment_date vs start_date do ciclo)
          const enrollmentDate = new Date(cs.enrollment_date);
          const cycleStartDate = new Date(cycleData.start_date);
          const inclusionClass = enrollmentDate > cycleStartDate ? 
            Math.ceil((enrollmentDate.getTime() - cycleStartDate.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1 : 
            undefined;

          if (cls.modality === 'EAD') {
            // Buscar dados EAD
            const { data: accessData } = await supabase
              .from('ead_access')
              .select('*')
              .eq('class_id', cls.id)
              .eq('student_id', cs.student_id)
              .maybeSingle();

            // Encontrar o último acesso
            const accesses = [
              accessData?.access_date_1,
              accessData?.access_date_2,
              accessData?.access_date_3,
            ].filter(date => date !== null);

            const lastAccess = accesses.length > 0 
              ? new Date(Math.max(...accesses.map(d => new Date(d).getTime()))).toLocaleString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })
              : '-';

            // Calcular situação (frequente se pelo menos 2 acessos)
            const situation = accesses.length >= 2 ? 'FREQUENTE' : 'AUSENTE';

            eadStudents.push({
              studentName: cs.students?.full_name || 'Nome não informado',
              courseName: cls.courses?.name || 'Curso não informado',
              lastAccess,
              situation,
              inclusionClass
            });
          } else {
            // Buscar dados de videoconferência
            const { data: attendanceData } = await supabase
              .from('attendance')
              .select('*')
              .eq('class_id', cls.id)
              .eq('student_id', cs.student_id);

            // Total de aulas ministradas (considerando o ciclo)
            const { data: classes_list } = await supabase
              .from('classes_list')
              .select('class_number')
              .eq('class_id', cls.id)
              .gte('class_date', cycleData.start_date)
              .lte('class_date', cycleData.end_date);

            const totalClasses = classes_list?.length || 0;

            // Filtrar attendance dentro do período do ciclo
            const relevantAttendance = attendanceData?.filter(att => 
              att.class_date >= cycleData.start_date && 
              att.class_date <= cycleData.end_date
            ) || [];

            const attendedClasses = relevantAttendance.filter(a => a.present).length;
            const frequency = totalClasses > 0 ? Math.round((attendedClasses / totalClasses) * 100) : 0;

            videoconferenceStudents.push({
              studentName: cs.students?.full_name || 'Nome não informado',
              courseName: cls.courses?.name || 'Curso não informado',
              totalClasses,
              attendedClasses,
              frequency,
              inclusionClass
            });
          }
        }
      }

      // Ordenar alunos por nome
      eadStudents.sort((a, b) => a.studentName.localeCompare(b.studentName));
      videoconferenceStudents.sort((a, b) => a.studentName.localeCompare(b.studentName));

      setReportData({
        eadStudents,
        videoconferenceStudents,
        totalEAD: eadStudents.length,
        totalVideoconference: videoconferenceStudents.length,
        contractInfo: {
          date: new Date().toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: 'long',
            year: 'numeric'
          }),
          contractNumber: '383/2024/ACQUA', // Isso viria de uma tabela de contratos
          contractor: 'INSTITUTO DO DESENVOLVIMENTO HUMANO E SOCIAL - IDHS',
          object: 'Prestação de serviços de capacitação visando promover a qualificação profissional de funcionários do Instituto Acqua – Ação, Cidadania, Qualidade Urbana e Ambiental',
          signatureDate: '1º de fevereiro de 2024',
          unitName: 'CASA DE APOIO – PROJETO NINAR – MA'
        }
      });
    } catch (error) {
      console.error('Error generating synthetic report:', error);
    } finally {
      setLoading(false);
    }
  };

  const exportToPDF = async () => {
    if (!reportData) return;

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const margin = 15;
    let yPos = 20;

    // Função para adicionar cabeçalho
    const addHeader = () => {
      try {
        pdf.addImage(logoImg, 'PNG', margin, yPos - 5, 30, 12);
      } catch (e) {
        console.warn('Logo não pôde ser carregada');
      }

      pdf.setFontSize(10);
      pdf.setTextColor(100, 100, 100);
      pdf.text(`${reportData.contractInfo.unitName}`, pageWidth - margin, yPos, { align: 'right' });
      
      yPos += 5;
      pdf.setFontSize(10);
      pdf.text(`${reportData.contractInfo.date}.`, pageWidth - margin, yPos, { align: 'right' });
      
      yPos += 10;
      pdf.setFontSize(16);
      pdf.setTextColor(0, 0, 0);
      pdf.setFont('helvetica', 'bold');
      pdf.text('RELATÓRIO DE FREQUÊNCIA', pageWidth / 2, yPos, { align: 'center' });
      
      yPos += 8;
      pdf.setFontSize(12);
      pdf.text(`UNIDADE DE SAÚDE: ${reportData.contractInfo.unitName}`, pageWidth / 2, yPos, { align: 'center' });
      
      yPos += 10;
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      
      // Informações do contrato
      pdf.text(`1. CONTRATO Nº ${reportData.contractInfo.contractNumber}`, margin, yPos);
      yPos += 6;
      pdf.text(`2. CONTRATADO: ${reportData.contractInfo.contractor}`, margin, yPos);
      yPos += 6;
      
      // Objeto (quebrar em múltiplas linhas se necessário)
      const objectLines = pdf.splitTextToSize(`3. OBJETO: ${reportData.contractInfo.object}`, pageWidth - 2 * margin);
      pdf.text(objectLines, margin, yPos);
      yPos += objectLines.length * 5;
      
      pdf.text(`4. DATA DE ASSINATURA DO CONTRATO: ${reportData.contractInfo.signatureDate}`, margin, yPos);
      yPos += 10;
    };

    // Cabeçalho da primeira página
    addHeader();

    // Seção EAD
    if (reportData.eadStudents.length > 0) {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(12);
      pdf.text('ACESSOS – PLATAFORMA EAD 24H', margin, yPos);
      yPos += 6;

      // Cabeçalho da tabela EAD
      pdf.setFillColor(240, 240, 240);
      pdf.rect(margin, yPos - 4, pageWidth - 2 * margin, 8, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.text('ALUNO', margin + 2, yPos);
      pdf.text('CURSO', margin + 70, yPos);
      pdf.text('ÚLTIMO ACESSO', margin + 140, yPos);
      pdf.text('SITUAÇÃO', margin + 180, yPos);
      yPos += 4;

      // Dados EAD
      pdf.setFont('helvetica', 'normal');
      reportData.eadStudents.forEach((student, index) => {
        // Verificar se precisa de nova página
        if (yPos > 270) {
          pdf.addPage();
          yPos = 20;
        }

        const studentName = student.inclusionClass 
          ? `${student.studentName} (INCLUSÃO NA AULA ${student.inclusionClass})`
          : student.studentName;

        pdf.text(studentName, margin + 2, yPos);
        
        // Curso (truncar se necessário)
        const courseName = student.courseName.length > 30 
          ? student.courseName.substring(0, 27) + '...' 
          : student.courseName;
        pdf.text(courseName, margin + 70, yPos);
        
        pdf.text(student.lastAccess, margin + 140, yPos);
        
        // Situação com cor
        if (student.situation === 'FREQUENTE') {
          pdf.setTextColor(34, 197, 94);
        } else {
          pdf.setTextColor(239, 68, 68);
        }
        pdf.setFont('helvetica', 'bold');
        pdf.text(student.situation, margin + 180, yPos);
        
        // Reset cor e fonte
        pdf.setTextColor(0, 0, 0);
        pdf.setFont('helvetica', 'normal');
        
        yPos += 5;
      });
      
      yPos += 5;
    }

    // Seção Videoconferência
    if (reportData.videoconferenceStudents.length > 0) {
      // Verificar se precisa de nova página
      if (yPos > 250) {
        pdf.addPage();
        yPos = 20;
      }

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(12);
      pdf.text('FREQUÊNCIA – PLATAFORMA DE VIDEOCONFERÊNCIA', margin, yPos);
      yPos += 6;

      // Cabeçalho da tabela Videoconferência
      pdf.setFillColor(240, 240, 240);
      pdf.rect(margin, yPos - 4, pageWidth - 2 * margin, 8, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.text('ALUNO', margin + 2, yPos);
      pdf.text('CURSO', margin + 100, yPos);
      pdf.text('AULAS', margin + 170, yPos);
      pdf.text('%', margin + 185, yPos);
      yPos += 4;

      // Dados Videoconferência
      pdf.setFont('helvetica', 'normal');
      reportData.videoconferenceStudents.forEach((student, index) => {
        // Verificar se precisa de nova página
        if (yPos > 270) {
          pdf.addPage();
          yPos = 20;
        }

        const studentName = student.inclusionClass 
          ? `${student.studentName} (INCLUSÃO NA AULA ${student.inclusionClass})`
          : student.studentName;

        pdf.text(studentName, margin + 2, yPos);
        
        // Curso (truncar se necessário)
        const courseName = student.courseName.length > 40 
          ? student.courseName.substring(0, 37) + '...' 
          : student.courseName;
        pdf.text(courseName, margin + 100, yPos);
        
        pdf.text(`${student.attendedClasses}/${student.totalClasses}`, margin + 170, yPos);
        
        // Frequência com cor
        if (student.frequency >= 60) {
          pdf.setTextColor(34, 197, 94);
        } else {
          pdf.setTextColor(239, 68, 68);
        }
        pdf.setFont('helvetica', 'bold');
        pdf.text(`${student.frequency}%`, margin + 185, yPos);
        
        // Reset cor e fonte
        pdf.setTextColor(0, 0, 0);
        pdf.setFont('helvetica', 'normal');
        
        yPos += 5;
      });
      
      yPos += 10;
    }

    // Texto final
    if (yPos > 250) {
      pdf.addPage();
      yPos = 20;
    }

    const finalText = [
      'Contamos com a colaboração de todos para que reforcem, junto às suas equipes, a importância dos cursos ofertados. A participação ativa nos cursos é fundamental para o desenvolvimento profissional e para o aprimoramento das práticas no ambiente de trabalho. Incentivar a assiduidade é um compromisso coletivo, e acreditamos que, com o apoio de todos, será possível ampliar cada vez mais o número de colaboradores engajados nas formações oferecidas.'
    ];

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    const textLines = pdf.splitTextToSize(finalText[0], pageWidth - 2 * margin);
    pdf.text(textLines, margin, yPos);
    yPos += textLines.length * 5 + 10;

    // Assinatura
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.text('Marcelo Henrique de Oliveira Malheiros', pageWidth / 2, yPos, { align: 'center' });
    yPos += 4;
    pdf.setFont('helvetica', 'bold');
    pdf.text('Diretor-Presidente do IDHS', pageWidth / 2, yPos, { align: 'center' });

    pdf.save(`relatorio_sintetico_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" onClick={onClose} />

        <div className="inline-block w-full max-w-4xl my-8 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-lg">
          <div className="flex items-center justify-between px-6 py-4 bg-slate-800">
            <h3 className="text-lg font-semibold text-white">Relatório Sintético</h3>
            <button onClick={onClose} className="text-white hover:text-slate-300">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6">
            <div className="mb-6 bg-slate-50 p-4 rounded-lg border border-slate-200">
              <div className="flex items-center space-x-2 mb-4">
                <Filter className="w-5 h-5 text-slate-600" />
                <h4 className="font-medium text-slate-800">Filtros</h4>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Ciclo <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={selectedCycle}
                    onChange={(e) => setSelectedCycle(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    required
                  >
                    <option value="">Selecione um ciclo</option>
                    {cycles.map((cycle) => (
                      <option key={cycle.id} value={cycle.id}>
                        {cycle.name} ({new Date(cycle.start_date).toLocaleDateString('pt-BR')} - {new Date(cycle.end_date).toLocaleDateString('pt-BR')})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-end">
                  <button
                    onClick={generateSyntheticReport}
                    disabled={!selectedCycle || loading}
                    className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <Download className="w-5 h-5" />
                    <span>{loading ? 'Gerando...' : 'Gerar Relatório'}</span>
                  </button>
                </div>
              </div>
            </div>

            {reportData && (
              <>
                {/* Prévia do relatório */}
                <div className="mb-6 border border-slate-200 rounded-lg p-4 max-h-96 overflow-y-auto">
                  <div className="text-center mb-4">
                    <h4 className="font-bold text-lg">RELATÓRIO DE FREQUÊNCIA</h4>
                    <p className="text-sm text-slate-600">UNIDADE DE SAÚDE: {reportData.contractInfo.unitName}</p>
                    <p className="text-xs text-slate-500">{reportData.contractInfo.date}</p>
                  </div>

                  {reportData.eadStudents.length > 0 && (
                    <div className="mb-4">
                      <h5 className="font-semibold text-sm mb-2">ACESSOS – PLATAFORMA EAD 24H</h5>
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-xs">
                          <thead className="bg-slate-100">
                            <tr>
                              <th className="px-2 py-1 text-left">ALUNO</th>
                              <th className="px-2 py-1 text-left">CURSO</th>
                              <th className="px-2 py-1 text-left">ÚLTIMO ACESSO</th>
                              <th className="px-2 py-1 text-left">SITUAÇÃO</th>
                            </tr>
                          </thead>
                          <tbody>
                            {reportData.eadStudents.map((student, idx) => (
                              <tr key={idx} className="border-b">
                                <td className="px-2 py-1">
                                  {student.studentName}
                                  {student.inclusionClass && (
                                    <span className="text-xs text-slate-500 ml-1">
                                      (INCLUSÃO NA AULA {student.inclusionClass})
                                    </span>
                                  )}
                                </td>
                                <td className="px-2 py-1">{student.courseName}</td>
                                <td className="px-2 py-1">{student.lastAccess}</td>
                                <td className="px-2 py-1">
                                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold ${
                                    student.situation === 'FREQUENTE' 
                                      ? 'bg-green-100 text-green-700' 
                                      : 'bg-red-100 text-red-700'
                                  }`}>
                                    {student.situation}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {reportData.videoconferenceStudents.length > 0 && (
                    <div className="mb-4">
                      <h5 className="font-semibold text-sm mb-2">FREQUÊNCIA – PLATAFORMA DE VIDEOCONFERÊNCIA</h5>
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-xs">
                          <thead className="bg-slate-100">
                            <tr>
                              <th className="px-2 py-1 text-left">ALUNO</th>
                              <th className="px-2 py-1 text-left">CURSO</th>
                              <th className="px-2 py-1 text-center">AULAS</th>
                              <th className="px-2 py-1 text-center">%</th>
                            </tr>
                          </thead>
                          <tbody>
                            {reportData.videoconferenceStudents.map((student, idx) => (
                              <tr key={idx} className="border-b">
                                <td className="px-2 py-1">
                                  {student.studentName}
                                  {student.inclusionClass && (
                                    <span className="text-xs text-slate-500 ml-1">
                                      (INCLUSÃO NA AULA {student.inclusionClass})
                                    </span>
                                  )}
                                </td>
                                <td className="px-2 py-1">{student.courseName}</td>
                                <td className="px-2 py-1 text-center">{student.attendedClasses}/{student.totalClasses}</td>
                                <td className="px-2 py-1 text-center">
                                  <span className={`font-bold ${
                                    student.frequency >= 60 ? 'text-green-600' : 'text-red-600'
                                  }`}>
                                    {student.frequency}%
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <div className="text-xs text-slate-600 mt-4">
                    <p className="mb-2">
                      Contamos com a colaboração de todos para que reforcem, junto às suas equipes, a importância dos cursos ofertados. A participação ativa nos cursos é fundamental para o desenvolvimento profissional e para o aprimoramento das práticas no ambiente de trabalho. Incentivar a assiduidade é um compromisso coletivo, e acreditamos que, com o apoio de todos, será possível ampliar cada vez mais o número de colaboradores engajados nas formações oferecidas.
                    </p>
                    <p className="text-center font-bold mt-4">
                      Marcelo Henrique de Oliveira Malheiros<br />
                      <span className="font-normal">Diretor-Presidente do IDHS</span>
                    </p>
                  </div>
                </div>

                <div className="flex justify-end gap-3">
                  <button
                    onClick={exportToPDF}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    <span>Exportar PDF</span>
                  </button>
                </div>
              </>
            )}

            {!reportData && !loading && selectedCycle && (
              <div className="text-center py-8 text-slate-500">
                Clique em "Gerar Relatório" para visualizar os dados
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
