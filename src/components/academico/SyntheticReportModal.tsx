import { useState, useEffect, useRef } from 'react';
import { X, FileSpreadsheet, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import logoImg from '../../assets/Gemini_Generated_Image_dimyf6dimyf6dimy.png';

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

interface ClassInfo {
  id: string;
  name: string;
  course_id: string;
  total_classes: number;
  modality: string;
  end_date: string | null;
  status: 'active' | 'closed';
  cycle_status: 'active' | 'closed';
  cycle_end_date: string | null;
}

interface EADReportData {
  studentName: string;
  courseName: string;
  className: string;
  classId: string;
  classEndDate: string | null;
  classStatus: string;
  access1: string;
  access2: string;
  access3: string;
  isFrequente: boolean;
  status: string;
  statusDisplay: string;
}

interface VideoConferenceReportData {
  studentName: string;
  courseName: string;
  className: string;
  classId: string;
  classEndDate: string | null;
  classStatus: string;
  totalClasses: number;
  classesGiven: number;
  classesAttended: number;
  frequency: string;
  frequencyValue: number;
  situation: string;
}

interface CombinedReportData {
  studentName: string;
  courseName: string;
  className: string;
  modality: string;
  classEndDate: string | null;
  classStatus: string;
  access1?: string;
  access2?: string;
  access3?: string;
  isFrequente?: boolean;
  status?: string;
  totalClasses?: number;
  classesGiven?: number;
  classesAttended?: number;
  frequency?: string;
  frequencyValue?: number;
  situation?: string;
}

export default function SyntheticReportModal({ isOpen, onClose }: SyntheticReportModalProps) {
  const [units, setUnits] = useState<Unit[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [filteredCourses, setFilteredCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    unitId: '',
    modality: '',
    courseId: '',
    classStatus: 'all',
  });
  const [eadData, setEadData] = useState<EADReportData[]>([]);
  const [videoData, setVideoData] = useState<VideoConferenceReportData[]>([]);
  const [combinedData, setCombinedData] = useState<CombinedReportData[]>([]);
  const { user } = useAuth();
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user && isOpen) {
      loadUnits();
      loadCourses();
    }
  }, [user, isOpen]);

  useEffect(() => {
    if (filters.modality && filters.modality !== 'ALL') {
      const filtered = courses.filter(c => c.modality === filters.modality);
      setFilteredCourses(filtered);
    } else {
      setFilteredCourses(courses);
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

  const formatDateTime = (timestamp: string | null): string => {
    if (!timestamp) return '';
    try {
      const date = new Date(timestamp);
      return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '';
    }
  };

  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('pt-BR');
    } catch {
      return '';
    }
  };

  const isClassFinished = (classStatus: string, endDate: string | null): boolean => {
    if (classStatus === 'closed') return true;
    if (endDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(0, 0, 0, 0);
      return end < today;
    }
    return false;
  };

  const getClassStatusDisplay = (classStatus: string, endDate: string | null): string => {
    if (classStatus === 'closed') return 'FINALIZADA';
    if (endDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(0, 0, 0, 0);
      if (end < today) return 'FINALIZADA';
    }
    return 'EM ANDAMENTO';
  };

  const fetchClasses = async (modality: string): Promise<ClassInfo[]> => {
    let classesQuery = supabase
      .from('classes')
      .select(`
        id,
        name,
        total_classes,
        modality,
        end_date,
        status,
        course_id,
        cycles ( id, name, status, end_date )
      `)
      .eq('modality', modality);

    if (filters.courseId && filters.courseId !== 'ALL') {
      classesQuery = classesQuery.eq('course_id', filters.courseId);
    }

    if (filters.classStatus === 'closed') {
      const today = new Date().toISOString().split('T')[0];
      classesQuery = classesQuery.or(`status.eq.closed,end_date.lt.${today}`);
    } else if (filters.classStatus === 'active') {
      classesQuery = classesQuery.eq('status', 'active');
    }

    const { data: classes } = await classesQuery;
    
    return (classes || []).map((cls: any) => ({
      id: cls.id,
      name: cls.name,
      course_id: cls.course_id,
      total_classes: cls.total_classes,
      modality: cls.modality,
      end_date: cls.end_date,
      status: cls.status,
      cycle_status: cls.cycles?.status || 'active',
      cycle_end_date: cls.cycles?.end_date || null,
    }));
  };

  // CORRIGIDA: Calcula quantas aulas já foram ministradas baseado no MAIOR class_number
  const getClassesGivenCount = async (classId: string, endDate: string | null, classStatus: string): Promise<number> => {
    if (isClassFinished(classStatus, endDate)) {
      const { data: classData } = await supabase
        .from('classes')
        .select('total_classes')
        .eq('id', classId)
        .single();
      return classData?.total_classes || 0;
    }

    const today = new Date().toISOString().split('T')[0];
    
    const { data: maxClassNumber } = await supabase
      .from('attendance')
      .select('class_number')
      .eq('class_id', classId)
      .lte('class_date', today)
      .order('class_number', { ascending: false })
      .limit(1)
      .single();

    if (!maxClassNumber) return 0;
    return maxClassNumber.class_number;
  };

  const generateReport = async () => {
    if (!filters.modality) {
      alert('Selecione a modalidade para gerar o relatório');
      return;
    }

    setLoading(true);

    if (filters.modality === 'ALL') {
      await generateAllModalitiesReport();
    } else if (filters.modality === 'EAD') {
      await generateEADReport();
    } else if (filters.modality === 'VIDEOCONFERENCIA') {
      await generateVideoConferenceReport();
    }

    setLoading(false);
  };

  const generateEADReport = async () => {
    const classes = await fetchClasses('EAD');
    const reportData: EADReportData[] = [];

    for (const cls of classes) {
      const { data: classStudents } = await supabase
        .from('class_students')
        .select(`
          student_id,
          students ( id, full_name, unit_id )
        `)
        .eq('class_id', cls.id);

      for (const cs of classStudents || []) {
        if (filters.unitId && cs.students?.unit_id !== filters.unitId) {
          continue;
        }

        const { data: accessData } = await supabase
          .from('ead_access')
          .select('access_date_1, access_date_2, access_date_3, is_frequente')
          .eq('class_id', cls.id)
          .eq('student_id', cs.student_id)
          .maybeSingle();

        const access1 = formatDateTime(accessData?.access_date_1);
        const access2 = formatDateTime(accessData?.access_date_2);
        const access3 = formatDateTime(accessData?.access_date_3);
        const isFrequente = accessData?.is_frequente === true;
        const classFinished = isClassFinished(cls.status, cls.end_date);

        let status = '';
        if (classFinished) {
          status = isFrequente ? 'APROVADO' : 'REPROVADO';
        } else {
          status = isFrequente ? 'FREQUENTE (parcial)' : 'NÃO FREQUENTE (parcial)';
        }

        reportData.push({
          studentName: cs.students?.full_name || '',
          courseName: cls.name,
          className: cls.name,
          classId: cls.id,
          classEndDate: cls.end_date,
          classStatus: getClassStatusDisplay(cls.status, cls.end_date),
          access1,
          access2,
          access3,
          isFrequente,
          status,
          statusDisplay: status,
        });
      }
    }

    reportData.sort((a, b) => a.studentName.localeCompare(b.studentName));
    setEadData(reportData);
    setVideoData([]);
    setCombinedData([]);
  };

  // CORRIGIDA: Versão definitiva para Videoconferência
  const generateVideoConferenceReport = async () => {
    const classes = await fetchClasses('VIDEOCONFERENCIA');
    const reportData: VideoConferenceReportData[] = [];

    for (const cls of classes) {
      const classesGiven = await getClassesGivenCount(cls.id, cls.end_date, cls.status);
      const classFinished = isClassFinished(cls.status, cls.end_date);

      const { data: classStudents } = await supabase
        .from('class_students')
        .select(`
          student_id,
          students ( id, full_name, unit_id )
        `)
        .eq('class_id', cls.id);

      for (const cs of classStudents || []) {
        if (filters.unitId && cs.students?.unit_id !== filters.unitId) {
          continue;
        }

        // Buscar apenas presenças em aulas que já aconteceram (class_number <= classesGiven)
        const { data: attendanceData } = await supabase
          .from('attendance')
          .select('class_number')
          .eq('class_id', cls.id)
          .eq('student_id', cs.student_id)
          .eq('present', true)
          .lte('class_number', classesGiven);

        const classesAttended = attendanceData?.length || 0;
        
        // CORREÇÃO: Garantir que classesAttended nunca seja maior que classesGiven
        const safeClassesAttended = Math.min(classesAttended, classesGiven);
        let frequencyValue = classesGiven > 0 ? (safeClassesAttended / classesGiven) * 100 : 0;
        
        // CORREÇÃO: Garantir que frequência nunca ultrapasse 100%
        frequencyValue = Math.min(frequencyValue, 100);
        
        let situation = '';
        if (classFinished) {
          situation = frequencyValue >= 50 ? 'APROVADO' : 'REPROVADO';
        } else {
          situation = frequencyValue >= 50 ? 'FREQUENTE (parcial)' : 'EM ANDAMENTO';
        }

        reportData.push({
          studentName: cs.students?.full_name || '',
          courseName: cls.name,
          className: cls.name,
          classId: cls.id,
          classEndDate: cls.end_date,
          classStatus: getClassStatusDisplay(cls.status, cls.end_date),
          totalClasses: cls.total_classes,
          classesGiven,
          classesAttended: safeClassesAttended,
          frequency: `${Math.round(frequencyValue)}%`,
          frequencyValue,
          situation,
        });
      }
    }

    reportData.sort((a, b) => a.studentName.localeCompare(b.studentName));
    setVideoData(reportData);
    setEadData([]);
    setCombinedData([]);
  };

  // CORRIGIDA: Versão definitiva para ALL Modalities
  const generateAllModalitiesReport = async () => {
    const eadClasses = await fetchClasses('EAD');
    const videoClasses = await fetchClasses('VIDEOCONFERENCIA');
    const reportData: CombinedReportData[] = [];

    // Processar EAD
    for (const cls of eadClasses) {
      const { data: classStudents } = await supabase
        .from('class_students')
        .select(`
          student_id,
          students ( id, full_name, unit_id )
        `)
        .eq('class_id', cls.id);

      for (const cs of classStudents || []) {
        if (filters.unitId && cs.students?.unit_id !== filters.unitId) {
          continue;
        }

        const { data: accessData } = await supabase
          .from('ead_access')
          .select('access_date_1, access_date_2, access_date_3, is_frequente')
          .eq('class_id', cls.id)
          .eq('student_id', cs.student_id)
          .maybeSingle();

        const access1 = formatDateTime(accessData?.access_date_1);
        const access2 = formatDateTime(accessData?.access_date_2);
        const access3 = formatDateTime(accessData?.access_date_3);
        const isFrequente = accessData?.is_frequente === true;
        const classFinished = isClassFinished(cls.status, cls.end_date);

        let status = '';
        if (classFinished) {
          status = isFrequente ? 'APROVADO' : 'REPROVADO';
        } else {
          status = isFrequente ? 'FREQUENTE (parcial)' : 'NÃO FREQUENTE (parcial)';
        }

        reportData.push({
          studentName: cs.students?.full_name || '',
          courseName: cls.name,
          className: cls.name,
          modality: 'EAD 24h',
          classEndDate: cls.end_date,
          classStatus: getClassStatusDisplay(cls.status, cls.end_date),
          access1,
          access2,
          access3,
          isFrequente,
          status,
        });
      }
    }

    // Processar Videoconferência
    for (const cls of videoClasses) {
      const classesGiven = await getClassesGivenCount(cls.id, cls.end_date, cls.status);
      const classFinished = isClassFinished(cls.status, cls.end_date);

      const { data: classStudents } = await supabase
        .from('class_students')
        .select(`
          student_id,
          students ( id, full_name, unit_id )
        `)
        .eq('class_id', cls.id);

      for (const cs of classStudents || []) {
        if (filters.unitId && cs.students?.unit_id !== filters.unitId) {
          continue;
        }

        const { data: attendanceData } = await supabase
          .from('attendance')
          .select('class_number')
          .eq('class_id', cls.id)
          .eq('student_id', cs.student_id)
          .eq('present', true)
          .lte('class_number', classesGiven);

        const classesAttended = attendanceData?.length || 0;
        const safeClassesAttended = Math.min(classesAttended, classesGiven);
        let frequencyValue = classesGiven > 0 ? (safeClassesAttended / classesGiven) * 100 : 0;
        frequencyValue = Math.min(frequencyValue, 100);

        let situation = '';
        if (classFinished) {
          situation = frequencyValue >= 50 ? 'APROVADO' : 'REPROVADO';
        } else {
          situation = frequencyValue >= 50 ? 'FREQUENTE (parcial)' : 'EM ANDAMENTO';
        }

        reportData.push({
          studentName: cs.students?.full_name || '',
          courseName: cls.name,
          className: cls.name,
          modality: 'Videoconferência',
          classEndDate: cls.end_date,
          classStatus: getClassStatusDisplay(cls.status, cls.end_date),
          totalClasses: cls.total_classes,
          classesGiven,
          classesAttended: safeClassesAttended,
          frequency: `${Math.round(frequencyValue)}%`,
          frequencyValue,
          situation,
        });
      }
    }

    reportData.sort((a, b) => a.studentName.localeCompare(b.studentName));
    setCombinedData(reportData);
    setEadData([]);
    setVideoData([]);
  };

  const exportToXLSX = () => {
    if (filters.modality === 'EAD' && eadData.length > 0) {
      const headers = ['ALUNO', 'CURSO', 'STATUS TURMA', 'TÉRMINO TURMA', 'ACESSO 1', 'ACESSO 2', 'ACESSO 3', 'SITUAÇÃO FINAL'];
      const rows = eadData.map((row) => [
        row.studentName,
        row.courseName,
        row.classStatus,
        formatDate(row.classEndDate),
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
      const headers = ['ALUNO', 'CURSO', 'STATUS TURMA', 'TÉRMINO TURMA', 'AULAS TOTAL', 'AULAS REALIZADAS', 'AULAS ASSISTIDAS', '% FREQUÊNCIA', 'SITUAÇÃO'];
      const rows = videoData.map((row) => [
        row.studentName,
        row.courseName,
        row.classStatus,
        formatDate(row.classEndDate),
        row.totalClasses,
        row.classesGiven,
        row.classesAttended,
        row.frequency,
        row.situation,
      ]);

      const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Relatório Videoconferência');
      XLSX.writeFile(workbook, `relatorio_sintetico_video_${new Date().toISOString().split('T')[0]}.xlsx`);
    } else if (filters.modality === 'ALL' && combinedData.length > 0) {
      const headers = ['ALUNO', 'CURSO', 'MODALIDADE', 'STATUS TURMA', 'TÉRMINO TURMA', 'DADOS ESPECÍFICOS', 'SITUAÇÃO'];
      const rows = combinedData.map((row) => {
        let dadosEspecificos = '';
        if (row.modality === 'EAD 24h') {
          dadosEspecificos = `Acessos: ${row.access1 || '-'} | ${row.access2 || '-'} | ${row.access3 || '-'}`;
        } else {
          dadosEspecificos = `Aulas: ${row.classesAttended}/${row.classesGiven} (Total: ${row.totalClasses}) | Frequência: ${row.frequency}`;
        }
        return [
          row.studentName,
          row.courseName,
          row.modality,
          row.classStatus,
          formatDate(row.classEndDate),
          dadosEspecificos,
          row.status || row.situation || '-',
        ];
      });

      const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Relatório Completo');
      XLSX.writeFile(workbook, `relatorio_sintetico_completo_${new Date().toISOString().split('T')[0]}.xlsx`);
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

    let title = '';
    if (filters.modality === 'EAD') {
      title = 'RELATÓRIO SINTÉTICO - EAD 24h';
    } else if (filters.modality === 'VIDEOCONFERENCIA') {
      title = 'RELATÓRIO SINTÉTICO - VIDEOCONFERÊNCIA';
    } else {
      title = 'RELATÓRIO SINTÉTICO - TODAS MODALIDADES';
    }

    if (filters.classStatus === 'closed') {
      title += ' (APENAS TURMAS FINALIZADAS)';
    } else if (filters.classStatus === 'active') {
      title += ' (APENAS TURMAS EM ANDAMENTO)';
    }

    pdf.text(title, pageWidth / 2, margin + 12, { align: 'center' });

    const tableElement = document.createElement('table');
    tableElement.style.width = '100%';
    tableElement.style.borderCollapse = 'collapse';
    tableElement.style.fontSize = '10px';
    tableElement.style.fontFamily = 'Arial, sans-serif';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headerRow.style.backgroundColor = '#1e293b';

    let headers: string[] = [];

    if (filters.modality === 'EAD') {
      headers = ['ALUNO', 'CURSO', 'STATUS TURMA', 'TÉRMINO', 'ACESSO 1', 'ACESSO 2', 'ACESSO 3', 'SITUAÇÃO'];
    } else if (filters.modality === 'VIDEOCONFERENCIA') {
      headers = ['ALUNO', 'CURSO', 'STATUS TURMA', 'TÉRMINO', 'AULAS TOTAL', 'AULAS REALIZADAS', 'AULAS ASSISTIDAS', 'FREQ.', 'SITUAÇÃO'];
    } else {
      headers = ['ALUNO', 'CURSO', 'MODALIDADE', 'STATUS TURMA', 'TÉRMINO', 'DADOS', 'SITUAÇÃO'];
    }

    headers.forEach(headerText => {
      const th = document.createElement('th');
      th.textContent = headerText;
      th.style.padding = '8px 6px';
      th.style.color = 'white';
      th.style.border = '1px solid #334155';
      th.style.textAlign = 'center';
      th.style.fontWeight = 'bold';
      th.style.fontSize = '9px';
      headerRow.appendChild(th);
    });

    thead.appendChild(headerRow);
    tableElement.appendChild(thead);

    const tbody = document.createElement('tbody');

    if (filters.modality === 'EAD') {
      eadData.forEach((row) => {
        const tr = document.createElement('tr');
        const isFinished = row.classStatus === 'FINALIZADA';
        const bgColor = isFinished 
          ? (row.isFrequente ? '#dcfce7' : '#fee2e2')
          : '#fef3c7';
        tr.style.backgroundColor = bgColor;

        const cells = [
          row.studentName,
          row.courseName,
          row.classStatus,
          formatDate(row.classEndDate),
          row.access1,
          row.access2,
          row.access3,
          row.status,
        ];

        cells.forEach((cellText) => {
          const td = document.createElement('td');
          td.textContent = cellText;
          td.style.padding = '8px 6px';
          td.style.border = '1px solid #cbd5e1';
          td.style.fontSize = '9px';
          td.style.textAlign = 'center';
          tr.appendChild(td);
        });

        tbody.appendChild(tr);
      });
    } else if (filters.modality === 'VIDEOCONFERENCIA') {
      videoData.forEach((row) => {
        const tr = document.createElement('tr');
        const isFinished = row.classStatus === 'FINALIZADA';
        let bgColor = '#ffffff';
        if (isFinished) {
          bgColor = row.frequencyValue >= 50 ? '#dcfce7' : '#fee2e2';
        } else {
          bgColor = '#fef3c7';
        }
        tr.style.backgroundColor = bgColor;

        const cells = [
          row.studentName,
          row.courseName,
          row.classStatus,
          formatDate(row.classEndDate),
          row.totalClasses.toString(),
          row.classesGiven.toString(),
          row.classesAttended.toString(),
          row.frequency,
          row.situation,
        ];

        cells.forEach((cellText) => {
          const td = document.createElement('td');
          td.textContent = cellText;
          td.style.padding = '8px 6px';
          td.style.border = '1px solid #cbd5e1';
          td.style.fontSize = '9px';
          td.style.textAlign = 'center';
          tr.appendChild(td);
        });

        tbody.appendChild(tr);
      });
    } else {
      combinedData.forEach((row) => {
        const tr = document.createElement('tr');
        const isFinished = row.classStatus === 'FINALIZADA';
        let bgColor = '#ffffff';
        if (row.modality === 'EAD 24h') {
          if (isFinished) {
            bgColor = row.isFrequente ? '#dcfce7' : '#fee2e2';
          } else {
            bgColor = '#fef3c7';
          }
        } else {
          if (isFinished) {
            bgColor = (row.frequencyValue || 0) >= 50 ? '#dcfce7' : '#fee2e2';
          } else {
            bgColor = '#fef3c7';
          }
        }
        tr.style.backgroundColor = bgColor;

        const dadosCell = row.modality === 'EAD 24h'
          ? `Acessos: ${row.access1 || '-'} | ${row.access2 || '-'} | ${row.access3 || '-'}`
          : `Aulas: ${row.classesAttended}/${row.classesGiven} (Total: ${row.totalClasses}) | Freq: ${row.frequency}`;

        const cells = [
          row.studentName,
          row.courseName,
          row.modality,
          row.classStatus,
          formatDate(row.classEndDate),
          dadosCell,
          row.status || row.situation || '-',
        ];

        cells.forEach((cellText) => {
          const td = document.createElement('td');
          td.textContent = cellText;
          td.style.padding = '8px 6px';
          td.style.border = '1px solid #cbd5e1';
          td.style.fontSize = '9px';
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
    tempDiv.style.width = '1100px';
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

  const hasData = eadData.length > 0 || videoData.length > 0 || combinedData.length > 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-[1900px] w-full max-h-[90vh] overflow-hidden flex flex-col">
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

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
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
                  <option value="ALL">Todas as Modalidades</option>
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
                  <option value="ALL">Todos os Cursos</option>
                  {filteredCourses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Situação das Turmas
                </label>
                <select
                  value={filters.classStatus}
                  onChange={(e) => setFilters(prev => ({ ...prev, classStatus: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">Todas as turmas</option>
                  <option value="closed">✅ Apenas turmas FINALIZADAS (para prestação de contas)</option>
                  <option value="active">🔄 Apenas turmas EM ANDAMENTO</option>
                </select>
                <p className="text-xs text-slate-500 mt-1">
                  Use "Apenas turmas FINALIZADAS" para relatórios de prestação de contas
                </p>
              </div>
            </div>

            <button
              onClick={generateReport}
              disabled={loading || !filters.modality}
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
                      <thead className="bg-slate-800 text-white">
                        <tr>
                          <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider border border-slate-700">ALUNO</th>
                          <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider border border-slate-700">CURSO</th>
                          <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider border border-slate-700">STATUS TURMA</th>
                          <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider border border-slate-700">TÉRMINO</th>
                          <th colSpan={3} className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider border border-slate-700">ÚLTIMOS ACESSOS</th>
                          <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider border border-slate-700">SITUAÇÃO</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {eadData.map((row, index) => {
                          const isFinished = row.classStatus === 'FINALIZADA';
                          const bgColor = isFinished 
                            ? (row.isFrequente ? 'bg-green-50' : 'bg-red-50')
                            : 'bg-amber-50';
                          return (
                            <tr key={index} className={bgColor}>
                              <td className="px-4 py-3 text-sm text-slate-800 border border-slate-200">{row.studentName}</td>
                              <td className="px-4 py-3 text-sm text-slate-800 border border-slate-200">{row.courseName}</td>
                              <td className="px-4 py-3 text-sm text-center border border-slate-200">
                                <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                                  isFinished ? 'bg-gray-100 text-gray-800' : 'bg-amber-100 text-amber-800'
                                }`}>
                                  {row.classStatus}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-sm text-center text-slate-800 border border-slate-200">
                                {formatDate(row.classEndDate) || '-'}
                              </td>
                              <td className="px-4 py-3 text-sm text-center text-slate-800 border border-slate-200">{row.access1 || '-'}</td>
                              <td className="px-4 py-3 text-sm text-center text-slate-800 border border-slate-200">{row.access2 || '-'}</td>
                              <td className="px-4 py-3 text-sm text-center text-slate-800 border border-slate-200">{row.access3 || '-'}</td>
                              <td className="px-4 py-3 text-sm text-center font-bold border border-slate-200">
                                <span className={`inline-flex px-3 py-1 rounded-full text-xs font-bold ${
                                  row.status.includes('APROVADO') 
                                    ? 'bg-green-500 text-white' 
                                    : row.status.includes('REPROVADO')
                                    ? 'bg-red-500 text-white'
                                    : 'bg-amber-500 text-white'
                                }`}>
                                  {row.status}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}

                  {filters.modality === 'VIDEOCONFERENCIA' && videoData.length > 0 && (
                    <table className="w-full">
                      <thead className="bg-slate-800 text-white">
                        <tr>
                          <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider border border-slate-700">ALUNO</th>
                          <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider border border-slate-700">CURSO</th>
                          <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider border border-slate-700">STATUS TURMA</th>
                          <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider border border-slate-700">TÉRMINO</th>
                          <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider border border-slate-700">AULAS TOTAL</th>
                          <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider border border-slate-700">AULAS REALIZADAS</th>
                          <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider border border-slate-700">AULAS ASSISTIDAS</th>
                          <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider border border-slate-700">% FREQ</th>
                          <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider border border-slate-700">SITUAÇÃO</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {videoData.map((row, index) => {
                          const isFinished = row.classStatus === 'FINALIZADA';
                          let bgColor = 'bg-white';
                          if (isFinished) {
                            bgColor = row.frequencyValue >= 50 ? 'bg-green-50' : 'bg-red-50';
                          } else {
                            bgColor = 'bg-amber-50';
                          }
                          return (
                            <tr key={index} className={bgColor}>
                              <td className="px-4 py-3 text-sm text-slate-800 border border-slate-200">{row.studentName}</td>
                              <td className="px-4 py-3 text-sm text-slate-800 border border-slate-200">{row.courseName}</td>
                              <td className="px-4 py-3 text-sm text-center border border-slate-200">
                                <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                                  isFinished ? 'bg-gray-100 text-gray-800' : 'bg-amber-100 text-amber-800'
                                }`}>
                                  {row.classStatus}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-sm text-center text-slate-800 border border-slate-200">
                                {formatDate(row.classEndDate) || '-'}
                              </td>
                              <td className="px-4 py-3 text-sm text-center text-slate-800 border border-slate-200">{row.totalClasses}</td>
                              <td className="px-4 py-3 text-sm text-center text-slate-800 border border-slate-200">{row.classesGiven}</td>
                              <td className="px-4 py-3 text-sm text-center text-slate-800 border border-slate-200">{row.classesAttended}</td>
                              <td className="px-4 py-3 text-sm text-center font-bold text-slate-800 border border-slate-200">
                                {row.frequency}
                                {row.frequencyValue > 100 && (
                                  <span className="ml-1 text-xs text-red-500" title="Valor corrigido">*</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-sm text-center border border-slate-200">
                                <span className={`inline-flex px-3 py-1 rounded-full text-xs font-bold ${
                                  row.situation.includes('APROVADO') 
                                    ? 'bg-green-500 text-white' 
                                    : row.situation.includes('REPROVADO')
                                    ? 'bg-red-500 text-white'
                                    : 'bg-amber-500 text-white'
                                }`}>
                                  {row.situation}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}

                  {filters.modality === 'ALL' && combinedData.length > 0 && (
                    <table className="w-full">
                      <thead className="bg-slate-800 text-white">
                        <tr>
                          <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider border border-slate-700">ALUNO</th>
                          <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider border border-slate-700">CURSO</th>
                          <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider border border-slate-700">MODALIDADE</th>
                          <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider border border-slate-700">STATUS TURMA</th>
                          <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider border border-slate-700">TÉRMINO</th>
                          <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider border border-slate-700">DADOS</th>
                          <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider border border-slate-700">SITUAÇÃO</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {combinedData.map((row, index) => {
                          const isFinished = row.classStatus === 'FINALIZADA';
                          let bgColor = 'bg-white';
                          if (row.modality === 'EAD 24h') {
                            if (isFinished) {
                              bgColor = row.isFrequente ? 'bg-green-50' : 'bg-red-50';
                            } else {
                              bgColor = 'bg-amber-50';
                            }
                          } else {
                            if (isFinished) {
                              bgColor = (row.frequencyValue || 0) >= 50 ? 'bg-green-50' : 'bg-red-50';
                            } else {
                              bgColor = 'bg-amber-50';
                            }
                          }
                          const situacao = row.status || row.situation || '-';
                          return (
                            <tr key={index} className={bgColor}>
                              <td className="px-4 py-3 text-sm text-slate-800 border border-slate-200">{row.studentName}</td>
                              <td className="px-4 py-3 text-sm text-slate-800 border border-slate-200">{row.courseName}</td>
                              <td className="px-4 py-3 text-sm text-center text-slate-800 border border-slate-200">{row.modality}</td>
                              <td className="px-4 py-3 text-sm text-center border border-slate-200">
                                <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                                  isFinished ? 'bg-gray-100 text-gray-800' : 'bg-amber-100 text-amber-800'
                                }`}>
                                  {row.classStatus}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-sm text-center text-slate-800 border border-slate-200">
                                {formatDate(row.classEndDate) || '-'}
                              </td>
                              <td className="px-4 py-3 text-sm text-slate-800 border border-slate-200">
                                {row.modality === 'EAD 24h' ? (
                                  <div className="space-y-1 text-xs">
                                    <div><strong>Acessos:</strong> {row.access1 || '-'} | {row.access2 || '-'} | {row.access3 || '-'}</div>
                                  </div>
                                ) : (
                                  <div className="space-y-1 text-xs">
                                    <div><strong>Aulas:</strong> {row.classesAttended}/{row.classesGiven} (Total: {row.totalClasses})</div>
                                    <div><strong>Frequência:</strong> {row.frequency}</div>
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3 text-sm text-center border border-slate-200">
                                <span className={`inline-flex px-3 py-1 rounded-full text-xs font-bold ${
                                  situacao.includes('APROVADO') 
                                    ? 'bg-green-500 text-white' 
                                    : situacao.includes('REPROVADO')
                                    ? 'bg-red-500 text-white'
                                    : 'bg-amber-500 text-white'
                                }`}>
                                  {situacao}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              <div className="mt-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
                <h4 className="text-xs font-semibold text-slate-700 mb-2">Legenda:</h4>
                <div className="flex flex-wrap gap-4 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-green-50 border border-green-200 rounded"></div>
                    <span className="text-slate-600">Turma Finalizada - APROVADO/FREQUENTE</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-red-50 border border-red-200 rounded"></div>
                    <span className="text-slate-600">Turma Finalizada - REPROVADO/NÃO FREQUENTE</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-amber-50 border border-amber-200 rounded"></div>
                    <span className="text-slate-600">Turma EM ANDAMENTO (status parcial)</span>
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  ⚠️ Para prestação de contas, utilize o filtro "Apenas turmas FINALIZADAS"
                </p>
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
