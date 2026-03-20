import { useState, useEffect } from 'react';
import { Plus, Calendar, CreditCard as Edit2, Save, X, GraduationCap, Users, CheckSquare, Eye, Award, User, Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { CertificateModal } from './CertificateModal';
import { CertificateModalEAD } from './CertificateModalEAD';
import { 
  formatDateToDisplay, 
  forceDateToDisplay, 
  formatDateToDatabase, 
  extractDatePart, 
  isDateGreaterOrEqual,
  formatDateInput,
  parseDateInput,
  formatDateForInput,
  isValidDate,
  compareDates,
  isDateInRange
} from '../../utils/dateUtils';

interface Cycle {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: 'active' | 'closed';
  created_at: string;
  _count?: { classes: number };
}

interface Course {
  id: string;
  name: string;
  modality: string;
}

interface Class {
  id: string;
  course_id: string;
  cycle_id: string;
  name: string;
  day_of_week: string;
  days_of_week?: string[];
  class_time: string;
  total_classes: number;
  modality: 'EAD' | 'VIDEOCONFERENCIA';
  status: 'active' | 'closed';
  courses?: { name: string; modality: string };
  _count?: { students: number };
}

interface Student {
  id: string;
  full_name: string;
}

// ===========================================
// FUNÇÃO CORRIGIDA - EAD (3 ACESSOS, QUALQUER DATA)
// ===========================================
function validateEADAccess(
  access_date_1: string | null, 
  access_date_2: string | null, 
  access_date_3: string | null
): boolean {
  const dates = [access_date_1, access_date_2, access_date_3].filter(Boolean);
  return dates.length > 0; // ✅ Aluno frequente se tiver PELO MENOS 1 acesso
}

// Função para contar aulas já realizadas
async function getTotalClassesGiven(classId: string): Promise<number> {
  const { data } = await supabase
    .from('attendance')
    .select('class_number')
    .eq('class_id', classId);

  if (!data) return 0;

  const uniqueClasses = [...new Set(data.map(a => a.class_number))];
  console.log('🔍 getTotalClassesGiven - class_id:', classId);
  console.log('🔍 Dados retornados:', data);
  console.log('🔍 Números únicos de aula:', uniqueClasses);
  console.log('🔍 Total calculado:', uniqueClasses.length);
  return uniqueClasses.length;
}

// ===========================================
// FUNÇÃO CORRIGIDA - VIDEOCONFERÊNCIA
// ===========================================
// ===========================================
async function calculateAttendancePercentage(
  classId: string, 
  studentId: string, 
  enrollmentDate?: string | null
): Promise<{ 
  percentage: number; 
  presentCount: number; 
  totalClassesToConsider: number; 
  isProportional: boolean 
}> {
  
  // Buscar todas as frequências do aluno
  const { data: attendances } = await supabase
    .from('attendance')
    .select('class_date, present, class_number')
    .eq('class_id', classId)
    .eq('student_id', studentId)
    .order('class_date');

  if (!attendances || attendances.length === 0) {
    return { 
      percentage: 0, 
      presentCount: 0, 
      totalClassesToConsider: 0, 
      isProportional: false 
    };
  }

  // Buscar todas as aulas que já foram realizadas na turma (para ter a lista completa)
  const { data: allClassAttendances } = await supabase
    .from('attendance')
    .select('class_number, class_date')
    .eq('class_id', classId)
    .order('class_number');

  if (!allClassAttendances || allClassAttendances.length === 0) {
    return { 
      percentage: 0, 
      presentCount: 0, 
      totalClassesToConsider: 0, 
      isProportional: false 
    };
  }

  // Obter números únicos de aulas realizadas
  const uniqueClassNumbers = [...new Set(allClassAttendances.map(a => a.class_number))];
  const totalClassesGiven = uniqueClassNumbers.length;

  let filteredAttendances = attendances;
  let isProportional = false;
  let totalClassesToConsider = totalClassesGiven;

  // Se tem data de matrícula (excepcional), filtrar apenas aulas APÓS a matrícula
  if (enrollmentDate) {
    isProportional = true;
    
    // Filtrar as aulas que ocorreram APÓS a data de matrícula
    const classesAfterEnrollment = allClassAttendances.filter(a => {
      const classDatePart = extractDatePart(a.class_date);
      return classDatePart && classDatePart >= enrollmentDate;
    });
    
    // Número de aulas que ocorreram após a matrícula
    totalClassesToConsider = classesAfterEnrollment.length;
    
    // Filtrar apenas as frequências do aluno para aulas após a matrícula
    filteredAttendances = attendances.filter(a => {
      const classDatePart = extractDatePart(a.class_date);
      return classDatePart && classDatePart >= enrollmentDate;
    });
  }

  // Contar presenças apenas nas aulas consideradas
  const presentCount = filteredAttendances.filter(a => a.present).length;
  
  // Calcular porcentagem baseada no total de aulas que deveriam ser consideradas
  const percentage = totalClassesToConsider > 0 
    ? (presentCount / totalClassesToConsider) * 100 
    : 0;

  return {
    percentage,
    presentCount,
    totalClassesToConsider,
    isProportional
  };
}

// ===========================================
// FUNÇÃO: updateStudentStatusOnClose (OTIMIZADA)
// MELHORIAS: Logs mais claros, validações adicionais
// ===========================================

async function updateStudentStatusOnClose(
  classId: string, 
  studentId: string, 
  classData?: any, 
  studentData?: any
) {
  try {
    // Carregar dados se não fornecidos
    if (!classData) {
      const { data } = await supabase
        .from('classes')
        .select('*, cycles(*)')
        .eq('id', classId)
        .single();
      classData = data;
    }

    if (!studentData) {
      const { data } = await supabase
        .from('class_students')
        .select('*, students(*)')
        .eq('class_id', classId)
        .eq('student_id', studentId)
        .single();
      studentData = data;
    }

    // Verificar status do ciclo
    const { data: cycleData } = await supabase
      .from('cycles')
      .select('*')
      .eq('id', classData.cycle_id)
      .single();

    const today = new Date().toISOString().split('T')[0];
    const isCycleActive = cycleData?.status === 'active' && today <= cycleData?.end_date;

    // Se ciclo ainda está ativo, não definir situação final
    if (isCycleActive) {
      console.log(`⏳ Ciclo ativo - aluno ${studentId} mantido como em_andamento`);
      return 'em_andamento';
    }

    let currentStatus = 'em_andamento';
    let isApproved = false;
    let detalhesAprovacao = '';

    if (classData.modality === 'VIDEOCONFERENCIA') {
      // Código existente para videoconferência
      const enrollmentDate = extractDatePart(studentData?.enrollment_date);
      const isExceptional = studentData?.enrollment_type === 'exceptional';
      
      const { percentage } = await calculateAttendancePercentage(
        classId, 
        studentId, 
        isExceptional ? enrollmentDate : null
      );
      
      isApproved = percentage >= 60;
      detalhesAprovacao = `Frequência: ${percentage.toFixed(1)}%`;
      
    } else {
      // ===========================================
      // EAD: REGRA CORRETA - BASEADA EM is_frequente
      // ===========================================
      const { data: accessData } = await supabase
        .from('ead_access')
        .select('is_frequente, access_date_1, access_date_2, access_date_3')
        .eq('class_id', classId)
        .eq('student_id', studentId)
        .maybeSingle();

      // ✅ REGRA DEFINITIVA: Aprovado APENAS se is_frequente for TRUE
      isApproved = accessData?.is_frequente === true;
      
      // Contar acessos apenas para informação
      const totalAcessos = [
        accessData?.access_date_1,
        accessData?.access_date_2,
        accessData?.access_date_3
      ].filter(Boolean).length;
      
      detalhesAprovacao = isApproved 
        ? `✅ Frequente manualmente (${totalAcessos}/3 acessos registrados)`
        : `❌ Não frequente (${totalAcessos}/3 acessos registrados)`;

      console.log(`🎓 Aluno EAD ${studentId}:`, {
        isFrequente: accessData?.is_frequente,
        totalAcessos,
        aprovado: isApproved,
        criterio: isApproved 
          ? 'Aprovado por frequência manual' 
          : 'Reprovado - não marcado como frequente'
      });
    }
    
    currentStatus = isApproved ? 'aprovado' : 'reprovado';

    // Atualizar status no banco
    const { error: updateError } = await supabase
      .from('class_students')
      .update({
        current_status: currentStatus,
        status_updated_at: new Date().toISOString()
      })
      .eq('class_id', classId)
      .eq('student_id', studentId);

    if (updateError) {
      console.error('Erro ao atualizar status:', updateError);
      throw updateError;
    }

    // Log de sucesso
    console.log(`✅ Status atualizado - Aluno ${studentId}: ${currentStatus} (${detalhesAprovacao})`);

    return currentStatus;
    
  } catch (error) {
    console.error('❌ Error updating student status:', error);
    return null;
  }
}

// ===========================================
// FUNÇÃO CORRIGIDA - ATUALIZAR TURMA INTEIRA
// ===========================================
// ===========================================
// FUNÇÃO: updateAllStudentsStatusOnClose (MELHORADA)
// MELHORIAS: Logs mais detalhados para EAD
// ===========================================

async function updateAllStudentsStatusOnClose(classId: string) {
  try {
    console.log(`🚀 Iniciando encerramento da turma: ${classId}`);
    
    const { data: classData } = await supabase
      .from('classes')
      .select('*, cycles(*)')
      .eq('id', classId)
      .single();

    const { data: students } = await supabase
      .from('class_students')
      .select('student_id, enrollment_date, enrollment_type, students(full_name)')
      .eq('class_id', classId);

    if (!students || students.length === 0) {
      console.log('ℹ️ Nenhum aluno matriculado na turma');
      await supabase
        .from('classes')
        .update({ status: 'closed' })
        .eq('id', classId);
      return;
    }

    let aprovados = 0;
    let reprovados = 0;
    const detalhes: string[] = [];

    for (const student of students) {
      const status = await updateStudentStatusOnClose(classId, student.student_id, classData, student);
      
      if (classData.modality === 'VIDEOCONFERENCIA') {
        // ... código existente para videoconferência ...
        
      } else if (classData.modality === 'EAD') {
        // ===========================================
        // EAD: BUSCAR DETALHES PARA RELATÓRIO
        // ===========================================
        const { data: accessData } = await supabase
          .from('ead_access')
          .select('is_frequente, access_date_1, access_date_2, access_date_3')
          .eq('class_id', classId)
          .eq('student_id', student.student_id)
          .maybeSingle();
        
        // ✅ REGRA CORRETA: Aprovado se is_frequente = true
        const isApproved = accessData?.is_frequente === true;
        
        // Contar acessos registrados (apenas informação)
        const totalAcessos = [
          accessData?.access_date_1,
          accessData?.access_date_2,
          accessData?.access_date_3
        ].filter(Boolean).length;
        
        // Listar as datas para debug
        const datasAcesso = [
          accessData?.access_date_1 ? formatDateToDisplay(accessData.access_date_1) : '---',
          accessData?.access_date_2 ? formatDateToDisplay(accessData.access_date_2) : '---',
          accessData?.access_date_3 ? formatDateToDisplay(accessData.access_date_3) : '---'
        ].join(' | ');
        
        detalhes.push(
          `👤 ${student.students?.full_name || student.student_id}:\n` +
          `   📊 Frequência: ${isApproved ? '✅ FREQUENTE' : '❌ NÃO FREQUENTE'}\n` +
          `   📅 Acessos: ${totalAcessos}/3 (${datasAcesso})\n` +
          `   📝 Tipo: ${student.enrollment_type === 'exceptional' ? 'Excepcional' : 'Regular'}`
        );
      }
      
      if (status === 'aprovado') aprovados++;
      if (status === 'reprovado') reprovados++;
    }

    // Fechar a turma
    await supabase
      .from('classes')
      .update({ status: 'closed' })
      .eq('id', classId);

    // ===========================================
    // RELATÓRIO FINAL PERSONALIZADO
    // ===========================================
    const relatorioFinal = classData.modality === 'EAD' 
      ? `✅ TURMA EAD ENCERRADA!\n\n` +
        `📊 RESULTADO FINAL (baseado em FREQUÊNCIA MANUAL):\n` +
        `✅ Aprovados: ${aprovados} alunos (marcados como frequentes)\n` +
        `❌ Reprovados: ${reprovados} alunos (marcados como não frequentes)\n\n` +
        `📋 DETALHAMENTO POR ALUNO:\n${detalhes.join('\n\n')}\n\n` +
        `ℹ️ ATENÇÃO: A aprovação é baseada no campo "Frequência" (checkbox manual), ` +
        `NÃO na quantidade de acessos. Um aluno pode ter 3 acessos mas ser reprovado ` +
        `se não foi marcado como frequente, e vice-versa.`
      
      : `✅ TURMA DE VIDEOCONFERÊNCIA ENCERRADA!\n\n` +
        `📊 RESULTADO FINAL (baseado em % de presenças):\n` +
        `✅ Aprovados: ${aprovados} alunos (frequência ≥ 60%)\n` +
        `❌ Reprovados: ${reprovados} alunos (frequência < 60%)\n\n` +
        `📋 DETALHAMENTO:\n${detalhes.join('\n')}`;

    alert(relatorioFinal);
    
    // Log para auditoria
    console.log('📊 Relatório de encerramento:', {
      turma: classData.name,
      modalidade: classData.modality,
      aprovados,
      reprovados,
      total: students.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error updating all students status:', error);
    alert('Erro ao encerrar turma. Verifique o console para mais detalhes.');
  }
}

// ===========================================
// COMPONENTE PRINCIPAL - CyclesTab
// ===========================================
export function CyclesTab() {
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingCycle, setEditingCycle] = useState<Cycle | null>(null);
  const [managingCycle, setManagingCycle] = useState<Cycle | null>(null);
  const { user } = useAuth();

  const [formData, setFormData] = useState({
    name: '',
    start_date: '',
    end_date: '',
  });

  useEffect(() => {
    loadCycles();
  }, []);

  const loadCycles = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('cycles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading cycles:', error);
      return;
    }

    const cyclesWithCount = await Promise.all(
      (data || []).map(async (cycle) => {
        const { count } = await supabase
          .from('classes')
          .select('*', { count: 'exact', head: true })
          .eq('cycle_id', cycle.id);

        return { ...cycle, _count: { classes: count || 0 } };
      })
    );

    setCycles(cyclesWithCount);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (new Date(formData.end_date) < new Date(formData.start_date)) {
      alert('A data de fim deve ser posterior à data de início');
      return;
    }

    if (editingCycle) {
      const { error } = await supabase
        .from('cycles')
        .update({
          name: formData.name,
          start_date: formData.start_date,
          end_date: formData.end_date,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingCycle.id);

      if (error) {
        console.error('Error updating cycle:', error);
        alert('Erro ao atualizar ciclo');
        return;
      }

      alert('Ciclo atualizado com sucesso!');
    } else {
      const { error } = await supabase.from('cycles').insert([
        {
          user_id: user.id,
          name: formData.name,
          start_date: formData.start_date,
          end_date: formData.end_date,
          status: 'active',
        },
      ]);

      if (error) {
        console.error('Error creating cycle:', error);
        alert('Erro ao criar ciclo');
        return;
      }

      alert('Ciclo iniciado com sucesso!');
    }

    resetForm();
    loadCycles();
  };

  const resetForm = () => {
    setShowModal(false);
    setEditingCycle(null);
    setFormData({
      name: '',
      start_date: '',
      end_date: '',
    });
  };

  const handleEdit = (cycle: Cycle) => {
    setEditingCycle(cycle);
    setFormData({
      name: cycle.name,
      start_date: cycle.start_date,
      end_date: cycle.end_date,
    });
    setShowModal(true);
  };

  const handleCloseCycle = async (cycleId: string) => {
    if (!confirm('Tem certeza que deseja encerrar este ciclo? Esta ação não pode ser desfeita.')) return;

    const { data: classes } = await supabase
      .from('classes')
      .select('id, modality, total_classes')
      .eq('cycle_id', cycleId);

    if (classes) {
      for (const cls of classes) {
        await updateAllStudentsStatusOnClose(cls.id);
        
        const { error } = await supabase
          .from('classes')
          .update({ status: 'closed' })
          .eq('id', cls.id);

        if (error) {
          console.error('Error closing class:', error);
        }
      }
    }

    const { error } = await supabase
      .from('cycles')
      .update({
        status: 'closed',
        updated_at: new Date().toISOString()
      })
      .eq('id', cycleId);

    if (error) {
      console.error('Error closing cycle:', error);
      alert('Erro ao encerrar ciclo');
      return;
    }

    alert('Ciclo encerrado com sucesso!');
    loadCycles();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-slate-800">Ciclos</h2>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          <span>Iniciar Ciclo</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {cycles.map((cycle) => (
          <div
            key={cycle.id}
            className="bg-white border border-slate-200 rounded-lg p-5 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <Calendar className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800">{cycle.name}</h3>
                  <p className="text-sm text-slate-600">
                    {cycle._count?.classes || 0} {cycle._count?.classes === 1 ? 'turma' : 'turmas'}
                  </p>
                </div>
              </div>
              <span
                className={`px-2 py-1 rounded-full text-xs font-medium ${
                  cycle.status === 'active'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {cycle.status === 'active' ? 'Ativo' : 'Encerrado'}
              </span>
            </div>

            <div className="space-y-2 text-sm text-slate-600 mb-4">
              <div className="flex items-center space-x-2">
                <Calendar className="w-4 h-4" />
                <span>
                  Início: {formatDateToDisplay(cycle.start_date)}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <Calendar className="w-4 h-4" />
                <span>
                  Fim: {formatDateToDisplay(cycle.end_date)}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <button
                onClick={() => setManagingCycle(cycle)}
                className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
              >
                Gerenciar Turmas
              </button>
              <div className="flex space-x-2">
                <button
                  onClick={() => handleEdit(cycle)}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                >
                  Editar Datas
                </button>
                {cycle.status === 'active' && (
                  <button
                    onClick={() => handleCloseCycle(cycle.id)}
                    className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
                  >
                    Encerrar Ciclo
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
        {cycles.length === 0 && (
          <div className="col-span-full text-center py-12 text-slate-500">
            <Calendar className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p>Nenhum ciclo cadastrado</p>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl
            w-[95vw] sm:w-[85vw] md:w-[70vw] lg:w-[60vw] xl:w-[50vw] max-w-3xl
            max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h3 className="text-xl font-bold text-slate-800 mb-4">
                {editingCycle ? 'Editar Ciclo' : 'Iniciar Novo Ciclo'}
              </h3>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Nome do Ciclo
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    placeholder="Ex: Ciclo 2024.1"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Data de Início
                    </label>
                    <input
                      type="date"
                      value={formData.start_date}
                      onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                      required
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Data de Fim
                    </label>
                    <input
                      type="date"
                      value={formData.end_date}
                      onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                      required
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>
                </div>

                <div className="flex space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={resetForm}
                    className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    {editingCycle ? 'Atualizar' : 'Iniciar Ciclo'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {managingCycle && (
        <CycleClassesModal
          cycle={managingCycle}
          onClose={() => {
            setManagingCycle(null);
            loadCycles();
          }}
        />
      )}
    </div>
  );
}

// ===========================================
// COMPONENTE - CycleClassesModal
// ===========================================
interface CycleClassesModalProps {
  cycle: Cycle;
  onClose: () => void;
}

function CycleClassesModal({ cycle, onClose }: CycleClassesModalProps) {
  const [classes, setClasses] = useState<Class[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [showClassModal, setShowClassModal] = useState(false);
  const [selectedClass, setSelectedClass] = useState<Class | null>(null);
  const { user } = useAuth();

  const [formData, setFormData] = useState({
    course_id: '',
    name: '',
    day_of_week: 'Segunda-feira',
    days_of_week: [] as string[],
    class_time: '',
    total_classes: '',
    modality: 'VIDEOCONFERENCIA' as 'EAD' | 'VIDEOCONFERENCIA',
  });

  useEffect(() => {
    loadCourses();
    loadClasses();
  }, []);

  const loadCourses = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('courses')
      .select('id, name, modality')
      .order('name');

    if (error) {
      console.error('Error loading courses:', error);
      return;
    }

    setCourses(data || []);
  };

  const loadClasses = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('classes')
      .select('*, courses(name, modality)')
      .eq('cycle_id', cycle.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading classes:', error);
      return;
    }

    const classesWithCount = await Promise.all(
      (data || []).map(async (cls) => {
        const { count } = await supabase
          .from('class_students')
          .select('*', { count: 'exact', head: true })
          .eq('class_id', cls.id);

        return { ...cls, _count: { students: count || 0 } };
      })
    );

    setClasses(classesWithCount);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const classData: any = {
      user_id: user.id,
      cycle_id: cycle.id,
      course_id: formData.course_id,
      name: formData.name.trim(),
      modality: formData.modality,
      status: 'active',
    };

    if (formData.modality === 'VIDEOCONFERENCIA') {
      if (formData.days_of_week.length > 0) {
        classData.day_of_week = formData.days_of_week.join(', ');
      } else {
        classData.day_of_week = formData.day_of_week;
      }
      classData.class_time = formData.class_time;
      const totalClasses = parseInt(formData.total_classes);
      if (isNaN(totalClasses) || totalClasses <= 0) {
        alert('Por favor, informe um número válido de aulas (maior que 0)');
        return;
      }
      classData.total_classes = totalClasses;
    } else {
      classData.day_of_week = '';
      classData.class_time = '';
      classData.total_classes = 1;
    }

    const { error } = await supabase.from('classes').insert([classData]);

    if (error) {
      console.error('Error adding class:', error);
      alert(`Erro ao adicionar turma: ${error.message}`);
      return;
    }

    alert('Turma criada com sucesso!');
    resetForm();
    loadClasses();
  };

  const resetForm = () => {
    setShowClassModal(false);
    setFormData({
      course_id: '',
      name: '',
      day_of_week: 'Segunda-feira',
      days_of_week: [],
      class_time: '',
      total_classes: '',
      modality: 'VIDEOCONFERENCIA',
    });
  };

  const handleCourseChange = (courseId: string) => {
    const course = courses.find((c) => c.id === courseId);
    setFormData({
      ...formData,
      course_id: courseId,
      modality: (course?.modality || 'VIDEOCONFERENCIA') as 'EAD' | 'VIDEOCONFERENCIA',
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl
        w-[98vw] md:w-[95vw] lg:w-[92vw] xl:w-[88vw] 2xl:w-[85vw] max-w-[1900px]
        p-4 md:p-6 my-4 md:my-8 max-h-[95vh] md:max-h-[90vh] overflow-y-auto">
        
        <div className="flex justify-between items-start mb-6">
          <div>
            <h3 className="text-2xl font-bold text-slate-800">Gerenciar Turmas</h3>
            <p className="text-slate-600 text-lg">{cycle.name}</p>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-sm text-slate-600">
                {formatDateToDisplay(cycle.start_date)} até {formatDateToDisplay(cycle.end_date)}
              </span>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                cycle.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'
              }`}>
                {cycle.status === 'active' ? 'Ativo' : 'Encerrado'}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-3xl p-1">
            ×
          </button>
        </div>

        <div className="mb-6">
          <button
            onClick={() => setShowClassModal(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
            <span>Nova Turma</span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {classes.map((cls) => (
            <div
              key={cls.id}
              className="bg-white border border-slate-200 rounded-lg p-5 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <GraduationCap className="w-6 h-6 text-green-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-800">{cls.name}</h3>
                    <p className="text-sm text-slate-600">{cls.courses?.name}</p>
                  </div>
                </div>
                <span
                  className={`px-2 py-1 rounded-full text-xs font-medium ${
                    cls.status === 'active'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {cls.status === 'active' ? 'Ativa' : 'Encerrada'}
                </span>
              </div>

              <div className="space-y-2 text-sm text-slate-600 mb-4">
                {cls.modality === 'VIDEOCONFERENCIA' && (
                  <>
                    <div className="flex items-center space-x-2">
                      <Calendar className="w-4 h-4" />
                      <span>
                        {cls.day_of_week} às {cls.class_time}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <CheckSquare className="w-4 h-4" />
                      <span>{cls.total_classes} aulas previstas no ciclo</span>
                    </div>
                  </>
                )}
                <div className="flex items-center space-x-2">
                  <Users className="w-4 h-4" />
                  <span>{cls._count?.students || 0} alunos matriculados</span>
                </div>
                <span
                  className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                    cls.modality === 'EAD'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {cls.modality === 'EAD' ? 'EAD 24h' : 'Videoconferência'}
                </span>
              </div>

              <button
                onClick={() => setSelectedClass(cls)}
                className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
              >
                Gerenciar Turma
              </button>
            </div>
          ))}
          {classes.length === 0 && (
            <div className="col-span-full text-center py-12 text-slate-500">
              <GraduationCap className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <p>Nenhuma turma cadastrada neste ciclo</p>
            </div>
          )}
        </div>

        {showClassModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
            <div className="bg-white rounded-xl shadow-xl
              w-[95vw] md:w-[85vw] lg:w-[75vw] xl:w-[65vw] max-w-4xl
              max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <h3 className="text-xl font-bold text-slate-800 mb-4">Nova Turma</h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Curso</label>
                    <select
                      value={formData.course_id}
                      onChange={(e) => handleCourseChange(e.target.value)}
                      required
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    >
                      <option value="">Selecione um curso</option>
                      {courses.map((course) => (
                        <option key={course.id} value={course.id}>
                          {course.name} - {course.modality}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Nome da Turma</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                      placeholder="Ex: Turma A - 2024"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>

                  {formData.modality === 'VIDEOCONFERENCIA' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                          Dias da Semana
                        </label>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                          {['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo'].map((day) => (
                            <label key={day} className="flex items-center space-x-2 p-2 border border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50">
                              <input
                                type="checkbox"
                                checked={formData.days_of_week.includes(day)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setFormData({ ...formData, days_of_week: [...formData.days_of_week, day] });
                                  } else {
                                    setFormData({ ...formData, days_of_week: formData.days_of_week.filter(d => d !== day) });
                                  }
                                }}
                                className="rounded text-green-600"
                              />
                              <span className="text-sm">{day}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-2">Horário</label>
                          <input
                            type="time"
                            value={formData.class_time}
                            onChange={(e) => setFormData({ ...formData, class_time: e.target.value })}
                            required
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-2">Total de Aulas</label>
                          <input
                            type="number"
                            value={formData.total_classes}
                            onChange={(e) => setFormData({ ...formData, total_classes: e.target.value })}
                            required
                            min="1"
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                          />
                        </div>
                      </div>
                    </>
                  )}

                  <div className="sticky bottom-0 bg-white pt-4 border-t border-slate-200">
                    <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-3">
                      <button
                        type="button"
                        onClick={resetForm}
                        className="w-full sm:flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className="w-full sm:flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                      >
                        Criar Turma
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {selectedClass && (
          <ClassManagementModal
            classData={selectedClass}
            onClose={() => {
              setSelectedClass(null);
              loadClasses();
            }}
          />
        )}
      </div>
    </div>
  );
}

// ===========================================
// COMPONENTE - ClassManagementModal
// ===========================================
function ClassManagementModal({ classData, onClose }: ClassManagementModalProps) {
  const [tab, setTab] = useState<'students' | 'attendance' | 'close'>('students');
  const [students, setStudents] = useState<any[]>([]);
  const [availableStudents, setAvailableStudents] = useState<Student[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [studentSearchTerm, setStudentSearchTerm] = useState('');
  const [showCertificate, setShowCertificate] = useState(false);
  const [certificateData, setCertificateData] = useState<any>(null);
  const [showEnrollmentModal, setShowEnrollmentModal] = useState(false);
  const [enrollmentType, setEnrollmentType] = useState<'regular' | 'exceptional'>('regular');
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [enrollmentSearch, setEnrollmentSearch] = useState('');
  const [enrollmentDate, setEnrollmentDate] = useState(new Date().toISOString().split('T')[0]);
  const [cycleStartDate, setCycleStartDate] = useState<string>('');
  const [cycleEndDate, setCycleEndDate] = useState<string>('');
  const [cycleStatus, setCycleStatus] = useState<string>('');
  const [totalClassesGiven, setTotalClassesGiven] = useState<number>(0);
  const [nextClassNumber, setNextClassNumber] = useState(1);
  const { user } = useAuth();

  // NOVO: Estado para controle do modal de edição de matrícula
  const [editEnrollmentModal, setEditEnrollmentModal] = useState<{
    show: boolean;
    student: any;
    enrollmentDate: string;
    enrollmentType: 'regular' | 'exceptional';
  } | null>(null);

  // Função para buscar o próximo número de aula
  const loadNextClassNumber = async () => {
    const { data, error } = await supabase.rpc('get_next_class_number', {
      p_class_id: classData.id
    });
    if (!error && data) {
      setNextClassNumber(data);
      console.log('Próxima aula carregada:', data); // debug
    }
  };

  // Efeito inicial: carrega todos os dados ao abrir o modal
  useEffect(() => {
    loadCycleData();
    loadClassStudents();
    loadAvailableStudents();
    loadTotalClassesGiven();
    loadNextClassNumber(); // <-- ADICIONADO: carrega o próximo número já na abertura
  }, []);

  // Efeito para recarregar dados sempre que a aba mudar para 'attendance'
  useEffect(() => {
    if (tab === 'attendance') {
      loadNextClassNumber();
      loadTotalClassesGiven();
      loadClassStudents();
    }
  }, [tab]);

  const loadCycleData = async () => {
    const { data, error } = await supabase
      .from('cycles')
      .select('start_date, end_date, status')
      .eq('id', classData.cycle_id)
      .single();

    if (error) {
      console.error('Error loading cycle data:', error);
      return;
    }

    if (data) {
      setCycleStartDate(data.start_date);
      setCycleEndDate(data.end_date);
      setCycleStatus(data.status);
    }
  };

  const loadTotalClassesGiven = async () => {
    const total = await getTotalClassesGiven(classData.id);
    console.log('Total de aulas realizadas carregado:', total);
    setTotalClassesGiven(total);
  };

  // ===========================================
  // FUNÇÃO: loadClassStudents (PARTE EAD - CORRIGIDA)
  // ===========================================
  const loadClassStudents = async () => {
    const { data, error } = await supabase
      .from('class_students')
      .select('*, students(*)')
      .eq('class_id', classData.id);

    if (error) {
      console.error('Error loading class students:', error);
      return;
    }

    if (classData.modality === 'VIDEOCONFERENCIA') {
      // Código existente para videoconferência (mantido)
      const { data: allAttendances } = await supabase
        .from('attendance')
        .select('class_number, class_date')
        .eq('class_id', classData.id)
        .order('class_number');

      const uniqueClassNumbers = allAttendances 
        ? [...new Set(allAttendances.map(a => a.class_number))]
        : [];
      const totalClassesGiven = uniqueClassNumbers.length;

      const studentsWithAttendance = await Promise.all(
        (data || []).map(async (cs) => {
          const enrollmentDate = extractDatePart(cs.enrollment_date);
          const isExceptional = cs.enrollment_type === 'exceptional';
          
          const { percentage, presentCount, totalClassesToConsider, isProportional } = 
            await calculateAttendancePercentage(
              classData.id, 
              cs.student_id, 
              isExceptional ? enrollmentDate : null
            );

          return {
            ...cs,
            attendanceCount: presentCount,
            attendancePercentage: percentage,
            totalClasses: totalClassesToConsider,
            totalClassesGiven: totalClassesGiven,
            isProportionalCalculation: isProportional,
          };
        })
      );

      setStudents(studentsWithAttendance);
    
  } else {
    // ===========================================
    // PARTE EAD - COMPLETAMENTE REESCRITA
    // ===========================================
    console.log('📚 Carregando alunos EAD com base em is_frequente');
    
   const studentsWithAccess = await Promise.all(
  (data || []).map(async (cs) => {
    const { data: accessData } = await supabase
      .from('ead_access')
      .select('*')
      .eq('class_id', classData.id)
      .eq('student_id', cs.student_id)
      .maybeSingle();

    // ✅ GARANTIR QUE É BOOLEANO
    const isFrequente = accessData?.is_frequente === true;
    
    // Contar acessos apenas para informação
    const totalAcessos = [
      accessData?.access_date_1,
      accessData?.access_date_2,
      accessData?.access_date_3
    ].filter(Boolean).length;

    console.log(`📚 Carregando aluno ${cs.students.full_name}:`, {
      isFrequente,
      totalAcessos,
      accessDates: {
        d1: accessData?.access_date_1,
        d2: accessData?.access_date_2,
        d3: accessData?.access_date_3
      }
    });

    return {
      ...cs,
      accessData,
      isFrequente,        // ✅ Campo correto para a UI
      totalAcessos,       // Info adicional
    };
  })
);

    setStudents(studentsWithAccess);
  }
};
  const loadAvailableStudents = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('students')
      .select('id, full_name')
      .order('full_name');

    if (error) {
      console.error('Error loading students:', error);
      return;
    }

    const enrolledIds = students.map((s) => s.student_id);
    const available = (data || []).filter((s) => !enrolledIds.includes(s.id));

    setAvailableStudents(available);
  };

  const handleOpenEnrollment = (type: 'regular' | 'exceptional') => {
    setEnrollmentType(type);
    setSelectedStudents(new Set());
    setEnrollmentSearch('');
    setEnrollmentDate(new Date().toISOString().split('T')[0]);
    setShowEnrollmentModal(true);
  };

  const handleToggleStudent = (studentId: string) => {
    const newSelected = new Set(selectedStudents);
    if (newSelected.has(studentId)) {
      newSelected.delete(studentId);
    } else {
      newSelected.add(studentId);
    }
    setSelectedStudents(newSelected);
  };

  const handleEnrollStudents = async () => {
    if (selectedStudents.size === 0) {
      alert('Por favor, selecione pelo menos um aluno para matricular');
      return;
    }

    if (!enrollmentDate) {
      alert('Por favor, selecione a data da matrícula');
      return;
    }

    if (cycleStartDate && enrollmentDate < cycleStartDate) {
      alert(`Data de matrícula não pode ser anterior ao início do ciclo (${formatDateToDisplay(cycleStartDate)})`);
      return;
    }

    if (cycleEndDate && enrollmentDate > cycleEndDate) {
      alert(`Data de matrícula não pode ser posterior ao fim do ciclo (${formatDateToDisplay(cycleEndDate)})`);
      return;
    }

    // 🔥 Usar a função para formatar para o banco
    const enrollmentDateTime = formatDateToDatabase(enrollmentDate);

    const studentsToEnroll = Array.from(selectedStudents).map(studentId => ({
      class_id: classData.id,
      student_id: studentId,
      enrollment_type: enrollmentType,
      enrollment_date: enrollmentDateTime,
      current_status: 'em_andamento',
      status_updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase.from('class_students').insert(studentsToEnroll);

    if (error) {
      console.error('Error enrolling students:', error);
      alert('Erro ao matricular alunos');
      return;
    }

    if (classData.modality === 'EAD') {
      const eadAccessRecords = Array.from(selectedStudents).map(studentId => ({
        class_id: classData.id,
        student_id: studentId,
      }));
      await supabase.from('ead_access').insert(eadAccessRecords);
    }

    setShowEnrollmentModal(false);
    setSelectedStudents(new Set());
    loadClassStudents();
    loadAvailableStudents();
    
    alert(`${selectedStudents.size} aluno(s) matriculado(s) com sucesso em ${formatDateToDisplay(enrollmentDateTime)}!`);
  };

  // NOVA FUNÇÃO: Abrir modal de edição de matrícula
const handleOpenEditEnrollment = (student: any) => {
  // Extrair a data do timestamp (se for timestamp com timezone)
  let enrollmentDate = new Date().toISOString().split('T')[0]; // padrão: hoje
  
  if (student.enrollment_date) {
    // O campo enrollment_date é timestamp with time zone
    // Exemplo: "2024-03-15T00:00:00.000Z" ou "2024-03-15 00:00:00+00"
    
    if (student.enrollment_date.includes('T')) {
      // Formato ISO: "2024-03-15T00:00:00.000Z"
      enrollmentDate = student.enrollment_date.split('T')[0];
    } else if (student.enrollment_date.includes(' ')) {
      // Formato string: "2024-03-15 00:00:00+00"
      enrollmentDate = student.enrollment_date.split(' ')[0];
    } else {
      // Já é apenas a data
      enrollmentDate = student.enrollment_date;
    }
  }

  console.log('📅 Abrindo edição:', {
    original: student.enrollment_date,
    extraido: enrollmentDate,
    tipo: student.enrollment_type
  });

  setEditEnrollmentModal({
    show: true,
    student: student,
    enrollmentDate: enrollmentDate,
    enrollmentType: student.enrollment_type,
  });
};
  // NOVA FUNÇÃO: Salvar edição da matrícula
const handleSaveEditEnrollment = async () => {
  if (!editEnrollmentModal) return;

  const { student, enrollmentDate, enrollmentType } = editEnrollmentModal;

  // Validações básicas
  if (!enrollmentDate) {
    alert('Por favor, selecione a data da matrícula');
    return;
  }

  if (!student?.student_id || !classData?.id) {
    alert('Dados incompletos para atualização');
    return;
  }

  // Validar período do ciclo
  if (cycleStartDate && enrollmentDate < cycleStartDate) {
    alert(`Data de matrícula não pode ser anterior ao início do ciclo (${formatDateToDisplay(cycleStartDate)})`);
    return;
  }

  if (cycleEndDate && enrollmentDate > cycleEndDate) {
    alert(`Data de matrícula não pode ser posterior ao fim do ciclo (${formatDateToDisplay(cycleEndDate)})`);
    return;
  }

  try {
    // 🔥 FORMATO CORRETO para timestamp with time zone
    // O schema mostra que enrollment_date é timestamp with time zone
    const enrollmentTimestamp = `${enrollmentDate}T00:00:00.000Z`;

    console.log('📅 Atualizando matrícula:', {
      class_id: classData.id,
      student_id: student.student_id,
      enrollment_date: enrollmentTimestamp,
      enrollment_type: enrollmentType
    });

    // UPDATE sem a coluna updated_at (que não existe no schema)
    const { error, data } = await supabase
      .from('class_students')
      .update({
        enrollment_date: enrollmentTimestamp,
        enrollment_type: enrollmentType
        // ⚠️ updated_at NÃO EXISTE no schema - removido
      })
      .eq('class_id', classData.id)
      .eq('student_id', student.student_id)
      .select();

    if (error) {
      console.error('❌ Erro detalhado:', error);
      
      // Mensagens específicas baseadas no código do erro
      if (error.code === '23505') {
        alert('Erro: Registro duplicado.');
      } else if (error.code === '23503') {
        alert('Erro: Aluno ou turma não encontrado.');
      } else if (error.code === '22007') {
        alert('Erro: Formato de data inválido.');
      } else {
        alert(`Erro ao atualizar: ${error.message}`);
      }
      return;
    }

    console.log('✅ Matrícula atualizada:', data);

    // Sucesso!
    setEditEnrollmentModal(null);
    await loadClassStudents(); // Recarregar lista
    
    const displayDate = forceDateToDisplay(enrollmentDate);
    alert(`✅ Matrícula atualizada!\n` +
          `Aluno: ${student.students?.full_name}\n` +
          `Data: ${displayDate}\n` +
          `Tipo: ${enrollmentType === 'exceptional' ? 'Excepcional' : 'Regular'}`);

  } catch (error) {
    console.error('❌ Erro inesperado:', error);
    alert('Erro inesperado ao atualizar matrícula');
  }
};
  const handleRemoveStudent = async (studentId: string) => {
    if (!confirm('Tem certeza que deseja remover este aluno da turma?')) return;

    const { error } = await supabase
      .from('class_students')
      .delete()
      .eq('class_id', classData.id)
      .eq('student_id', studentId);

    if (error) {
      console.error('Error removing student:', error);
      alert('Erro ao remover aluno');
      return;
    }

    loadClassStudents();
    loadAvailableStudents();
  };

  const handleCloseClass = async () => {
    if (!confirm('Tem certeza que deseja encerrar esta turma? Esta ação não pode ser desfeita.')) return;

    if (totalClassesGiven === 0) {
      if (!confirm('Nenhuma aula foi registrada para esta turma. Deseja encerrar mesmo assim?')) {
        return;
      }
    }

    await updateAllStudentsStatusOnClose(classData.id);

    const { error } = await supabase
      .from('classes')
      .update({ status: 'closed' })
      .eq('id', classData.id);

    if (error) {
      console.error('Error closing class:', error);
      alert('Erro ao encerrar turma');
      return;
    }

    alert('Turma encerrada com sucesso!');
    onClose();
  };

  const handleIssueCertificate = async (studentId: string, percentage: number) => {
    const { data: studentData, error: studentError } = await supabase
      .from('students')
      .select('full_name')
      .eq('id', studentId)
      .single();

    if (studentError || !studentData) {
      console.error('Error loading student:', studentError);
      alert('Erro ao carregar dados do aluno');
      return;
    }

    const { data: courseData, error: courseError } = await supabase
      .from('courses')
      .select('name, workload')
      .eq('id', classData.course_id)
      .single();

    if (courseError || !courseData) {
      console.error('Error loading course:', courseError);
      alert('Erro ao carregar dados do curso');
      return;
    }

    const { data: modulesData } = await supabase
      .from('course_modules')
      .select('name')
      .eq('course_id', classData.course_id)
      .order('order_number');

    const modules = modulesData?.map(m => m.name) || [];

    const { data: attendanceData } = await supabase
      .from('attendance')
      .select('class_date')
      .eq('class_id', classData.id)
      .eq('student_id', studentId)
      .order('class_date', { ascending: true });

    const startDate = attendanceData && attendanceData.length > 0
      ? attendanceData[0].class_date
      : new Date().toISOString().split('T')[0];

    const endDate = attendanceData && attendanceData.length > 0
      ? attendanceData[attendanceData.length - 1].class_date
      : new Date().toISOString().split('T')[0];

    setCertificateData({
      studentName: studentData.full_name,
      courseName: courseData.name,
      courseModules: modules,
      workload: courseData.workload,
      startDate,
      endDate,
      studentId,
      percentage,
    });
    setShowCertificate(true);
  };

  const handleCloseCertificate = async () => {
    if (certificateData) {
      const { data: existingCert } = await supabase
        .from('certificates')
        .select('id')
        .eq('class_id', classData.id)
        .eq('student_id', certificateData.studentId)
        .maybeSingle();

      if (existingCert) {
        const { error } = await supabase
          .from('certificates')
          .update({
            issue_date: new Date().toISOString().split('T')[0],
            attendance_percentage: certificateData.percentage,
          })
          .eq('id', existingCert.id);

        if (error) {
          console.error('Error updating certificate:', error);
          alert('Erro ao atualizar certificado');
          return;
        }

        alert('Certificado atualizado com sucesso!');
      } else {
        const { error } = await supabase.from('certificates').insert([
          {
            class_id: classData.id,
            student_id: certificateData.studentId,
            issue_date: new Date().toISOString().split('T')[0],
            attendance_percentage: certificateData.percentage,
          },
        ]);

        if (error) {
          console.error('Error issuing certificate:', error);
          alert('Erro ao emitir certificado');
          return;
        }

        alert('Certificado emitido com sucesso!');
      }

      loadClassStudents();
    }

    setShowCertificate(false);
    setCertificateData(null);
  };

  const getStudentSituation = (student: any) => {
    const today = new Date().toISOString().split('T')[0];
    const isCycleActive = cycleStatus === 'active' && today <= cycleEndDate;

    if (isCycleActive) {
      return {
        status: 'Em Andamento',
        color: 'bg-blue-100 text-blue-800',
        canCertify: false,
        message: 'Ciclo em andamento'
      };
    }

    if (classData.modality === 'VIDEOCONFERENCIA') {
      const isApproved = student.attendancePercentage >= 60;
      return {
        status: isApproved ? 'Aprovado' : 'Reprovado',
        color: isApproved ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800',
        canCertify: isApproved,
        message: isApproved ? 'Aluno aprovado' : 'Aluno reprovado'
      };
    } else {
      const isApproved = student.isPresent;
      return {
        status: isApproved ? 'Aprovado' : 'Reprovado',
        color: isApproved ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800',
        canCertify: isApproved,
        message: isApproved ? 'Aluno aprovado' : 'Aluno reprovado'
      };
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl
        w-[98vw] md:w-[95vw] lg:w-[92vw] xl:w-[88vw] 2xl:w-[85vw] max-w-[1800px]
        p-4 md:p-6 my-4 md:my-8 max-h-[95vh] md:max-h-[90vh] overflow-y-auto">
        
        <div className="flex justify-between items-start mb-6">
          <div>
            <h3 className="text-2xl font-bold text-slate-800">{classData.name}</h3>
            <p className="text-slate-600 text-lg">{classData.courses?.name}</p>
            <div className="flex items-center gap-3 mt-2">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                classData.status === 'active'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-slate-100 text-slate-600'
              }`}>
                {classData.status === 'active' ? 'Ativa' : 'Encerrada'}
              </span>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                classData.modality === 'EAD'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-amber-100 text-amber-700'
              }`}>
                {classData.modality === 'EAD' ? 'EAD 24h' : 'Videoconferência'}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-3xl p-1"
          >
            ×
          </button>
        </div>

        <div className="border-b border-slate-200 mb-6">
          <nav className="flex space-x-2">
            <button
              onClick={() => setTab('students')}
              className={`px-6 py-3 font-medium text-sm transition-colors ${
                tab === 'students'
                  ? 'border-b-2 border-green-600 text-green-600'
                  : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              Alunos
            </button>
            <button
              onClick={() => setTab('attendance')}
              className={`px-6 py-3 font-medium text-sm transition-colors ${
                tab === 'attendance'
                  ? 'border-b-2 border-green-600 text-green-600'
                  : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              {classData.modality === 'EAD' ? 'Acessos' : 'Frequência'}
            </button>
            {classData.status === 'active' && (
              <button
                onClick={() => setTab('close')}
                className={`px-6 py-3 font-medium text-sm transition-colors ${
                  tab === 'close'
                    ? 'border-b-2 border-green-600 text-green-600'
                    : 'text-slate-600 hover:text-slate-800'
                }`}
              >
                Encerramento
              </button>
            )}
          </nav>
        </div>

        <div className="min-h-[500px]">
          {tab === 'students' && (
            <div className="space-y-6">
              <div className="flex gap-4">
                <button
                  onClick={() => handleOpenEnrollment('regular')}
                  className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium flex items-center justify-center space-x-2"
                >
                  <Users className="w-5 h-5" />
                  <span>Matrícula Regular</span>
                </button>
                <button
                  onClick={() => handleOpenEnrollment('exceptional')}
                  className="flex-1 px-6 py-3 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors font-medium flex items-center justify-center space-x-2"
                >
                  <Users className="w-5 h-5" />
                  <span>Matrícula Excepcional</span>
                </button>
              </div>

              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar aluno por nome ou CPF..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-base"
                />
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="max-h-[400px] overflow-y-auto">
                  <table className="w-full min-w-full">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr>
                        <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700 uppercase tracking-wider">
                          Aluno
                        </th>
                        <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700 uppercase tracking-wider">
                          CPF
                        </th>
                        <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700 uppercase tracking-wider">
                          Tipo Matrícula
                        </th>
                        <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700 uppercase tracking-wider">
                          Ações
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {students
                        .filter((student) => {
                          if (!searchTerm) return true;
                          const search = searchTerm.toLowerCase();
                          return (
                            student.students.full_name.toLowerCase().includes(search) ||
                            student.students.cpf?.toLowerCase().includes(search)
                          );
                        })
                        .map((student) => {
                        const situation = getStudentSituation(student);
                        
                        return (
                          <tr key={student.id} className="hover:bg-slate-50">
                            <td className="px-6 py-4 text-sm text-slate-800">
                              <div className="font-medium">{student.students.full_name}</div>
                            </td>
                            <td className="px-6 py-4 text-sm text-slate-600">
                              {student.students.cpf || '-'}
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex flex-col">
                                <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                                  student.enrollment_type === 'exceptional' 
                                    ? 'bg-amber-100 text-amber-800' 
                                    : 'bg-blue-100 text-blue-800'
                                }`}>
                                  {student.enrollment_type === 'exceptional' ? 'Excepcional' : 'Regular'}
                                </span>
                                {student.enrollment_date && (
                                  <span className="text-xs text-amber-600 mt-1 flex items-center">
                                    ⚖️ {forceDateToDisplay(student.enrollment_date)}
                                    <button
                                      onClick={() => handleOpenEditEnrollment(student)}
                                      className="ml-2 text-blue-600 hover:text-blue-800"
                                      title="Editar data de matrícula"
                                    >
                                      <Edit2 className="w-3 h-3" />
                                    </button>
                                  </span>
                                )}
                                {student.isProportionalCalculation && (
                                  <div className="text-xs text-amber-600 mt-1 font-medium">
                                    Cálculo proporcional
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${situation.color}`}>
                                {situation.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-sm">
                              <button
                                onClick={() => handleOpenEditEnrollment(student)}
                                className="text-blue-600 hover:text-blue-800 font-medium px-3 py-1 hover:bg-blue-50 rounded mr-2"
                                title="Editar matrícula"
                              >
                                <Edit2 className="w-4 h-4 inline mr-1" />
                                Editar
                              </button>
                              <button
                                onClick={() => handleRemoveStudent(student.student_id)}
                                className="text-red-600 hover:text-red-800 font-medium px-3 py-1 hover:bg-red-50 rounded"
                              >
                                Remover
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {students.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                            <div className="flex flex-col items-center">
                              <User className="w-12 h-12 text-slate-300 mb-3" />
                              <p className="text-lg">Nenhum aluno matriculado nesta turma</p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {tab === 'attendance' && classData.modality === 'VIDEOCONFERENCIA' && (
            <div className="space-y-6 min-h-[500px]">
              <VideoconferenciaAttendance
                classData={classData}
                students={students}
                onUpdate={() => {
                  loadClassStudents();
                  loadTotalClassesGiven();
                  loadNextClassNumber();
                }}
                totalClassesGiven={totalClassesGiven}
                nextClassNumber={nextClassNumber}
              />
            </div>
          )}

          {tab === 'attendance' && classData.modality === 'EAD' && (
            <div className="min-h-[500px]">
              <EADAccessManagement
                classData={classData}
                students={students}
                onUpdate={loadClassStudents}
              />
            </div>
          )}

          {tab === 'close' && (
            <div className="space-y-6">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
                <h4 className="font-bold text-lg text-amber-800 mb-3">Resumo do Ciclo</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-amber-700">Total de alunos</p>
                    <p className="text-2xl font-bold text-amber-800">{students.length}</p>
                  </div>
                  <div>
                    <p className="text-sm text-amber-700">Aulas previstas</p>
                    <p className="text-2xl font-bold text-amber-800">{classData.total_classes}</p>
                  </div>
                  <div>
                    <p className="text-sm text-amber-700">Aulas realizadas</p>
                    <p className="text-2xl font-bold text-amber-800">{totalClassesGiven}</p>
                  </div>
                  <div>
                    <p className="text-sm text-amber-700">Status do Ciclo</p>
                    <p className="text-2xl font-bold text-amber-800">
                      {cycleStatus === 'active' ? 'Ativo' : 'Encerrado'}
                    </p>
                  </div>
                </div>
                
                {cycleStatus === 'active' && (
                  <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm text-blue-800">
                      <strong>⚠️ Atenção:</strong> Este ciclo ainda está ativo. 
                      As situações abaixo são baseadas na frequência atual ({totalClassesGiven} de {classData.total_classes} aulas realizadas), 
                      mas podem mudar até o encerramento do ciclo.
                    </p>
                  </div>
                )}

                {totalClassesGiven < classData.total_classes && cycleStatus === 'active' && (
                  <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-sm text-yellow-800">
                      <strong>📌 Aulas pendentes:</strong> Faltam {classData.total_classes - totalClassesGiven} aulas para completar o ciclo.
                    </p>
                  </div>
                )}
              </div>

              <div className="mb-4">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar aluno por nome..."
                    value={studentSearchTerm}
                    onChange={(e) => setStudentSearchTerm(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-base"
                  />
                </div>
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="max-h-[400px] overflow-y-auto">
                  <table className="w-full min-w-full">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr>
                        <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700 uppercase tracking-wider">
                          Aluno
                        </th>
                        <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700 uppercase tracking-wider">
                          {classData.modality === 'EAD' ? 'Acessos' : 'Frequência'}
                        </th>
                        <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700 uppercase tracking-wider">
                          Situação
                        </th>
                        <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700 uppercase tracking-wider">
                          Detalhes
                        </th>
                        <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700 uppercase tracking-wider">
                          Certificado
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {students
                        .filter((student) => {
                          if (!studentSearchTerm) return true;
                          const search = studentSearchTerm.toLowerCase();
                          return student.students.full_name.toLowerCase().includes(search);
                        })
                        .map((student) => {
                        const situation = getStudentSituation(student);
                        
                        return (
                          <tr key={student.id} className="hover:bg-slate-50">
                            <td className="px-6 py-4 text-sm text-slate-800">
                              <div className="font-medium">{student.students.full_name}</div>
                              {student.enrollment_date && (
                                <button
                                  onClick={() => handleOpenEditEnrollment(student)}
                                  className="text-xs text-blue-600 hover:text-blue-800 mt-1 flex items-center"
                                >
                                  <Edit2 className="w-3 h-3 mr-1" />
                                  Editar data: {forceDateToDisplay(student.enrollment_date)}
                                </button>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              {classData.modality === 'VIDEOCONFERENCIA' ? (
                                <div className="flex items-center space-x-3">
                                  <div className="w-32 bg-slate-200 rounded-full h-2.5">
                                    <div
                                      className={`h-2.5 rounded-full ${
                                        student.attendancePercentage >= 60
                                          ? 'bg-green-500'
                                          : student.attendancePercentage > 0
                                          ? 'bg-yellow-500'
                                          : 'bg-red-500'
                                      }`}
                                      style={{ width: `${Math.min(student.attendancePercentage, 100)}%` }}
                                    ></div>
                                  </div>
                                  <span
                                    className={`font-semibold ${
                                      student.attendancePercentage >= 60
                                        ? 'text-green-700'
                                        : student.attendancePercentage > 0
                                        ? 'text-yellow-700'
                                        : 'text-red-700'
                                    }`}
                                  >
                                    {student.attendancePercentage.toFixed(1)}%
                                  </span>
                                </div>
                              ) : (
                                <span
                                  className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                                    student.isPresent
                                      ? 'bg-green-100 text-green-800'
                                      : 'bg-yellow-100 text-yellow-800'
                                  }`}
                                >
                                  {student.isPresent ? 'Aprovado' : 'Em andamento'}
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${situation.color}`}>
                                {situation.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-sm text-slate-600">
                              {classData.modality === 'VIDEOCONFERENCIA' ? (
                                <div className="flex flex-col">
                                  <span className="font-medium">
                                    {student.attendanceCount} de {student.totalClasses || totalClassesGiven} aulas
                                  </span>
                                  <span className="text-xs text-slate-500">
                                    {student.isProportionalCalculation && student.enrollment_date
                                      ? `Matrícula: ${forceDateToDisplay(student.enrollment_date)}`
                                      : 'Presenças registradas'}
                                  </span>
                                  {totalClassesGiven < classData.total_classes && cycleStatus === 'active' && (
                                    <span className="text-xs text-blue-500 mt-1">
                                      {classData.total_classes - totalClassesGiven} aulas restantes
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <div className="flex flex-col">
                                  <span className="font-medium">
                                    {[
                                      student.accessData?.access_date_1,
                                      student.accessData?.access_date_2,
                                      student.accessData?.access_date_3,
                                    ].filter(Boolean).length} de 3 acessos
                                  </span>
                                  <span className="text-xs text-slate-500">
                                    {student.isPresent 
                                      ? '3 acessos completos' 
                                      : 'Necessário 3 acessos'}
                                  </span>
                                </div>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              {situation.canCertify ? (
                                <button
                                  onClick={() =>
                                    handleIssueCertificate(
                                      student.student_id,
                                      classData.modality === 'VIDEOCONFERENCIA'
                                        ? student.attendancePercentage
                                        : 100
                                    )
                                  }
                                  className="inline-flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                                >
                                  <Award className="w-5 h-5" />
                                  <span>Emitir</span>
                                </button>
                              ) : situation.status === 'Em Andamento' ? (
                                <span className="text-blue-500 font-medium text-sm">
                                  Aguardando fim do ciclo
                                </span>
                              ) : (
                                <span className="text-slate-400 font-medium text-sm">
                                  Não elegível
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="pt-6 border-t border-slate-200">
                {cycleStatus === 'active' ? (
                  <>
                    <button
                      onClick={handleCloseClass}
                      className="w-full px-6 py-4 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors font-bold text-lg shadow-md"
                    >
                      Encerrar Turma e Finalizar Ciclo
                    </button>
                    <p className="text-sm text-slate-500 text-center mt-3">
                      Ao encerrar a turma, as situações dos alunos serão calculadas definitivamente
                      {totalClassesGiven < classData.total_classes && (
                        <span className="block text-yellow-600 font-medium mt-1">
                          ⚠️ Apenas {totalClassesGiven} de {classData.total_classes} aulas foram realizadas
                        </span>
                      )}
                    </p>
                  </>
                ) : (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                    <p className="text-green-800 font-medium">
                      ✅ Ciclo encerrado - todas as situações estão consolidadas
                    </p>
                    <p className="text-sm text-green-600 mt-1">
                      Total de aulas realizadas: {totalClassesGiven} de {classData.total_classes}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* NOVO: Modal de edição de matrícula */}
      {editEnrollmentModal?.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-xl shadow-xl
            w-[95vw] md:w-[70vw] lg:w-[55vw] xl:w-[45vw] max-w-3xl
            max-h-[90vh] overflow-y-auto">
            
            <div className="p-6">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-2xl font-bold text-slate-800">
                    Editar Matrícula
                  </h3>
                  <p className="text-slate-600 mt-1">
                    {editEnrollmentModal.student.students.full_name}
                  </p>
                </div>
                <button
                  onClick={() => setEditEnrollmentModal(null)}
                  className="text-slate-400 hover:text-slate-600 text-3xl p-1"
                >
                  ×
                </button>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Tipo de Matrícula
                  </label>
                  <select
                    value={editEnrollmentModal.enrollmentType}
                    onChange={(e) => setEditEnrollmentModal({
                      ...editEnrollmentModal,
                      enrollmentType: e.target.value as 'regular' | 'exceptional'
                    })}
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-base"
                  >
                    <option value="regular">Matrícula Regular</option>
                    <option value="exceptional">Matrícula Excepcional</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Data da Matrícula <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={editEnrollmentModal.enrollmentDate}
                    onChange={(e) => setEditEnrollmentModal({
                      ...editEnrollmentModal,
                      enrollmentDate: e.target.value
                    })}
                    min={cycleStartDate}
                    max={cycleEndDate}
                    required
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-base"
                  />
                  <p className="text-xs text-slate-500 mt-2">
                    Período do ciclo: {formatDateToDisplay(cycleStartDate)} até {formatDateToDisplay(cycleEndDate)}
                  </p>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-800">
                    <strong>📌 Importante:</strong> Alterar a data de matrícula afeta o cálculo de frequência.
                    {editEnrollmentModal.enrollmentType === 'exceptional' && (
                      <span className="block mt-1">
                        Em matrículas excepcionais, a frequência será recalculada a partir desta nova data.
                      </span>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex space-x-3 mt-6">
                <button
                  onClick={() => setEditEnrollmentModal(null)}
                  className="flex-1 px-4 py-3 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors font-medium"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveEditEnrollment}
                  className="flex-1 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                >
                  Salvar Alterações
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCertificate && certificateData && (
        <>
          {classData.modality === 'EAD' ? (
            <CertificateModalEAD
              studentName={certificateData.studentName}
              courseName={certificateData.courseName}
              courseModules={certificateData.courseModules}
              workload={certificateData.workload}
              startDate={certificateData.startDate}
              endDate={certificateData.endDate}
              onClose={handleCloseCertificate}
            />
          ) : (
            <CertificateModal
              studentName={certificateData.studentName}
              courseName={certificateData.courseName}
              courseModules={certificateData.courseModules}
              workload={certificateData.workload}
              startDate={certificateData.startDate}
              endDate={certificateData.endDate}
              onClose={handleCloseCertificate}
            />
          )}
        </>
      )}

      {showEnrollmentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-xl
            w-[95vw] md:w-[85vw] lg:w-[70vw] xl:w-[60vw] max-w-4xl
            max-h-[90vh] overflow-y-auto">
            
            <div className="p-6">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-2xl font-bold text-slate-800">
                    {enrollmentType === 'regular' ? 'Matrícula Regular' : 'Matrícula Excepcional'}
                  </h3>
                  <p className="text-slate-600 mt-1">
                    {enrollmentType === 'regular'
                      ? 'Aluno que iniciou no início do ciclo ou em data retroativa'
                      : 'Aluno que entrou após o início do ciclo'}
                  </p>
                </div>
                <button
                  onClick={() => setShowEnrollmentModal(false)}
                  className="text-slate-400 hover:text-slate-600 text-3xl p-1"
                >
                  ×
                </button>
              </div>

              <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>📅 Importante:</strong> Selecione a data REAL em que o aluno começou a frequentar a turma.
                  {enrollmentType === 'regular' && (
                    <span className="block mt-1">
                      Para matrículas regulares no início do ciclo, use a data de início do ciclo.
                      Para matrículas regulares retroativas, use a data real de entrada.
                    </span>
                  )}
                  {enrollmentType === 'exceptional' && (
                    <span className="block mt-1">
                      A frequência será calculada apenas a partir desta data.
                    </span>
                  )}
                </p>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Data da Matrícula <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={enrollmentDate}
                  onChange={(e) => setEnrollmentDate(e.target.value)}
                  min={cycleStartDate}
                  max={new Date().toISOString().split('T')[0]}
                  required
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-base"
                />
                <p className="text-xs text-slate-500 mt-2">
                  {enrollmentType === 'regular' 
                    ? '✅ Pode ser retroativa (data em que o aluno realmente começou)'
                    : '📌 Deve ser a data em que o aluno passou a frequentar a turma'}
                </p>
              </div>

              <div className="mb-4">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar aluno por nome..."
                    value={enrollmentSearch}
                    onChange={(e) => setEnrollmentSearch(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="mb-4 p-3 bg-slate-50 rounded-lg flex justify-between items-center">
                <p className="text-sm text-slate-600">
                  {selectedStudents.size} aluno(s) selecionado(s)
                </p>
                {selectedStudents.size > 0 && (
                  <p className="text-xs text-green-600">
                    ✅ Matrícula em {formatDateToDisplay(enrollmentDate)}
                  </p>
                )}
              </div>

              <div className="border border-slate-200 rounded-lg max-h-[400px] overflow-y-auto">
                <div className="divide-y divide-slate-200">
                  {availableStudents
                    .filter(student => {
                      if (!enrollmentSearch) return true;
                      return student.full_name.toLowerCase().includes(enrollmentSearch.toLowerCase());
                    })
                    .map(student => (
                      <label
                        key={student.id}
                        className="flex items-center p-4 hover:bg-slate-50 cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={selectedStudents.has(student.id)}
                          onChange={() => handleToggleStudent(student.id)}
                          className="w-5 h-5 text-green-600 rounded focus:ring-green-500 mr-3"
                        />
                        <span className="text-slate-800">{student.full_name}</span>
                      </label>
                    ))}
                  {availableStudents.filter(student => {
                    if (!enrollmentSearch) return true;
                    return student.full_name.toLowerCase().includes(enrollmentSearch.toLowerCase());
                  }).length === 0 && (
                    <div className="p-8 text-center text-slate-500">
                      <User className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                      <p>Nenhum aluno disponível para matrícula</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex space-x-3 mt-6">
                <button
                  onClick={() => setShowEnrollmentModal(false)}
                  className="flex-1 px-4 py-3 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors font-medium"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleEnrollStudents}
                  disabled={selectedStudents.size === 0 || !enrollmentDate}
                  className={`flex-1 px-4 py-3 text-white rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed ${
                    enrollmentType === 'regular'
                      ? 'bg-green-600 hover:bg-green-700'
                      : 'bg-amber-600 hover:bg-amber-700'
                  }`}
                >
                  Matricular {selectedStudents.size > 0 ? `(${selectedStudents.size})` : ''}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function VideoconferenciaAttendance({
  classData,
  students,
  onUpdate,
  totalClassesGiven,
  nextClassNumber
}: any) {
  const [classNumber, setClassNumber] = useState(nextClassNumber);
  const [classDate, setClassDate] = useState(new Date().toISOString().split('T')[0]);
  const [attendance, setAttendance] = useState<Record<string, boolean>>({});
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [studentSearchTerm, setStudentSearchTerm] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [cycleStartDate, setCycleStartDate] = useState<string>('');
  const [cycleEndDate, setCycleEndDate] = useState<string>('');
  const [eligibleStudents, setEligibleStudents] = useState<any[]>([]);
  const [ignoredStudents, setIgnoredStudents] = useState<any[]>([]);
  const [localTotalClassesGiven, setLocalTotalClassesGiven] = useState(totalClassesGiven);

  // Função para recarregar o total de aulas
  const reloadTotalClasses = async () => {
    console.log('🔄 reloadTotalClasses chamado para turma:', classData.id);
    const total = await getTotalClassesGiven(classData.id);
    console.log('✅ Total recalculado:', total);
    setLocalTotalClassesGiven(total);
    console.log('✅ Estado localTotalClassesGiven atualizado para:', total);
  };

  // Carrega as datas do ciclo e força atualização dos dados
  useEffect(() => {
    loadCycleDates();
    reloadTotalClasses();
    onUpdate();
  }, []);

  // Atualiza quando a prop totalClassesGiven mudar
  useEffect(() => {
    setLocalTotalClassesGiven(totalClassesGiven);
  }, [totalClassesGiven]);

  // Atualiza o número da aula quando o próximo número calculado no pai mudar
  useEffect(() => {
    setClassNumber(nextClassNumber);
  }, [nextClassNumber]);

  // 🔥 FILTRO PRINCIPAL - Quando a data da aula mudar
  useEffect(() => {
    if (classDate && students.length > 0) {
      const eligible: any[] = [];
      const ignored: any[] = [];
      
      students.forEach((student: any) => {
        const enrollmentDate = extractDatePart(student.enrollment_date);
        
        // Se não tem data de matrícula, considera elegível
        if (!enrollmentDate) {
          eligible.push(student);
          return;
        }
        
        // Comparar datas usando a função utilitária
        if (isDateGreaterOrEqual(classDate, enrollmentDate)) {
          eligible.push(student);
        } else {
          ignored.push(student);
        }
      });
      
      setEligibleStudents(eligible);
      setIgnoredStudents(ignored);
      
      // Limpar seleções de alunos ignorados
      const newAttendance = { ...attendance };
      ignored.forEach(student => {
        delete newAttendance[student.student_id];
      });
      setAttendance(newAttendance);
      
      console.log('📅 Filtro aplicado:', {
        dataAula: classDate,
        totalAlunos: students.length,
        alunosElegiveis: eligible.length,
        alunosIgnorados: ignored.length,
      });
    } else {
      setEligibleStudents(students);
      setIgnoredStudents([]);
    }
  }, [classDate, students]);

  const loadCycleDates = async () => {
    const { data } = await supabase
      .from('cycles')
      .select('start_date, end_date')
      .eq('id', classData.cycle_id)
      .single();

    if (data) {
      setCycleStartDate(data.start_date);
      setCycleEndDate(data.end_date);
    }
  };

  const validateAttendance = (): boolean => {
    setValidationError(null);

    if (classNumber < 1 || classNumber > classData.total_classes) {
      setValidationError(`Número da aula deve estar entre 1 e ${classData.total_classes}`);
      return false;
    }

    if (!classDate) {
      setValidationError('Selecione uma data para a aula');
      return false;
    }

    if (cycleStartDate && classDate < cycleStartDate) {
      setValidationError(`Data da aula não pode ser anterior ao início do ciclo (${formatDateToDisplay(cycleStartDate)})`);
      return false;
    }

    if (cycleEndDate && classDate > cycleEndDate) {
      setValidationError(`Data da aula não pode ser posterior ao fim do ciclo (${formatDateToDisplay(cycleEndDate)})`);
      return false;
    }

    return true;
  };

  const handleSaveAttendance = async () => {
    if (!validateAttendance()) return;

    const aulaAtual = classNumber; // valor que está no input (pode ser manual)

    const records = eligibleStudents.map((student: any) => ({
      class_id: classData.id,
      student_id: student.student_id,
      class_number: aulaAtual,
      class_date: classDate,
      present: attendance[student.student_id] || false,
    }));

    try {
      const { error } = await supabase
        .from('attendance')
        .upsert(records, { 
          onConflict: 'class_id, student_id, class_number',
          ignoreDuplicates: false 
        });

      if (error) throw error;

      // Feedback imediato: próximo número = aulaAtual + 1
      setClassNumber(aulaAtual + 1);
      setAttendance({});

      // Recarrega os dados no pai para consistência (atualiza totalClassesGiven e nextClassNumber)
      await reloadTotalClasses();
      onUpdate();

      alert(`✅ Aula ${aulaAtual} registrada!`);
    } catch (error: any) {
      console.error(error);
      alert(`Erro: ${error.message}`);
    }
  };

  const handleViewDetails = (student: any) => {
    setSelectedStudent(student);
    setShowDetailsModal(true);
  };

  const filteredEligibleStudents = eligibleStudents.filter((student: any) => {
    if (!studentSearchTerm) return true;
    const search = studentSearchTerm.toLowerCase();
    return student.students.full_name.toLowerCase().includes(search);
  });

  console.log('🎨 Renderizando VideoconferenciaAttendance');
  console.log('🎨 localTotalClassesGiven atual:', localTotalClassesGiven);
  console.log('🎨 totalClassesGiven (prop):', totalClassesGiven);

  return (
    <>
      {validationError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600">{validationError}</p>
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
        <p className="text-sm text-blue-800">
          <strong>📊 Aulas realizadas:</strong> {localTotalClassesGiven} de {classData.total_classes}
        </p>
      </div>

      {ignoredStudents.length > 0 && (
        <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-start space-x-3">
            <span className="text-amber-600 font-bold text-lg">⚠️</span>
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800">
                <strong>{ignoredStudents.length} aluno(s) não estão sendo exibidos</strong>
              </p>
              <p className="text-xs text-amber-700 mt-1">
                Data da aula: {formatDateToDisplay(classDate)}
              </p>
              <div className="mt-2 max-h-32 overflow-y-auto bg-amber-100/50 rounded p-2">
                {ignoredStudents.map((student: any) => (
                  <div key={student.id} className="text-xs text-amber-800 flex justify-between py-1 border-b border-amber-200 last:border-0">
                    <span>{student.students.full_name}</span>
                    <span className="font-medium">
                      Matrícula: {forceDateToDisplay(student.enrollment_date)}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-amber-700 mt-2">
                ⏰ Alunos com matrícula posterior à data da aula não devem constar na lista.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Número da Aula
          </label>
          <input
            type="number"
            min="1"
            max={classData.total_classes}
            value={classNumber}
            onChange={(e) => setClassNumber(parseInt(e.target.value))}
            className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-base"
          />
          <p className="text-xs text-slate-500 mt-1">
            Próxima aula: {nextClassNumber}
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Data da Aula
          </label>
          <input
            type="date"
            value={classDate}
            onChange={(e) => setClassDate(e.target.value)}
            min={cycleStartDate}
            max={cycleEndDate}
            className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-base"
          />
        </div>
        <div className="flex items-end">
          <button
            onClick={handleSaveAttendance}
            disabled={eligibleStudents.length === 0}
            className={`w-full px-6 py-3 text-white rounded-lg transition-colors font-medium ${
              eligibleStudents.length === 0
                ? 'bg-slate-400 cursor-not-allowed'
                : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            Salvar Frequência 
            {eligibleStudents.length > 0 && ` (${eligibleStudents.length} alunos)`}
          </button>
        </div>
      </div>

      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar aluno por nome..."
            value={studentSearchTerm}
            onChange={(e) => setStudentSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-base"
          />
        </div>
      </div>

      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <div className="max-h-[400px] overflow-y-auto">
          <table className="w-full min-w-full">
            <thead className="bg-slate-50 sticky top-0">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700 uppercase tracking-wider">
                  Aluno
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700 uppercase tracking-wider">
                  Tipo Matrícula
                </th>
                <th className="px-6 py-4 text-center text-sm font-semibold text-slate-700 uppercase tracking-wider">
                  Presente
                </th>
                <th className="px-6 py-4 text-center text-sm font-semibold text-slate-700 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-4 text-center text-sm font-semibold text-slate-700 uppercase tracking-wider">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredEligibleStudents.length > 0 ? (
                filteredEligibleStudents.map((student: any) => {
                  const isExceptional = student.enrollment_type === 'exceptional';
                  const enrollmentDate = student.enrollment_date 
                    ? forceDateToDisplay(student.enrollment_date)
                    : null;
                  
                  return (
                    <tr key={student.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4 text-sm text-slate-800">
                        <div className="font-medium">{student.students.full_name}</div>
                      </td>
                      
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                            isExceptional ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                          }`}>
                            {isExceptional ? 'Excepcional' : 'Regular'}
                          </span>
                          {enrollmentDate && (
                            <span className="text-xs text-slate-500 mt-1">
                              Mat: {enrollmentDate}
                            </span>
                          )}
                        </div>
                      </td>
                      
                      <td className="px-6 py-4 text-center">
                        <input
                          type="checkbox"
                          checked={attendance[student.student_id] || false}
                          onChange={(e) =>
                            setAttendance({ ...attendance, [student.student_id]: e.target.checked })
                          }
                          className="w-6 h-6 text-green-600 rounded focus:ring-green-500 cursor-pointer"
                        />
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                          attendance[student.student_id]
                            ? 'bg-green-100 text-green-800'
                            : 'bg-slate-100 text-slate-800'
                        }`}>
                          {attendance[student.student_id] ? 'Presente' : 'Ausente'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => handleViewDetails(student)}
                          className="inline-flex items-center space-x-1 px-3 py-1 text-green-600 hover:bg-green-50 rounded-lg transition-colors font-medium"
                        >
                          <Eye className="w-4 h-4" />
                          <span>Ver Detalhes</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center">
                      <User className="w-12 h-12 text-slate-300 mb-3" />
                      <p className="text-lg">Nenhum aluno elegível para esta data</p>
                      <p className="text-sm text-slate-400 mt-1">
                        Data selecionada: {formatDateToDisplay(classDate)}
                      </p>
                      {ignoredStudents.length > 0 && (
                        <p className="text-sm text-amber-600 mt-2">
                          {ignoredStudents.length} aluno(s) ignorado(s) por matrícula posterior
                        </p>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showDetailsModal && selectedStudent && (
        <AttendanceDetailsModal
          classData={classData}
          student={selectedStudent}
          onClose={() => {
            setShowDetailsModal(false);
            setSelectedStudent(null);
            onUpdate();
          }}
        />
      )}
    </>
  );
}

// ===========================================
// COMPONENTE - AttendanceDetailsModal
// ===========================================
interface AttendanceDetailsModalProps {
  classData: Class;
  student: any;
  onClose: () => void;
}

function AttendanceDetailsModal({ classData, student, onClose }: AttendanceDetailsModalProps) {
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
  const [editingRecord, setEditingRecord] = useState<string | null>(null);
  const [editData, setEditData] = useState<{ classNumber: number; classDate: string; present: boolean } | null>(null);
  const [cycleStartDate, setCycleStartDate] = useState<string>('');
  const [cycleEndDate, setCycleEndDate] = useState<string>('');

  useEffect(() => {
    loadCycleData();
    loadAttendanceRecords();
  }, []);

  const loadCycleData = async () => {
    const { data, error } = await supabase
      .from('cycles')
      .select('start_date, end_date')
      .eq('id', classData.cycle_id)
      .single();

    if (error) {
      console.error('Error loading cycle data:', error);
      return;
    }

    if (data) {
      setCycleStartDate(data.start_date);
      setCycleEndDate(data.end_date);
    }
  };

  const loadAttendanceRecords = async () => {
    const { data, error } = await supabase
      .from('attendance')
      .select('*')
      .eq('class_id', classData.id)
      .eq('student_id', student.student_id)
      .order('class_date', { ascending: true });

    if (error) {
      console.error('Error loading attendance records:', error);
      return;
    }

    setAttendanceRecords(data || []);
  };

  const handleEdit = (record: any) => {
    setEditingRecord(record.id);
    setEditData({
      classNumber: record.class_number,
      classDate: record.class_date,
      present: record.present,
    });
  };

  const validateEdit = (): boolean => {
    if (!editData) return false;

    if (cycleStartDate && editData.classDate < cycleStartDate) {
      alert(`Data não pode ser anterior ao início do ciclo (${formatDateToDisplay(cycleStartDate)})`);
      return false;
    }

    if (cycleEndDate && editData.classDate > cycleEndDate) {
      alert(`Data não pode ser posterior ao fim do ciclo (${formatDateToDisplay(cycleEndDate)})`);
      return false;
    }

    if (editData.classNumber < 1 || editData.classNumber > classData.total_classes) {
      alert(`Número da aula deve estar entre 1 e ${classData.total_classes}`);
      return false;
    }

    return true;
  };

  const handleSaveEdit = async (recordId: string) => {
    if (!editData || !validateEdit()) return;

    const { error } = await supabase
      .from('attendance')
      .update({
        class_number: editData.classNumber,
        class_date: editData.classDate,
        present: editData.present,
      })
      .eq('id', recordId);

    if (error) {
      console.error('Error updating attendance:', error);
      alert('Erro ao atualizar frequência');
      return;
    }

    setEditingRecord(null);
    setEditData(null);
    loadAttendanceRecords();
    alert('Frequência atualizada com sucesso!');
  };

  const handleCancelEdit = () => {
    setEditingRecord(null);
    setEditData(null);
  };

  const handleDelete = async (recordId: string) => {
    if (!confirm('Tem certeza que deseja excluir este registro de frequência?')) return;

    const { error } = await supabase
      .from('attendance')
      .delete()
      .eq('id', recordId);

    if (error) {
      console.error('Error deleting attendance:', error);
      alert('Erro ao excluir frequência');
      return;
    }

    loadAttendanceRecords();
    alert('Frequência excluída com sucesso!');
  };

  const uniqueClasses = [...new Set(attendanceRecords.map(r => r.class_number))];
  const totalClassesGiven = uniqueClasses.length;
  
  const presentCount = attendanceRecords.filter(r => r.present).length;
  const percentage = totalClassesGiven > 0 ? (presentCount / totalClassesGiven) * 100 : 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl shadow-xl
        w-[98vw] md:w-[90vw] lg:w-[85vw] xl:w-[80vw] 2xl:w-[75vw] max-w-[1600px]
        max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h3 className="text-2xl font-bold text-slate-800">Detalhes de Frequência</h3>
              <p className="text-lg text-slate-600 mt-1">{student.students.full_name}</p>
              
              <div className="flex items-center space-x-4 mt-3">
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                  student.enrollment_type === 'exceptional' 
                    ? 'bg-amber-100 text-amber-800' 
                    : 'bg-blue-100 text-blue-800'
                }`}>
                  {student.enrollment_type === 'exceptional' ? 'Matrícula Excepcional' : 'Matrícula Regular'}
                </span>
                {student.enrollment_date && (
                  <span className="text-sm text-slate-600">
                    📅 Matrícula: {forceDateToDisplay(student.enrollment_date)}
                  </span>
                )}
              </div>
              
              <div className="flex items-center space-x-4 mt-3">
                <span className="text-sm text-slate-600">
                  Presenças: <span className="font-bold text-green-600">{presentCount}</span> / {totalClassesGiven} aulas
                </span>
                <span className={`text-sm font-bold ${percentage >= 60 ? 'text-green-600' : 'text-red-600'}`}>
                  {percentage.toFixed(1)}%
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Total de aulas realizadas na turma: {totalClassesGiven} de {classData.total_classes}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 text-3xl p-1"
            >
              ×
            </button>
          </div>

          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Aula</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Data</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-slate-700">Status</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-slate-700">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {attendanceRecords.map((record) => (
                  <tr key={record.id} className="hover:bg-slate-50">
                    {editingRecord === record.id ? (
                      <>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            min="1"
                            max={classData.total_classes}
                            value={editData?.classNumber || 1}
                            onChange={(e) => setEditData({ ...editData!, classNumber: parseInt(e.target.value) })}
                            className="w-20 px-2 py-1 border border-slate-300 rounded focus:ring-2 focus:ring-green-500 text-sm"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="date"
                            value={editData?.classDate || ''}
                            onChange={(e) => setEditData({ ...editData!, classDate: e.target.value })}
                            min={cycleStartDate}
                            max={cycleEndDate}
                            className="px-2 py-1 border border-slate-300 rounded focus:ring-2 focus:ring-green-500 text-sm"
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <select
                            value={editData?.present ? 'true' : 'false'}
                            onChange={(e) => setEditData({ ...editData!, present: e.target.value === 'true' })}
                            className="px-2 py-1 border border-slate-300 rounded focus:ring-2 focus:ring-green-500 text-sm"
                          >
                            <option value="true">Presente</option>
                            <option value="false">Ausente</option>
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center space-x-2">
                            <button
                              onClick={() => handleSaveEdit(record.id)}
                              className="p-1 text-green-600 hover:bg-green-50 rounded"
                              title="Salvar"
                            >
                              <Save className="w-5 h-5" />
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="p-1 text-slate-600 hover:bg-slate-50 rounded"
                              title="Cancelar"
                            >
                              <X className="w-5 h-5" />
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 text-sm text-slate-800">Aula {record.class_number}</td>
                        <td className="px-4 py-3 text-sm text-slate-800">
                          {formatDateToDisplay(record.class_date)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            record.present
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {record.present ? 'Presente' : 'Ausente'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center space-x-2">
                            <button
                              onClick={() => handleEdit(record)}
                              className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                              title="Editar"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(record.id)}
                              className="p-1 text-red-600 hover:bg-red-50 rounded"
                              title="Excluir"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
                {attendanceRecords.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-12 text-center text-slate-500">
                      <p>Nenhuma frequência lançada ainda</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              onClick={onClose}
              className="px-6 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ===========================================
// COMPONENTE: EADAccessManagement
// PROPÓSITO: Gerenciar acessos EAD com separação total entre:
//            - Datas de acesso (botão AZUL)
//            - Status de frequência (botão VERDE)
// VERSÃO: Corrigida - Usa is_frequente do banco
// ===========================================

function EADAccessManagement({ classData, students, onUpdate }: any) {
  // Estados para controle dos dados
  const [accessData, setAccessData] = useState<Record<string, any>>({});
  const [frequenciaStatus, setFrequenciaStatus] = useState<Record<string, boolean>>({});
  const [studentSearchTerm, setStudentSearchTerm] = useState('');
  const [cycleStartDate, setCycleStartDate] = useState<string>('');
  const [cycleEndDate, setCycleEndDate] = useState<string>('');
  const [cycleStatus, setCycleStatus] = useState<string>('');
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  // ===========================================
  // EFFECT: Carregar dados do ciclo
  // ===========================================
  useEffect(() => {
    loadCycleDates();
  }, [classData.cycle_id]);

  // ===========================================
  // FUNÇÃO: Carregar datas do ciclo
  // ===========================================
  const loadCycleDates = async () => {
    try {
      const { data, error } = await supabase
        .from('cycles')
        .select('start_date, end_date, status')
        .eq('id', classData.cycle_id)
        .single();

      if (error) {
        console.error('Erro ao carregar ciclo:', error);
        return;
      }

      if (data) {
        setCycleStartDate(data.start_date);
        setCycleEndDate(data.end_date);
        setCycleStatus(data.status);
      }
    } catch (error) {
      console.error('Erro inesperado ao carregar ciclo:', error);
    }
  };

  // ===========================================
  // EFFECT: Inicializar estados quando students mudar
  // CORREÇÃO CRÍTICA: Usar isFrequente em vez de isPresent
  // ===========================================
  useEffect(() => {
    if (!students || students.length === 0) {
      setAccessData({});
      setFrequenciaStatus({});
      return;
    }

    const initialAccess: Record<string, any> = {};
    const initialFrequencia: Record<string, boolean> = {};
    
    students.forEach((student: any) => {
      // Inicializar datas de acesso
      initialAccess[student.student_id] = {
        access_date_1: student.accessData?.access_date_1 
          ? formatDateForInput(student.accessData.access_date_1) 
          : '',
        access_date_2: student.accessData?.access_date_2 
          ? formatDateForInput(student.accessData.access_date_2) 
          : '',
        access_date_3: student.accessData?.access_date_3 
          ? formatDateForInput(student.accessData.access_date_3) 
          : '',
      };
      
      // ✅ CORREÇÃO: Usar isFrequente do banco
      initialFrequencia[student.student_id] = student.isFrequente === true;
    });
    
    setAccessData(initialAccess);
    setFrequenciaStatus(initialFrequencia);
    
  }, [students]);

  // ===========================================
  // FUNÇÃO: Validar data de acesso
  // ===========================================
  const validateAccessDate = (date: string, fieldName: string): boolean => {
    if (!date) return true;
    
    if (!isValidDate(date)) {
      alert(`❌ Data inválida em ${fieldName}: ${date}. Use o formato DD/MM/AAAA`);
      return false;
    }
    
    const dateISO = parseDateInput(date);
    const today = new Date().toISOString().split('T')[0];
    
    if (cycleStartDate && dateISO < cycleStartDate) {
      alert(`❌ ${fieldName} não pode ser anterior a ${formatDateForInput(cycleStartDate)}`);
      return false;
    }

    if (cycleEndDate && dateISO > cycleEndDate) {
      alert(`❌ ${fieldName} não pode ser posterior a ${formatDateForInput(cycleEndDate)}`);
      return false;
    }

    if (dateISO > today) {
      alert(`❌ ${fieldName} não pode ser uma data futura`);
      return false;
    }

    return true;
  };

  // ===========================================
  // FUNÇÃO: Alternar checkbox de frequência
  // ===========================================
  const toggleFrequencia = (studentId: string) => {
    setFrequenciaStatus(prev => ({
      ...prev,
      [studentId]: !prev[studentId]
    }));
  };

  // ===========================================
  // FUNÇÃO: Salvar APENAS acessos (NUNCA altera frequência)
  // ===========================================
  const handleSaveAccess = async (studentId: string) => {
    setLoading(prev => ({ ...prev, [studentId]: true }));
    
    try {
      const data = accessData[studentId];
      
      if (!data) {
        throw new Error('Dados de acesso não encontrados');
      }

      // Validar datas
      const datesToValidate = [
        { value: data.access_date_1, field: 'Acesso 1' },
        { value: data.access_date_2, field: 'Acesso 2' },
        { value: data.access_date_3, field: 'Acesso 3' }
      ].filter(item => item.value);

      for (const item of datesToValidate) {
        if (!validateAccessDate(item.value, item.field)) {
          setLoading(prev => ({ ...prev, [studentId]: false }));
          return;
        }
      }

      // Buscar status atual para PRESERVAR
      const { data: currentData } = await supabase
        .from('ead_access')
        .select('is_frequente')
        .eq('class_id', classData.id)
        .eq('student_id', studentId)
        .maybeSingle();

      // ✅ GARANTIA: Preservar o status atual
      const isFrequenteAtual = currentData?.is_frequente ?? false;

      // Converter datas para ISO
      const accessDataISO = {
        access_date_1: data.access_date_1 ? parseDateInput(data.access_date_1) : null,
        access_date_2: data.access_date_2 ? parseDateInput(data.access_date_2) : null,
        access_date_3: data.access_date_3 ? parseDateInput(data.access_date_3) : null,
      };

      // Salvar no banco
      const { error } = await supabase
        .from('ead_access')
        .upsert(
          {
            class_id: classData.id,
            student_id: studentId,
            access_date_1: accessDataISO.access_date_1,
            access_date_2: accessDataISO.access_date_2,
            access_date_3: accessDataISO.access_date_3,
            is_frequente: isFrequenteAtual,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'class_id,student_id' }
        );

      if (error) throw error;

      alert('✅ Acessos salvos! O status de frequência não foi alterado.');
      await onUpdate();

    } catch (error: any) {
      console.error('❌ Erro ao salvar acessos:', error);
      alert(`Erro: ${error.message}`);
    } finally {
      setLoading(prev => ({ ...prev, [studentId]: false }));
    }
  };

  // ===========================================
  // FUNÇÃO: Salvar APENAS frequência (NUNCA altera acessos)
  // ===========================================
  const handleSaveFrequencia = async (studentId: string) => {
    setLoading(prev => ({ ...prev, [studentId]: true }));
    
    try {
      const isFrequente = frequenciaStatus[studentId];

      // Buscar acessos atuais para PRESERVAR
      const { data: currentAccess } = await supabase
        .from('ead_access')
        .select('access_date_1, access_date_2, access_date_3')
        .eq('class_id', classData.id)
        .eq('student_id', studentId)
        .maybeSingle();

      // ✅ GARANTIA: Preservar as datas existentes
      const accessDataISO = {
        access_date_1: currentAccess?.access_date_1 || null,
        access_date_2: currentAccess?.access_date_2 || null,
        access_date_3: currentAccess?.access_date_3 || null,
      };

      // Salvar no banco
      const { error } = await supabase
        .from('ead_access')
        .upsert(
          {
            class_id: classData.id,
            student_id: studentId,
            access_date_1: accessDataISO.access_date_1,
            access_date_2: accessDataISO.access_date_2,
            access_date_3: accessDataISO.access_date_3,
            is_frequente: isFrequente,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'class_id,student_id' }
        );

      if (error) throw error;

      alert(isFrequente ? '✅ Aluno marcado como FREQUENTE!' : '✅ Aluno marcado como NÃO FREQUENTE!');
      await onUpdate();

    } catch (error: any) {
      console.error('❌ Erro ao salvar frequência:', error);
      alert(`Erro: ${error.message}`);
    } finally {
      setLoading(prev => ({ ...prev, [studentId]: false }));
    }
  };

  // ===========================================
  // FUNÇÃO: Formatar data enquanto digita
  // ===========================================
  const handleDateChange = (studentId: string, field: string, value: string) => {
    const formatted = formatDateInput(value);
    setAccessData({
      ...accessData,
      [studentId]: {
        ...accessData[studentId],
        [field]: formatted,
      },
    });
  };

  // ===========================================
  // RENDERIZAÇÃO
  // ===========================================
  
  const today = new Date().toISOString().split('T')[0];
  const isCycleActive = cycleStatus === 'active' && today <= cycleEndDate;
  
  const filteredStudents = students.filter((student: any) => {
    if (!studentSearchTerm) return true;
    const search = studentSearchTerm.toLowerCase();
    return student.students?.full_name?.toLowerCase().includes(search);
  });

  return (
    <div className="space-y-6">
      {/* Header com informações do ciclo */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex justify-between items-center">
          <div>
            <h4 className="font-semibold text-blue-800">Controle de Acessos EAD</h4>
            <p className="text-sm text-blue-600 mt-1">
              Período: {formatDateToDisplay(cycleStartDate)} até {formatDateToDisplay(cycleEndDate)}
            </p>
          </div>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${
            isCycleActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'
          }`}>
            {isCycleActive ? 'Ciclo Ativo' : 'Ciclo Encerrado'}
          </span>
        </div>
      </div>

      {/* Legenda das funções */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h5 className="font-semibold text-blue-800 mb-2">
            🔵 Salvar Acessos
          </h5>
          <p className="text-sm text-blue-700">
            Registra apenas as datas de acesso. Não altera o status de frequência.
          </p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <h5 className="font-semibold text-green-800 mb-2">
            ✅ Salvar Frequência
          </h5>
          <p className="text-sm text-green-700">
            Define se o aluno é frequente. Não altera as datas de acesso.
          </p>
        </div>
      </div>

      {/* Barra de busca */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input
          type="text"
          placeholder="Buscar aluno por nome..."
          value={studentSearchTerm}
          onChange={(e) => setStudentSearchTerm(e.target.value)}
          className="w-full pl-12 pr-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500"
        />
      </div>

      {/* Tabela de alunos */}
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <div className="max-h-[500px] overflow-y-auto">
          <table className="w-full">
            <thead className="bg-slate-50 sticky top-0">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">Aluno</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">Acesso 1</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">Acesso 2</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">Acesso 3</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">Frequência</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredStudents.map((student: any) => {
                const isFrequente = frequenciaStatus[student.student_id] || false;
                const isLoading = loading[student.student_id] || false;

                return (
                  <tr key={student.id} className="hover:bg-slate-50">
                    {/* Nome do aluno */}
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-800">
                        {student.students?.full_name}
                      </div>
                      {student.enrollment_date && (
                        <div className="text-xs text-slate-500 mt-1">
                          Mat: {forceDateToDisplay(student.enrollment_date)}
                        </div>
                      )}
                    </td>
                    
                    {/* Campos de acesso */}
                    {[1, 2, 3].map((num) => (
                      <td key={num} className="px-6 py-4">
                        <input
                          type="text"
                          value={accessData[student.student_id]?.[`access_date_${num}`] || ''}
                          onChange={(e) => handleDateChange(student.student_id, `access_date_${num}`, e.target.value)}
                          placeholder="DD/MM/AAAA"
                          maxLength={10}
                          disabled={!isCycleActive || isLoading}
                          className="w-24 px-2 py-1 border rounded text-sm"
                        />
                      </td>
                    ))}
                    
                    {/* Checkbox de frequência */}
                    <td className="px-6 py-4">
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={isFrequente}
                          onChange={() => toggleFrequencia(student.student_id)}
                          disabled={!isCycleActive || isLoading}
                          className="w-4 h-4 text-green-600 rounded"
                        />
                        <span className="text-sm">
                          {isFrequente ? 'Frequente' : 'Não frequente'}
                        </span>
                      </label>
                    </td>
                    
                    {/* Botões de ação */}
                    <td className="px-6 py-4">
                      <div className="flex flex-col space-y-2">
                        <button
                          onClick={() => handleSaveAccess(student.student_id)}
                          disabled={!isCycleActive || isLoading}
                          className={`px-3 py-1 text-white rounded text-sm ${
                            isCycleActive && !isLoading
                              ? 'bg-blue-600 hover:bg-blue-700'
                              : 'bg-slate-400 cursor-not-allowed'
                          }`}
                        >
                          {isLoading ? '...' : 'Salvar Acessos'}
                        </button>
                        <button
                          onClick={() => handleSaveFrequencia(student.student_id)}
                          disabled={!isCycleActive || isLoading}
                          className={`px-3 py-1 text-white rounded text-sm ${
                            isCycleActive && !isLoading
                              ? 'bg-green-600 hover:bg-green-700'
                              : 'bg-slate-400 cursor-not-allowed'
                          }`}
                        >
                          {isLoading ? '...' : 'Salvar Frequência'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              
              {filteredStudents.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    Nenhum aluno encontrado
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Rodapé com resumo */}
      {filteredStudents.length > 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
          <div className="flex justify-between text-sm">
            <span>Total: {filteredStudents.length}</span>
            <span>Frequentes: {Object.values(frequenciaStatus).filter(Boolean).length}</span>
            <span>Não frequentes: {Object.values(frequenciaStatus).filter(v => !v).length}</span>
          </div>
        </div>
      )}
    </div>
  );
}

