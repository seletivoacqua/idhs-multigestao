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

function validateEADAccess(access_date_1: string | null, access_date_2: string | null, access_date_3: string | null): boolean {
  const dates = [access_date_1, access_date_2, access_date_3].filter(Boolean);

  if (dates.length < 3) {
    return false;
  }

  const months = dates.map(date => {
    const d = new Date(date! + 'T00:00:00');
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const uniqueMonths = new Set(months);

  return uniqueMonths.size === 3;
}

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
      .eq('user_id', user.id)
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
      .select('id, modality')
      .eq('cycle_id', cycleId);

    if (classes) {
      for (const cls of classes) {
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

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto">
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
      .eq('user_id', user.id)
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
      .eq('user_id', user.id)
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
      <div className="bg-white rounded-xl shadow-xl w-[95vw] max-w-[1400px] p-6 my-8 max-h-[85vh] overflow-y-auto">
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
                      <span>{cls.total_classes} aulas no ciclo</span>
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
            <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto">
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
                          Dias da Semana (selecione múltiplos se necessário)
                        </label>
                        <div className="grid grid-cols-2 gap-2">
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
                        <label className="block text-sm font-medium text-slate-700 mb-2">Total de Aulas no Ciclo</label>
                        <input
                          type="number"
                          value={formData.total_classes}
                          onChange={(e) => setFormData({ ...formData, total_classes: e.target.value })}
                          required
                          min="1"
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        />
                      </div>
                    </>
                  )}

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
                      Criar Turma
                    </button>
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
interface ClassManagementModalProps {
  classData: Class;
  onClose: () => void;
}

function ClassManagementModal({ classData, onClose }: ClassManagementModalProps) {
  const [tab, setTab] = useState<'students' | 'attendance' | 'close'>('students');
  const [students, setStudents] = useState<any[]>([]);
  const [availableStudents, setAvailableStudents] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showCertificate, setShowCertificate] = useState(false);
  const [certificateData, setCertificateData] = useState<any>(null);
  const { user } = useAuth();

  useEffect(() => {
    loadClassStudents();
    loadAvailableStudents();
  }, []);

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
          const { count: presentCount } = await supabase
            .from('attendance')
            .select('*', { count: 'exact', head: true })
            .eq('class_id', classData.id)
            .eq('student_id', cs.student_id)
            .eq('present', true);

          const percentage = ((presentCount || 0) / classData.total_classes) * 100;

          return {
            ...cs,
            attendanceCount: presentCount || 0,
            attendancePercentage: percentage,
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
      .eq('user_id', user.id)
      .order('full_name');

    if (error) {
      console.error('Error loading students:', error);
      return;
    }

    const enrolledIds = students.map((s) => s.student_id);
    const available = (data || []).filter((s) => !enrolledIds.includes(s.id));

    setAvailableStudents(available);
  };

  const handleEnrollStudent = async () => {
    if (!selectedStudent) return;

    const { error } = await supabase.from('class_students').insert([
      {
        class_id: classData.id,
        student_id: selectedStudent,
      },
    ]);

    if (error) {
      console.error('Error enrolling student:', error);
      alert('Erro ao matricular aluno');
      return;
    }

    if (classData.modality === 'EAD') {
      await supabase.from('ead_access').insert([
        {
          class_id: classData.id,
          student_id: selectedStudent,
        },
      ]);
    }

    setSelectedStudent('');
    loadClassStudents();
    loadAvailableStudents();
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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      {/* MODAL PRINCIPAL - AUMENTADO */}
      <div className="bg-white rounded-xl shadow-xl w-[95vw] max-w-[1400px] p-6 my-8 max-h-[85vh] overflow-y-auto">
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
                Encerrar Ciclo
              </button>
            )}
          </nav>
        </div>

        {/* CONTEÚDO DAS ABAS COM MAIOR ALTURA */}
        <div className="min-h-[500px]">
          {tab === 'students' && (
            <div className="space-y-6">
              <div className="flex gap-4">
                <select
                  value={selectedStudent}
                  onChange={(e) => setSelectedStudent(e.target.value)}
                  className="flex-1 px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-base"
                >
                  <option value="">Selecione um aluno para matricular</option>
                  {availableStudents.map((student) => (
                    <option key={student.id} value={student.id}>
                      {student.full_name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleEnrollStudent}
                  disabled={!selectedStudent}
                  className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  Matricular Aluno
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
                        .map((student) => (
                        <tr key={student.id} className="hover:bg-slate-50">
                          <td className="px-6 py-4 text-sm text-slate-800">
                            <div className="font-medium">{student.students.full_name}</div>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">
                            {student.students.cpf || '-'}
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                              Matriculado
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
                      ))}
                      {students.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                            <div className="flex flex-col items-center">
                              <User className="w-12 h-12 text-slate-300 mb-3" />
                              <p className="text-lg">Nenhum aluno matriculado nesta turma</p>
                            </div>
                          </td>
                        </tr>
                      )}
                      {students.length > 0 && students.filter((student) => {
                        if (!searchTerm) return true;
                        const search = searchTerm.toLowerCase();
                        return (
                          student.students.full_name.toLowerCase().includes(search) ||
                          student.students.cpf?.toLowerCase().includes(search)
                        );
                      }).length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                            <div className="flex flex-col items-center">
                              <Search className="w-12 h-12 text-slate-300 mb-3" />
                              <p className="text-lg">Nenhum aluno encontrado com esse termo</p>
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
                onUpdate={loadClassStudents}
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
                    <p className="text-sm text-amber-700">Status</p>
                    <p className="text-2xl font-bold text-amber-800">Ativo</p>
                  </div>
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
                          {classData.modality === 'EAD' ? 'Status de Acesso' : 'Frequência'}
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
                      {students.map((student) => {
                        const canCertify =
                          classData.modality === 'VIDEOCONFERENCIA'
                            ? student.attendancePercentage >= 60
                            : student.isPresent;

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
                                          : 'bg-red-500'
                                      }`}
                                      style={{ width: `${Math.min(student.attendancePercentage, 100)}%` }}
                                    ></div>
                                  </div>
                                  <span
                                    className={`font-semibold ${
                                      student.attendancePercentage >= 60
                                        ? 'text-green-700'
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
                                      : 'bg-red-100 text-red-800'
                                  }`}
                                >
                                  {student.isPresent ? 'Aprovado (3 acessos em meses distintos)' : 'Reprovado'}
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-sm text-slate-600">
                              {classData.modality === 'VIDEOCONFERENCIA' ? (
                                <div className="flex flex-col">
                                  <span className="font-medium">
                                    {student.attendanceCount} de {classData.total_classes} aulas
                                  </span>
                                  <span className="text-xs text-slate-500">
                                    Presenças registradas
                                  </span>
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
                                    {student.isPresent ? 'Acessos em meses distintos' : 'Necessário 3 acessos em meses diferentes'}
                                  </span>
                                </div>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              {canCertify ? (
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
                <button
                  onClick={handleCloseClass}
                  className="w-full px-6 py-4 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors font-bold text-lg shadow-md"
                >
                  Encerrar Turma e Finalizar Ciclo
                </button>
                <p className="text-sm text-slate-500 text-center mt-3">
                  Ao encerrar a turma, não será possível adicionar novas aulas ou alunos
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

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
    </div>
  );
}

function VideoconferenciaAttendance({ classData, students, onUpdate }: any) {
  const [classNumber, setClassNumber] = useState(1);
  const [classDate, setClassDate] = useState(new Date().toISOString().split('T')[0]);
  const [attendance, setAttendance] = useState<Record<string, boolean>>({});
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  const handleSaveAttendance = async () => {
    if (!confirm('Salvar frequência para esta aula?')) return;

    for (const student of students) {
      const present = attendance[student.student_id] || false;

      await supabase.from('attendance').upsert(
        [
          {
            class_id: classData.id,
            student_id: student.student_id,
            class_number: classNumber,
            class_date: classDate,
            present,
          },
        ],
        { onConflict: 'class_id,student_id,class_number' }
      );
    }

    alert('Frequência registrada com sucesso!');
    setAttendance({});
    onUpdate();
  };

  const handleViewDetails = (student: any) => {
    setSelectedStudent(student);
    setShowDetailsModal(true);
  };

  return (
    <>
      <div className="grid grid-cols-3 gap-6 mb-6">
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
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Data da Aula
          </label>
          <input
            type="date"
            value={classDate}
            onChange={(e) => setClassDate(e.target.value)}
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

      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <div className="max-h-[400px] overflow-y-auto">
          <table className="w-full min-w-full">
            <thead className="bg-slate-50 sticky top-0">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700 uppercase tracking-wider">
                  Aluno
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
              {students.map((student: any) => (
                <tr key={student.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 text-sm text-slate-800">
                    {student.students.full_name}
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
              ))}
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

interface AttendanceDetailsModalProps {
  classData: Class;
  student: any;
  onClose: () => void;
}

function AttendanceDetailsModal({ classData, student, onClose }: AttendanceDetailsModalProps) {
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
  const [editingRecord, setEditingRecord] = useState<string | null>(null);
  const [editData, setEditData] = useState<{ classNumber: number; classDate: string; present: boolean } | null>(null);

  useEffect(() => {
    loadAttendanceRecords();
  }, []);

  const loadAttendanceRecords = async () => {
    const { data, error } = await supabase
      .from('attendance')
      .select('*')
      .eq('class_id', classData.id)
      .eq('student_id', student.student_id)
      .order('class_number', { ascending: true });

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

  const handleSaveEdit = async (recordId: string) => {
    if (!editData) return;

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

  const presentCount = attendanceRecords.filter(r => r.present).length;
  const percentage = (presentCount / classData.total_classes) * 100;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[85vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h3 className="text-2xl font-bold text-slate-800">Detalhes de Frequência</h3>
              <p className="text-lg text-slate-600 mt-1">{student.students.full_name}</p>
              <div className="flex items-center space-x-4 mt-3">
                <span className="text-sm text-slate-600">
                  Presenças: <span className="font-bold text-green-600">{presentCount}</span> / {classData.total_classes}
                </span>
                <span className={`text-sm font-bold ${percentage >= 60 ? 'text-green-600' : 'text-red-600'}`}>
                  {percentage.toFixed(1)}%
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

function EADAccessManagement({ classData, students, onUpdate }: any) {
  const [accessData, setAccessData] = useState<Record<string, any>>({});

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

  const handleSaveAccess = async (studentId: string) => {
    const data = accessData[studentId];

    await supabase
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

    alert('Acessos atualizados!');
    onUpdate();
  };

  const handleSaveAll = async () => {
    if (!confirm('Salvar todos os acessos?')) return;
    
    for (const student of students) {
      const data = accessData[student.student_id];
      
      if (data) {
        await supabase
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
      }
    }
    
    alert('Todos os acessos foram salvos!');
    onUpdate();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-4">
        <h4 className="text-lg font-semibold text-slate-800">Controle de Acessos EAD</h4>
        <button
          onClick={handleSaveAll}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
        >
          Salvar Todos
        </button>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
        <p className="text-sm text-amber-800">
          <strong>Atenção:</strong> Para aprovação no curso EAD, o aluno deve realizar <strong>3 acessos em meses diferentes</strong>.
          Se 2 ou 3 acessos forem registrados no mesmo mês, o aluno será considerado reprovado.
        </p>
      </div>

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
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {students.map((student: any) => (
                <tr key={student.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 text-sm text-slate-800">
                    {student.students.full_name}
                  </td>
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
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm"
                      />
                    </td>
                  ))}
                  <td className="px-6 py-4">
                    <button
                      onClick={() => handleSaveAccess(student.student_id)}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                    >
                      Salvar
                    </button>
                  </td>
                </tr>
              ))}
              {students.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
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
