import { useState, useEffect } from 'react';
import { Plus, Calendar, Edit2, Save, X, GraduationCap, Users, CheckSquare, Eye, Award, User, Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { CertificateModal } from './CertificateModal';
import { CertificateModalEAD } from './CertificateModalEAD';

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
  return dates.length === 3; // ✅ Apenas 3 acessos, qualquer data
}

// Função para contar aulas já realizadas
async function getTotalClassesGiven(classId: string): Promise<number> {
  const { data } = await supabase
    .from('attendance')
    .select('class_number')
    .eq('class_id', classId);

  if (!data) return 0;
  
  const uniqueClasses = [...new Set(data.map(a => a.class_number))];
  return uniqueClasses.length;
}

// ===========================================
// FUNÇÃO CORRIGIDA - VIDEOCONFERÊNCIA
// SEM REPOSIÇÕES, APENAS DATAS
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
  
  // 1. Buscar todas as frequências do aluno
  const { data: attendances } = await supabase
    .from('attendance')
    .select('class_date, present')
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

  // 2. Se for matrícula excepcional, filtrar por data
  let filteredAttendances = attendances;
  let isProportional = false;

  if (enrollmentDate) {
    isProportional = true;
    // ✅ filtra aulas com data >= data da matrícula
    filteredAttendances = attendances.filter(a => 
      a.class_date >= enrollmentDate
    );
  }

  // 3. Calcular presenças
  const presentCount = filteredAttendances.filter(a => a.present).length;
  const totalClassesToConsider = filteredAttendances.length;
  
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
// FUNÇÃO CORRIGIDA - ATUALIZAR STATUS
// ===========================================
async function updateStudentStatusOnClose(
  classId: string, 
  studentId: string, 
  classData?: any, 
  studentData?: any
) {
  try {
    // Buscar dados se não fornecidos
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

    // Buscar ciclo
    const { data: cycleData } = await supabase
      .from('cycles')
      .select('*')
      .eq('id', classData.cycle_id)
      .single();

    const today = new Date().toISOString().split('T')[0];
    const isCycleActive = cycleData?.status === 'active' && today <= cycleData?.end_date;

    // Se o ciclo ainda estiver ativo, não calcular status final
    if (isCycleActive) {
      return 'em_andamento';
    }

    let currentStatus = 'em_andamento';
    let isApproved = false;

    if (classData.modality === 'VIDEOCONFERENCIA') {
      // ✅ Usar studentData que já foi buscado
      const enrollmentDate = studentData?.enrollment_date?.split('T')[0];
      const isExceptional = studentData?.enrollment_type === 'exceptional';
      
      // 🔥 LOG para debug
      console.log('📊 Calculando status - aluno:', {
        studentId,
        nome: studentData?.students?.full_name,
        tipo: isExceptional ? 'EXCEPCIONAL' : 'REGULAR',
        dataMatricula: enrollmentDate,
        classId
      });

      const { percentage, presentCount, totalClassesToConsider, isProportional } = 
        await calculateAttendancePercentage(
          classId, 
          studentId, 
          isExceptional ? enrollmentDate : null
        );
      
      isApproved = percentage >= 60;
      
      console.log(`📈 Resultado: ${percentage.toFixed(1)}% (${presentCount}/${totalClassesToConsider} aulas) - ${isApproved ? '✅ APROVADO' : '❌ REPROVADO'}`);
      
    } else {
      // EAD: 3 acessos (qualquer data)
      const { data: accessData } = await supabase
        .from('ead_access')
        .select('*')
        .eq('class_id', classId)
        .eq('student_id', studentId)
        .single();

      const accessCount = [
        accessData?.access_date_1,
        accessData?.access_date_2,
        accessData?.access_date_3
      ].filter(Boolean).length;
      
      isApproved = accessCount === 3;
    }

    currentStatus = isApproved ? 'aprovado' : 'reprovado';

    // Atualizar status no banco
    await supabase
      .from('class_students')
      .update({
        current_status: currentStatus,
        status_updated_at: new Date().toISOString()
      })
      .eq('class_id', classId)
      .eq('student_id', studentId);

    return currentStatus;
  } catch (error) {
    console.error('Error updating student status:', error);
    return null;
  }
}

// ===========================================
// FUNÇÃO CORRIGIDA - ATUALIZAR TURMA INTEIRA
// ===========================================
async function updateAllStudentsStatusOnClose(classId: string) {
  try {
    // Buscar dados da turma
    const { data: classData } = await supabase
      .from('classes')
      .select('*, cycles(*)')
      .eq('id', classId)
      .single();

    // Contar aulas dadas
    const { data: attendanceData } = await supabase
      .from('attendance')
      .select('class_number')
      .eq('class_id', classId);

    const uniqueClasses = [...new Set(attendanceData?.map(a => a.class_number) || [])];
    const totalClassesGiven = uniqueClasses.length;

    // Verificar se todas as aulas foram dadas (alerta)
    if (totalClassesGiven < classData.total_classes) {
      const confirm = window.confirm(
        `Atenção: Foram dadas apenas ${totalClassesGiven} de ${classData.total_classes} aulas. ` +
        `Deseja encerrar mesmo assim? Os alunos serão avaliados com base nas aulas realizadas.`
      );
      if (!confirm) return;
    }

    // Buscar todos os alunos da turma
    const { data: students } = await supabase
      .from('class_students')
      .select('student_id, enrollment_date, enrollment_type')
      .eq('class_id', classId);

    if (!students) return;

    // Atualizar um por um
    for (const student of students) {
      await updateStudentStatusOnClose(classId, student.student_id, classData, student);
    }

    // Fechar a turma
    await supabase
      .from('classes')
      .update({ status: 'closed' })
      .eq('id', classId);

    alert('Turma encerrada e status dos alunos atualizados!');
    
  } catch (error) {
    console.error('Error updating all students status:', error);
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
                  Início: {new Date(cycle.start_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <Calendar className="w-4 h-4" />
                <span>
                  Fim: {new Date(cycle.end_date + 'T00:00:00').toLocaleDateString('pt-BR')}
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

      {/* Modal de Criar/Editar Ciclo */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl 
            w-[95vw] sm:w-[80vw] md:w-[60vw] lg:w-[50vw] xl:w-[40vw] max-w-2xl 
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
        w-[95vw] md:w-[90vw] lg:w-[85vw] xl:w-[80vw] max-w-7xl 
        p-4 md:p-6 my-4 md:my-8 max-h-[95vh] md:max-h-[90vh] overflow-y-auto">
        
        <div className="flex justify-between items-start mb-6">
          <div>
            <h3 className="text-2xl font-bold text-slate-800">Gerenciar Turmas</h3>
            <p className="text-slate-600 text-lg">{cycle.name}</p>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-sm text-slate-600">
                {new Date(cycle.start_date + 'T00:00:00').toLocaleDateString('pt-BR')} até {new Date(cycle.end_date + 'T00:00:00').toLocaleDateString('pt-BR')}
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

        {/* Modal de Criar Nova Turma */}
        {showClassModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
            <div className="bg-white rounded-xl shadow-xl 
              w-[95vw] md:w-[80vw] lg:w-[70vw] xl:w-[60vw] max-w-3xl
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
interface ClassManagementModalProps {
  classData: Class;
  onClose: () => void;
}

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
  const [cycleStartDate, setCycleStartDate] = useState<string>('');
  const [cycleEndDate, setCycleEndDate] = useState<string>('');
  const [cycleStatus, setCycleStatus] = useState<string>('');
  const [totalClassesGiven, setTotalClassesGiven] = useState<number>(0);
  const { user } = useAuth();

  useEffect(() => {
    loadCycleData();
    loadClassStudents();
    loadAvailableStudents();
    loadTotalClassesGiven();
  }, []);

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
    setTotalClassesGiven(total);
  };

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
      const studentsWithAttendance = await Promise.all(
        (data || []).map(async (cs) => {
          const enrollmentDate = cs.enrollment_date ? cs.enrollment_date.split('T')[0] : null;
          // ✅ CORRIGIDO: não compara com cycleStartDate
          const isExceptional = cs.enrollment_type === 'exceptional';
          
          const { percentage, presentCount, totalClassesGiven: totalClasses, isProportional } = 
            await calculateAttendancePercentage(
              classData.id, 
              cs.student_id, 
              isExceptional ? enrollmentDate : null
            );

          return {
            ...cs,
            attendanceCount: presentCount,
            attendancePercentage: percentage,
            totalClasses,
            isProportionalCalculation: isProportional,
          };
        })
      );

      setStudents(studentsWithAttendance);
    } else {
      const studentsWithAccess = await Promise.all(
        (data || []).map(async (cs) => {
          const { data: accessData } = await supabase
            .from('ead_access')
            .select('*')
            .eq('class_id', classData.id)
            .eq('student_id', cs.student_id)
            .maybeSingle();

          const isPresent = validateEADAccess(
            accessData?.access_date_1,
            accessData?.access_date_2,
            accessData?.access_date_3
          );

          return {
            ...cs,
            accessData,
            isPresent,
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

  // ✅ Validar se a data está dentro do ciclo
  if (cycleStartDate && enrollmentDate < cycleStartDate) {
    alert(`Data de matrícula não pode ser anterior ao início do ciclo (${new Date(cycleStartDate).toLocaleDateString('pt-BR')})`);
    return;
  }

  if (cycleEndDate && enrollmentDate > cycleEndDate) {
    alert(`Data de matrícula não pode ser posterior ao fim do ciclo (${new Date(cycleEndDate).toLocaleDateString('pt-BR')})`);
    return;
  }

  // ✅ Converter para ISO string com timezone correto
  const enrollmentDateTime = `${enrollmentDate}T00:00:00.000Z`;

  const studentsToEnroll = Array.from(selectedStudents).map(studentId => ({
    class_id: classData.id,
    student_id: studentId,
    enrollment_type: enrollmentType,
    enrollment_date: enrollmentDateTime, // ✅ Agora usa a data selecionada!
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
  
  alert(`${selectedStudents.size} aluno(s) matriculado(s) com sucesso em ${new Date(enrollmentDate).toLocaleDateString('pt-BR')}!`);
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
        w-[95vw] md:w-[90vw] lg:w-[85vw] xl:w-[80vw] max-w-6xl
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
          {/* Aba Alunos */}
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
                                {student.enrollment_type === 'exceptional' && student.enrollment_date && (
                                  <span className="text-xs text-amber-600 mt-1">
                                    ⚖️ {new Date(student.enrollment_date).toLocaleDateString('pt-BR')}
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

          {/* Aba Frequência - Videoconferência */}
          {tab === 'attendance' && classData.modality === 'VIDEOCONFERENCIA' && (
            <div className="space-y-6 min-h-[500px]">
              <VideoconferenciaAttendance
                classData={classData}
                students={students}
                onUpdate={() => {
                  loadClassStudents();
                  loadTotalClassesGiven();
                }}
                totalClassesGiven={totalClassesGiven}
              />
            </div>
          )}

          {/* Aba Acessos - EAD */}
          {tab === 'attendance' && classData.modality === 'EAD' && (
            <div className="min-h-[500px]">
              <EADAccessManagement
                classData={classData}
                students={students}
                onUpdate={loadClassStudents}
              />
            </div>
          )}

          {/* Aba Encerramento */}
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
                                      ? `Matrícula: ${new Date(student.enrollment_date).toLocaleDateString('pt-BR')}`
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

      {/* Modais de Certificado */}
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

      {/* Modal de Matrícula */}
      {showEnrollmentModal && (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
    <div className="bg-white rounded-xl shadow-xl 
      w-[95vw] md:w-[80vw] lg:w-[60vw] xl:w-[50vw] max-w-3xl
      max-h-[90vh] overflow-y-auto">
      
      <div className="p-6">
        {/* HEADER */}
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

        {/* ⚠️ AVISO SOBRE A DATA */}
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

        {/* 📅 CAMPO DE DATA */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Data da Matrícula <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={enrollmentDate}
            onChange={(e) => setEnrollmentDate(e.target.value)}
            min={cycleStartDate}  // Não pode ser antes do ciclo
            max={new Date().toISOString().split('T')[0]}  // Não pode ser futuro
            required
            className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-base"
          />
          <p className="text-xs text-slate-500 mt-2">
            {enrollmentType === 'regular' 
              ? '✅ Pode ser retroativa (data em que o aluno realmente começou)'
              : '📌 Deve ser a data em que o aluno passou a frequentar a turma'}
          </p>
        </div>

        {/* BUSCA DE ALUNOS */}
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

        {/* CONTADOR DE SELECIONADOS */}
        <div className="mb-4 p-3 bg-slate-50 rounded-lg flex justify-between items-center">
          <p className="text-sm text-slate-600">
            {selectedStudents.size} aluno(s) selecionado(s)
          </p>
          {selectedStudents.size > 0 && (
            <p className="text-xs text-green-600">
              ✅ Matrícula em {new Date(enrollmentDate).toLocaleDateString('pt-BR')}
            </p>
          )}
        </div>

        {/* LISTA DE ALUNOS */}
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

        {/* BOTÕES */}
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

// ===========================================
// COMPONENTE - VideoconferenciaAttendance
// ===========================================
function VideoconferenciaAttendance({ classData, students, onUpdate, totalClassesGiven }: any) {
  const [classNumber, setClassNumber] = useState(totalClassesGiven + 1);
  const [classDate, setClassDate] = useState(new Date().toISOString().split('T')[0]);
  const [attendance, setAttendance] = useState<Record<string, boolean>>({});
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [studentSearchTerm, setStudentSearchTerm] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const [cycleStartDate, setCycleStartDate] = useState<string>('');
  const [cycleEndDate, setCycleEndDate] = useState<string>('');

  useEffect(() => {
    loadCycleDates();
    setClassNumber(totalClassesGiven + 1);
  }, [totalClassesGiven]);

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
      setValidationError('Data da aula não pode ser anterior ao início do ciclo');
      return false;
    }

    if (cycleEndDate && classDate > cycleEndDate) {
      setValidationError('Data da aula não pode ser posterior ao fim do ciclo');
      return false;
    }

    const existingClass = students.some((s: any) => 
      s.attendanceRecords?.some((r: any) => r.class_number === classNumber)
    );

    if (existingClass) {
      if (!confirm(`Aula ${classNumber} já possui registros. Deseja sobrescrever?`)) {
        return false;
      }
    }

    return true;
  };

  const handleSaveAttendance = async () => {
    if (!validateAttendance()) return;

    try {
      const { data: maxClassData } = await supabase
        .from('attendance')
        .select('class_number')
        .eq('class_id', classData.id)
        .order('class_number', { ascending: false })
        .limit(1);

      const proximaAula = (maxClassData?.[0]?.class_number || 0) + 1;
      
      console.log('Próxima aula:', proximaAula);

      const records = students.map((student: any) => ({
        class_id: classData.id,
        student_id: student.student_id,
        class_number: proximaAula,
        class_date: classDate,
        present: attendance[student.student_id] || false,
      }));

      const { error } = await supabase
        .from('attendance')
        .upsert(records, { 
          onConflict: 'class_id,student_id,class_number',
          ignoreDuplicates: false 
        });

      if (error) throw error;

      alert(`Aula ${proximaAula} registrada!`);
      setAttendance({});
      onUpdate();
      
    } catch (error: any) {
      console.error('Erro:', error);
      alert(`Erro: ${error.message}`);
    }
  };

  const handleViewDetails = (student: any) => {
    setSelectedStudent(student);
    setShowDetailsModal(true);
  };

  const filteredStudents = students.filter((student: any) => {
    if (!studentSearchTerm) return true;
    const search = studentSearchTerm.toLowerCase();
    return student.students.full_name.toLowerCase().includes(search);
  });

  return (
    <>
      {validationError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600">{validationError}</p>
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
        <p className="text-sm text-blue-800">
          <strong>📊 Aulas realizadas:</strong> {totalClassesGiven} de {classData.total_classes}
        </p>
      </div>

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
            Próxima aula: {totalClassesGiven + 1}
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
            className="w-full px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
          >
            Salvar Frequência
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
              {filteredStudents.map((student: any) => {
                const getEnrollmentTypeInfo = () => {
                  const isExceptional = student.enrollment_type === 'exceptional';
                  const enrollmentDate = student.enrollment_date 
                    ? new Date(student.enrollment_date).toLocaleDateString('pt-BR')
                    : null;
                  
                  return {
                    tipo: isExceptional ? 'Excepcional' : 'Regular',
                    cor: isExceptional ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800',
                    tooltip: isExceptional 
                      ? `Matrícula excepcional em ${enrollmentDate}`
                      : 'Matrícula regular desde o início do ciclo',
                    data: enrollmentDate
                  };
                };

                const enrollmentInfo = getEnrollmentTypeInfo();
                
                return (
                  <tr key={student.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 text-sm text-slate-800">
                      <div className="font-medium">{student.students.full_name}</div>
                    </td>
                    
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span 
                          className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${enrollmentInfo.cor}`}
                          title={enrollmentInfo.tooltip}
                        >
                          {enrollmentInfo.tipo}
                        </span>
                        {enrollmentInfo.data && (
                          <span className="text-xs text-slate-500 mt-1">
                            {enrollmentInfo.data}
                          </span>
                        )}
                        {student.enrollment_type === 'exceptional' && (
                          <span className="text-xs text-amber-600 font-medium mt-1">
                            ⚖️ Proporcional
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
              })}
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
      alert('Data não pode ser anterior ao início do ciclo');
      return false;
    }

    if (cycleEndDate && editData.classDate > cycleEndDate) {
      alert('Data não pode ser posterior ao fim do ciclo');
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
        w-[95vw] md:w-[85vw] lg:w-[75vw] xl:w-[65vw] max-w-5xl
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
                    Data matrícula: {new Date(student.enrollment_date).toLocaleDateString('pt-BR')}
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
                          {new Date(record.class_date + 'T00:00:00').toLocaleDateString('pt-BR')}
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
// COMPONENTE - EADAccessManagement (CORRIGIDO)
// ===========================================
// ===========================================
// COMPONENTE - EADAccessManagement (CORRIGIDO)
// ===========================================
function EADAccessManagement({ classData, students, onUpdate }: any) {
  const [accessData, setAccessData] = useState<Record<string, any>>({});
  const [studentSearchTerm, setStudentSearchTerm] = useState('');
  const [cycleStartDate, setCycleStartDate] = useState<string>('');
  const [cycleEndDate, setCycleEndDate] = useState<string>('');

  // Carregar datas do ciclo
  useEffect(() => {
    loadCycleDates();
  }, [classData.cycle_id]);

  // Inicializar dados de acesso quando students mudar
  useEffect(() => {
    const initial: Record<string, any> = {};
    students.forEach((student: any) => {
      initial[student.student_id] = {
        access_date_1: student.accessData?.access_date_1 || '',
        access_date_2: student.accessData?.access_date_2 || '',
        access_date_3: student.accessData?.access_date_3 || '',
      };
    });
    setAccessData(initial);
  }, [students]);

  const loadCycleDates = async () => {
    try {
      const { data } = await supabase
        .from('cycles')
        .select('start_date, end_date')
        .eq('id', classData.cycle_id)
        .single();

      if (data) {
        setCycleStartDate(data.start_date);
        setCycleEndDate(data.end_date);
      }
    } catch (error) {
      console.error('Erro ao carregar datas do ciclo:', error);
    }
  };

  const validateAccessDate = (date: string): boolean => {
    if (!date) return true;
    
    if (cycleStartDate && date < cycleStartDate) {
      alert(`Data de acesso não pode ser anterior ao início do ciclo (${new Date(cycleStartDate).toLocaleDateString('pt-BR')})`);
      return false;
    }

    if (cycleEndDate && date > cycleEndDate) {
      alert(`Data de acesso não pode ser posterior ao fim do ciclo (${new Date(cycleEndDate).toLocaleDateString('pt-BR')})`);
      return false;
    }

    return true;
  };

  const handleSaveAccess = async (studentId: string) => {
    const data = accessData[studentId];

    // Validar todas as datas
    const dates = [data.access_date_1, data.access_date_2, data.access_date_3].filter(Boolean);
    for (const date of dates) {
      if (!validateAccessDate(date)) return;
    }

    try {
      const { error } = await supabase
        .from('ead_access')
        .upsert(
          [
            {
              class_id: classData.id,
              student_id: studentId,
              access_date_1: data.access_date_1 || null,
              access_date_2: data.access_date_2 || null,
              access_date_3: data.access_date_3 || null,
              updated_at: new Date().toISOString(),
            },
          ],
          { onConflict: 'class_id,student_id' }
        );

      if (error) throw error;

      alert('Acessos atualizados com sucesso!');
      onUpdate();
      
    } catch (error) {
      console.error('Erro ao salvar acessos:', error);
      alert('Erro ao salvar acessos. Tente novamente.');
    }
  };

  const handleSaveAll = async () => {
    if (!confirm('Salvar todos os acessos?')) return;
    
    let successCount = 0;
    let errorCount = 0;

    for (const student of students) {
      const data = accessData[student.student_id];
      
      if (data) {
        // Validar datas
        const dates = [data.access_date_1, data.access_date_2, data.access_date_3].filter(Boolean);
        let isValid = true;
        
        for (const date of dates) {
          if (!validateAccessDate(date)) {
            isValid = false;
            break;
          }
        }

        if (!isValid) {
          errorCount++;
          continue;
        }

        try {
          const { error } = await supabase
            .from('ead_access')
            .upsert(
              [
                {
                  class_id: classData.id,
                  student_id: student.student_id,
                  access_date_1: data.access_date_1 || null,
                  access_date_2: data.access_date_2 || null,
                  access_date_3: data.access_date_3 || null,
                  updated_at: new Date().toISOString(),
                },
              ],
              { onConflict: 'class_id,student_id' }
            );

          if (error) throw error;
          successCount++;
          
        } catch (error) {
          console.error(`Erro ao salvar aluno ${student.students.full_name}:`, error);
          errorCount++;
        }
      }
    }
    
    alert(`Acessos salvos! ${successCount} sucesso(s), ${errorCount} erro(s).`);
    onUpdate();
  };

  const filteredStudents = students.filter((student: any) => {
    if (!studentSearchTerm) return true;
    const search = studentSearchTerm.toLowerCase();
    return student.students?.full_name?.toLowerCase().includes(search);
  });

  return (
    <div className="space-y-6">
      {/* Cabeçalho com botão Salvar Todos */}
      <div className="flex justify-between items-center mb-4">
        <h4 className="text-lg font-semibold text-slate-800">Controle de Acessos EAD</h4>
        <button
          onClick={handleSaveAll}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
        >
          Salvar Todos
        </button>
      </div>

      {/* Banner com a regra EAD */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
        <p className="text-sm text-blue-800">
          <strong>📌 Regra EAD:</strong> O aluno precisa realizar <strong>3 acessos</strong> para ser aprovado.
          {classData.status === 'active' && (
            <span className="block mt-1 text-blue-600">
              Ciclo ativo: os acessos podem ser registrados a qualquer momento.
            </span>
          )}
        </p>
      </div>

      {/* Busca de alunos */}
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

      {/* Tabela de acessos */}
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <div className="max-h-[500px] overflow-y-auto">
          <table className="w-full min-w-full">
            <thead className="bg-slate-50 sticky top-0">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700 uppercase tracking-wider">
                  Aluno
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700 uppercase tracking-wider">
                  Acesso 1
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700 uppercase tracking-wider">
                  Acesso 2
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700 uppercase tracking-wider">
                  Acesso 3
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
              {filteredStudents.map((student: any) => {
                const accessCount = [
                  accessData[student.student_id]?.access_date_1,
                  accessData[student.student_id]?.access_date_2,
                  accessData[student.student_id]?.access_date_3
                ].filter(Boolean).length;

                return (
                  <tr key={student.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 text-sm text-slate-800">
                      {student.students?.full_name || 'Nome não disponível'}
                    </td>
                    
                    {/* Campos de acesso */}
                    {[1, 2, 3].map((num) => (
                      <td key={num} className="px-6 py-4">
                        <input
                          type="date"
                          value={accessData[student.student_id]?.[`access_date_${num}`] || ''}
                          onChange={(e) =>
                            setAccessData({
                              ...accessData,
                              [student.student_id]: {
                                ...accessData[student.student_id],
                                [`access_date_${num}`]: e.target.value,
                              },
                            })
                          }
                          min={cycleStartDate}
                          max={cycleEndDate}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm"
                        />
                      </td>
                    ))}
                    
                    {/* Status */}
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                        accessCount === 3
                          ? 'bg-green-100 text-green-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {accessCount === 3 ? '✅ Aprovado' : `${accessCount}/3 acessos`}
                      </span>
                    </td>
                    
                    {/* Botão Salvar individual */}
                    <td className="px-6 py-4">
                      <button
                        onClick={() => handleSaveAccess(student.student_id)}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                      >
                        Salvar
                      </button>
                    </td>
                  </tr>
                );
              })}
              
              {/* Mensagem quando não há alunos */}
              {students.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center">
                      <User className="w-12 h-12 text-slate-300 mb-3" />
                      <p className="text-lg">Nenhum aluno matriculado</p>
                    </div>
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
